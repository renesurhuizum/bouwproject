// IFC4-export van het projectmodel. Levert een .ifc-bestand dat opent in
// Revit, ArchiCAD, BlenderBIM/Bonsai, Solibri, BIMcollab Zoom, usBIM etc.
//
// Wat erin zit:
//   Project → Site → Gebouw → Bouwlagen (met peil)
//   Muren (met sparingen), deuren, ramen, ruimtes (met NEN 2580-oppervlak),
//   kolommen, stalen balken (I-profiel), trappen, daken, meubilair,
//   elektra (wcd/schakelaar/lichtpunt/verdeler), sanitair, leidingen,
//   kanalen, radiatoren en WTW.
//   Property sets: Pset_WallCommon (dragend, gevel, U-waarde, status
//   bestaand/nieuw/sloop), Pset_DoorCommon/WindowCommon, hoeveelheden
//   (Qto_*BaseQuantities), materialen en de fase uit de planning.
//
// Assenstelsel: plan-x → IFC-X, plan-y (naar beneden op het scherm) → −IFC-Y,
// hoogte → IFC-Z. Eenheden: meter.

import type { Level, Opening, Point, Wall, WallMaterial } from "../domain/types";
import type { LevelModel, ProjectModel } from "../model";
import { BEAM_PROFILE_DIMS, FIXTURE_FOOTPRINT, WALL_MATERIAL_LABEL, WALL_STATUS_LABEL, ELECTRICAL_LABEL, FIXTURE_LABEL, HVAC_LABEL } from "../domain/constants";
import { FURNITURE_DEFAULTS } from "../domain/furniture";
import { buildRoof } from "../roofGeometry";
import { bounds, dist, polygonArea } from "../geometry";
import { isExternalWall, openingU, uFromRc, wallRc, roofRc } from "../thermal";
import { nvoArea } from "../validation";
import { StepWriter, Raw, enumv, typed, ifcGuid, type Ref, type StepValue } from "./step";

const P = (p: Point): [number, number] => [p.x, -p.y];

interface Ctx {
  w: StepWriter;
  body: Ref;
  axis: Ref;
  origin3: Ref;
  zDir: Ref;
  xDir: Ref;
  styles: Map<string, Ref>;
  materials: Map<string, Ref[]>; // materiaalnaam → producten
  materialRefs: Map<string, Ref>;
  phaseName: Map<string, string>;
  psets: { product: Ref; name: string; props: [string, StepValue][] }[];
  qtos: { product: Ref; name: string; q: [string, "length" | "area" | "volume", number][] }[];
}

// ── Geometrie-primitieven ─────────────────────────────────────────────────────

function pt2(c: Ctx, x: number, y: number) {
  return c.w.add("IFCCARTESIANPOINT", [x, y]);
}
function pt3(c: Ctx, x: number, y: number, z: number) {
  return c.w.add("IFCCARTESIANPOINT", [x, y, z]);
}
function dir3(c: Ctx, x: number, y: number, z: number) {
  const l = Math.hypot(x, y, z) || 1;
  return c.w.add("IFCDIRECTION", [x / l, y / l, z / l]);
}
function dir2(c: Ctx, x: number, y: number) {
  const l = Math.hypot(x, y) || 1;
  return c.w.add("IFCDIRECTION", [x / l, y / l]);
}

/** Plaatsing: positie (IFC-coördinaten) + horizontale X-richting. */
function placement(c: Ctx, rel: Ref | null, x: number, y: number, z: number, dx = 1, dy = 0) {
  const a = c.w.add("IFCAXIS2PLACEMENT3D", pt3(c, x, y, z), c.zDir, dx === 1 && dy === 0 ? c.xDir : dir3(c, dx, dy, 0));
  return c.w.add("IFCLOCALPLACEMENT", rel, a);
}

/** Rechthoekig blok in element-lokale coördinaten (center cx,cy; onderkant z). */
function box(c: Ctx, cx: number, cy: number, z: number, sx: number, sy: number, h: number, rot = 0) {
  const pos2 = c.w.add("IFCAXIS2PLACEMENT2D", pt2(c, cx, cy), rot ? dir2(c, Math.cos(rot), Math.sin(rot)) : null);
  const prof = c.w.add("IFCRECTANGLEPROFILEDEF", enumv("AREA"), null, pos2, Math.max(0.001, sx), Math.max(0.001, sy));
  const pos3 = c.w.add("IFCAXIS2PLACEMENT3D", pt3(c, 0, 0, z), null, null);
  return c.w.add("IFCEXTRUDEDAREASOLID", prof, pos3, c.zDir, Math.max(0.001, h));
}

function cylinder(c: Ctx, cx: number, cy: number, z: number, r: number, h: number) {
  const pos2 = c.w.add("IFCAXIS2PLACEMENT2D", pt2(c, cx, cy), null);
  const prof = c.w.add("IFCCIRCLEPROFILEDEF", enumv("AREA"), null, pos2, Math.max(0.001, r));
  const pos3 = c.w.add("IFCAXIS2PLACEMENT3D", pt3(c, 0, 0, z), null, null);
  return c.w.add("IFCEXTRUDEDAREASOLID", prof, pos3, c.zDir, Math.max(0.001, h));
}

/** Profiel geëxtrudeerd langs de lokale X-as (voor balken, leidingen). */
function sweepX(c: Ctx, profile: Ref, length: number) {
  // Profielvlak = lokaal YZ-vlak; profiel-Y = omhoog.
  const pos3 = c.w.add("IFCAXIS2PLACEMENT3D", pt3(c, 0, 0, 0), dir3(c, 1, 0, 0), dir3(c, 0, 1, 0));
  return c.w.add("IFCEXTRUDEDAREASOLID", profile, pos3, c.zDir, Math.max(0.001, length));
}

function polygonProfile(c: Ctx, pts: [number, number][]) {
  const refs = pts.map(([x, y]) => pt2(c, x, y));
  const line = c.w.add("IFCPOLYLINE", [...refs, refs[0]]);
  return c.w.add("IFCARBITRARYCLOSEDPROFILEDEF", enumv("AREA"), null, line);
}

function shape(c: Ctx, items: Ref[], type = "SweptSolid", style?: string, axisLine?: [number, number][]) {
  if (style) {
    const s = c.styles.get(style);
    if (s) for (const it of items) c.w.add("IFCSTYLEDITEM", it, [s], null);
  }
  const reps: Ref[] = [c.w.add("IFCSHAPEREPRESENTATION", c.body, "Body", type, items)];
  if (axisLine) {
    const line = c.w.add("IFCPOLYLINE", axisLine.map(([x, y]) => pt2(c, x, y)));
    reps.unshift(c.w.add("IFCSHAPEREPRESENTATION", c.axis, "Axis", "Curve2D", [line]));
  }
  return c.w.add("IFCPRODUCTDEFINITIONSHAPE", null, null, reps);
}

// ── Stijlen (kleuren in viewers) ──────────────────────────────────────────────

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

function makeStyles(c: Ctx) {
  const defs: Record<string, [string, number]> = {
    "wall-existing": ["#b8b0a2", 0],
    "wall-new": ["#ea580c", 0],
    "wall-demolish": ["#dc2626", 0.7],
    glass: ["#7dd3fc", 0.6],
    frame: ["#f5f5f4", 0],
    door: ["#a16207", 0],
    space: ["#93c5fd", 0.85],
    concrete: ["#a8a8a8", 0],
    steel: ["#6b7280", 0],
    roof: ["#9b4a3a", 0],
    stair: ["#c9a96e", 0],
    furniture: ["#ddd5c8", 0],
    electrical: ["#facc15", 0],
    sanitary: ["#ffffff", 0],
    cold: ["#2563eb", 0],
    hot: ["#dc2626", 0],
    drain: ["#57534e", 0],
    cv: ["#f97316", 0],
    duct: ["#94a3b8", 0],
    heater: ["#e7e5e4", 0],
  };
  for (const [name, [hex, transp]] of Object.entries(defs)) {
    const [r, g, b] = hexRgb(hex);
    const col = c.w.add("IFCCOLOURRGB", null, r, g, b);
    const shading = c.w.add("IFCSURFACESTYLESHADING", col, transp);
    c.styles.set(name, c.w.add("IFCSURFACESTYLE", name, enumv("BOTH"), [shading]));
  }
}

// ── Eigenschappen ─────────────────────────────────────────────────────────────

const bool = (b: boolean) => typed("IFCBOOLEAN", b);
const label = (s: string) => typed("IFCLABEL", s);
const text = (s: string) => typed("IFCTEXT", s);
const len = (m: number) => typed("IFCLENGTHMEASURE", m);
const utrans = (u: number) => typed("IFCTHERMALTRANSMITTANCEMEASURE", u);
const realv = (n: number) => typed("IFCREAL", n);

function pset(c: Ctx, product: Ref, name: string, props: [string, StepValue | undefined][]) {
  const clean = props.filter(([, v]) => v !== undefined) as [string, StepValue][];
  if (clean.length) c.psets.push({ product, name, props: clean });
}

function phaseProps(c: Ctx, product: Ref, phaseId?: string) {
  if (!phaseId) return;
  const n = c.phaseName.get(phaseId);
  if (n) pset(c, product, "Bouwproject_Fasering", [["Fase", label(n)]]);
}

function assignMaterial(c: Ctx, product: Ref, name: string) {
  const list = c.materials.get(name) ?? [];
  list.push(product);
  c.materials.set(name, list);
}

function product(c: Ctx, entity: string, key: string, name: string, place: Ref, rep: Ref | null, extra: StepValue[] = [], objectType: string | null = null): Ref {
  return c.w.add(entity, ifcGuid(key), null, name, null, objectType, place, rep, null, ...extra);
}

// ── Elementen per bouwlaag ────────────────────────────────────────────────────

const STATUS_IFC: Record<Wall["status"], string> = { existing: "EXISTING", new: "NEW", demolish: "DEMOLISH" };

function exportWall(c: Ctx, lm: LevelModel, wall: Wall, storeyPl: Ref, out: Ref[]) {
  const L = dist(wall.start, wall.end);
  if (L < 0.01) return;
  const [sx, sy] = P(wall.start);
  const [ex, ey] = P(wall.end);
  const pl = placement(c, storeyPl, sx, sy, 0, ex - sx, ey - sy);
  const body = box(c, L / 2, 0, 0, L, wall.thickness, wall.height);
  const rep = shape(c, [body], "SweptSolid", `wall-${wall.status}`, [[0, 0], [L, 0]]);
  const name = `${WALL_MATERIAL_LABEL[wall.material]} ${Math.round(wall.thickness * 1000)} mm`;
  const ref = product(c, "IFCWALL", wall.id, name, pl, rep, [enumv(wall.material === "gypsum" ? "PARTITIONING" : "STANDARD")], WALL_STATUS_LABEL[wall.status]);
  out.push(ref);
  assignMaterial(c, ref, WALL_MATERIAL_LABEL[wall.material]);

  const external = isExternalWall(wall, lm.rooms, lm.walls);
  pset(c, ref, "Pset_WallCommon", [
    ["LoadBearing", bool(wall.loadBearing)],
    ["IsExternal", bool(external)],
    ["Status", label(STATUS_IFC[wall.status])],
    ["ThermalTransmittance", external ? utrans(uFromRc(wallRc(wall))) : undefined],
    ["Reference", label(`${WALL_MATERIAL_LABEL[wall.material]} ${Math.round(wall.thickness * 1000)}`)],
  ]);
  if (external) pset(c, ref, "Bouwproject_Bouwfysica", [["Rc", realv(wallRc(wall))], ["RcAangenomen", bool(wall.insulationRc == null)]]);
  phaseProps(c, ref, wall.phaseId);

  const ops = lm.openings.filter((o) => o.wallId === wall.id);
  let openArea = 0;
  for (const o of ops) {
    openArea += o.width * o.height;
    exportOpening(c, wall, o, pl, external, out);
  }
  c.qtos.push({
    product: ref,
    name: "Qto_WallBaseQuantities",
    q: [
      ["Length", "length", L],
      ["Height", "length", wall.height],
      ["Width", "length", wall.thickness],
      ["GrossSideArea", "area", L * wall.height],
      ["NetSideArea", "area", Math.max(0, L * wall.height - openArea)],
      ["NetVolume", "volume", Math.max(0, L * wall.height - openArea) * wall.thickness],
    ],
  });
}

function exportOpening(c: Ctx, wall: Wall, o: Opening, wallPl: Ref, external: boolean, out: Ref[]) {
  const wallRef = out[out.length - 1];
  const opPl = placement(c, wallPl, o.offset, 0, o.sillHeight);
  const voidBody = box(c, 0, 0, 0, o.width, wall.thickness + 0.1, o.height);
  const opening = product(c, "IFCOPENINGELEMENT", `${o.id}:void`, "Sparing", opPl, shape(c, [voidBody]), [enumv("OPENING")]);
  c.w.add("IFCRELVOIDSELEMENT", ifcGuid(`${o.id}:voids`), null, null, null, wallRef, opening);
  if (o.type === "passage") return;

  const isDoor = o.type === "door";
  const fillPl = placement(c, opPl, 0, 0, 0);
  const frameT = 0.067;
  const items = isDoor
    ? [box(c, 0, 0, 0, o.width, 0.04, o.height)]
    : [box(c, 0, 0, 0, o.width, frameT, o.height)];
  const rep = shape(c, items, "SweptSolid", isDoor ? "door" : "glass");
  const name = `${isDoor ? "Deur" : "Raam"} ${Math.round(o.width * 1000)}×${Math.round(o.height * 1000)}`;
  const fill = isDoor
    ? product(c, "IFCDOOR", o.id, name, fillPl, rep, [o.height, o.width, enumv("DOOR"), enumv("SINGLE_SWING_LEFT"), null])
    : product(c, "IFCWINDOW", o.id, name, fillPl, rep, [o.height, o.width, enumv("WINDOW"), enumv("SINGLE_PANEL"), null]);
  out.push(fill);
  c.w.add("IFCRELFILLSELEMENT", ifcGuid(`${o.id}:fills`), null, null, null, opening, fill);
  pset(c, fill, isDoor ? "Pset_DoorCommon" : "Pset_WindowCommon", [
    ["IsExternal", bool(external)],
    ["ThermalTransmittance", utrans(openingU(o, wall))],
    ["Status", label(STATUS_IFC[wall.status])],
  ]);
  if (!isDoor) pset(c, fill, "Bouwproject_Kozijn", [["Borsthoogte", len(o.sillHeight)]]);
}

function exportSpaces(c: Ctx, lm: LevelModel, storeyPl: Ref, spaces: Ref[]) {
  for (const room of lm.rooms) {
    if (room.polygon.length < 3) continue;
    const pl = placement(c, storeyPl, 0, 0, 0);
    const prof = polygonProfile(c, room.polygon.map(P));
    const pos3 = c.w.add("IFCAXIS2PLACEMENT3D", pt3(c, 0, 0, 0), null, null);
    const solid = c.w.add("IFCEXTRUDEDAREASOLID", prof, pos3, c.zDir, lm.level.height);
    const rep = shape(c, [solid], "SweptSolid", "space");
    const ref = c.w.add(
      "IFCSPACE", ifcGuid(room.id), null, room.name, null, room.func ?? null, pl, rep,
      room.func ?? room.name, enumv("ELEMENT"), enumv("INTERNAL"), null,
    );
    spaces.push(ref);
    const gross = polygonArea(room.polygon);
    c.qtos.push({
      product: ref,
      name: "Qto_SpaceBaseQuantities",
      q: [
        ["Height", "length", lm.level.height],
        ["GrossFloorArea", "area", gross],
        ["NetFloorArea", "area", nvoArea(room, lm.walls)],
        ["GrossVolume", "volume", gross * lm.level.height],
      ],
    });
    if (room.floorMaterial) pset(c, ref, "Pset_SpaceCoveringRequirements", [["FloorCovering", label(room.floorMaterial)]]);
  }
}

function exportStructure(c: Ctx, lm: LevelModel, storeyPl: Ref, out: Ref[]) {
  for (const col of lm.columns) {
    const h = col.height ?? lm.level.height;
    const [x, y] = P(col.position);
    const pl = placement(c, storeyPl, x, y, 0);
    const solid = col.shape === "round" ? cylinder(c, 0, 0, 0, col.size / 2, h) : box(c, 0, 0, 0, col.size, col.size, h);
    const ref = product(c, "IFCCOLUMN", col.id, `Kolom ${col.shape === "round" ? "Ø" : ""}${Math.round(col.size * 1000)}`, pl, shape(c, [solid], "SweptSolid", "concrete"), [enumv("COLUMN")]);
    out.push(ref);
    assignMaterial(c, ref, WALL_MATERIAL_LABEL[col.material as WallMaterial] ?? "Anders");
    pset(c, ref, "Pset_ColumnCommon", [["LoadBearing", bool(col.loadBearing)]]);
  }

  for (const b of lm.beams) {
    const L = dist(b.start, b.end);
    if (L < 0.01) continue;
    const dims = BEAM_PROFILE_DIMS[b.profile];
    const fw = b.width ?? dims.w;
    const [sx, sy] = P(b.start);
    const [ex, ey] = P(b.end);
    const pl = placement(c, storeyPl, sx, sy, b.height, ex - sx, ey - sy);
    const pos2 = c.w.add("IFCAXIS2PLACEMENT2D", pt2(c, 0, 0), null);
    const prof = c.w.add(
      "IFCISHAPEPROFILEDEF", enumv("AREA"), b.profile === "custom" ? "Aangepast" : b.profile, pos2,
      fw, dims.h, Math.max(0.005, dims.h * 0.06), Math.max(0.008, dims.h * 0.09), null, null, null,
    );
    const ref = product(c, "IFCBEAM", b.id, `Stalen ligger ${b.profile}`, pl, shape(c, [sweepX(c, prof, L)], "SweptSolid", "steel", [[0, 0], [L, 0]]), [enumv("BEAM")], b.profile);
    out.push(ref);
    assignMaterial(c, ref, "Staal S235");
    pset(c, ref, "Pset_BeamCommon", [["LoadBearing", bool(true)], ["Span", len(L)], ["Reference", label(b.profile)]]);
  }

  for (const s of lm.stairs) {
    const r = (s.rotation * Math.PI) / 180;
    const R = Math.max(s.width, s.run) / 2;
    // Spiltrap draait om zijn middelpunt, de andere om de hoek (zoals in 3D).
    const anchor = s.kind === "spiral" ? { x: s.position.x + R, y: s.position.y + R } : s.position;
    const [x, y] = P(anchor);
    // Plan-richting (cos r, sin r) → IFC (cos r, −sin r); lokale v → −v.
    const pl = placement(c, storeyPl, x, y, 0, Math.cos(r), -Math.sin(r));
    const n = Math.max(2, Math.round(s.steps));
    const rise = lm.level.height / n;
    const items: Ref[] = [];
    if (s.kind === "straight") {
      const depth = s.run / n;
      for (let i = 0; i < n; i++) items.push(box(c, s.width / 2, -(i * depth + depth / 2), 0, s.width, depth, (i + 1) * rise));
    } else if (s.kind === "l-shape") {
      const half = Math.round(n / 2);
      const dA = (s.run - s.width) / Math.max(1, half);
      const dB = (s.run - s.width) / Math.max(1, n - half);
      for (let i = 0; i < half; i++) items.push(box(c, s.width / 2, -(i * dA + dA / 2), 0, s.width, dA, (i + 1) * rise));
      for (let i = 0; i < n - half; i++) items.push(box(c, s.width + i * dB + dB / 2, -(s.run - s.width / 2), 0, dB, s.width, (half + i + 1) * rise));
    } else {
      items.push(cylinder(c, 0, 0, 0, 0.06, lm.level.height));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        items.push(box(c, (Math.cos(a) * R) / 2, -(Math.sin(a) * R) / 2, (i + 1) * rise - 0.05, R, R * 0.5, 0.05, -a));
      }
    }
    const pre = { straight: "STRAIGHT_RUN_STAIR", "l-shape": "QUARTER_TURN_STAIR", spiral: "SPIRAL_STAIR" }[s.kind];
    const ref = product(c, "IFCSTAIR", s.id, `Trap (${n} treden)`, pl, shape(c, items, "SweptSolid", "stair"), [enumv(pre)]);
    out.push(ref);
    pset(c, ref, "Pset_StairCommon", [
      ["NumberOfRiser", typed("IFCCOUNTMEASURE", new Raw(String(n)))],
      ["RiserHeight", len(rise)],
      ["TreadLength", len(s.kind === "spiral" ? 0.25 : s.run / n)],
    ]);
  }
}

function exportRoofs(c: Ctx, lm: LevelModel, storeyPl: Ref, out: Ref[]) {
  for (const roof of lm.roofs) {
    const bb = roof.polygon && roof.polygon.length >= 3 ? bounds(roof.polygon) : bounds(lm.walls.flatMap((w) => [w.start, w.end]));
    const W = bb.max.x - bb.min.x;
    const D = bb.max.y - bb.min.y;
    if (W <= 0.5 || D <= 0.5) continue;
    const mesh = buildRoof(roof.type, W, D, roof.pitch, roof.overhang);
    const cx = (bb.min.x + bb.max.x) / 2;
    const cy = (bb.min.y + bb.max.y) / 2;
    const rr = (roof.ridgeDirection * Math.PI) / 180;
    // Zelfde transformatie als de 3D-scene: lokaal (x, y, z) → plan.
    const coords: StepValue[] = [];
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const lx = mesh.positions[i];
      const ly = mesh.positions[i + 1];
      const lz = mesh.positions[i + 2];
      const px = cx + lx * Math.cos(rr) - lz * Math.sin(rr);
      const py = cy + lx * Math.sin(rr) + lz * Math.cos(rr);
      coords.push([px, -py, ly]);
    }
    const idx: StepValue[] = [];
    for (let i = 0; i < mesh.indices.length; i += 3) {
      idx.push([
        new Raw(String(mesh.indices[i] + 1)),
        new Raw(String(mesh.indices[i + 1] + 1)),
        new Raw(String(mesh.indices[i + 2] + 1)),
      ]);
    }
    const list = c.w.add("IFCCARTESIANPOINTLIST3D", coords);
    const faces = c.w.add("IFCTRIANGULATEDFACESET", list, null, false, idx, null);
    const pl = placement(c, storeyPl, 0, 0, lm.level.height);
    const pre = { gable: "GABLE_ROOF", hip: "HIP_ROOF", shed: "SHED_ROOF", flat: "FLAT_ROOF", mansard: "MANSARD_ROOF" }[roof.type];
    const ref = product(c, "IFCROOF", roof.id, "Dak", pl, shape(c, [faces], "Tessellation", "roof"), [enumv(pre)]);
    out.push(ref);
    pset(c, ref, "Pset_RoofCommon", [
      ["IsExternal", bool(true)],
      ["ThermalTransmittance", utrans(uFromRc(roofRc(roof)))],
    ]);
    pset(c, ref, "Bouwproject_Dak", [["Dakhelling", typed("IFCPLANEANGLEMEASURE", (roof.pitch * Math.PI) / 180)], ["Overstek", len(roof.overhang)], ["Rc", realv(roofRc(roof))]]);
  }
}

function exportFurniture(c: Ctx, lm: LevelModel, storeyPl: Ref, out: Ref[]) {
  for (const f of lm.furniture) {
    const def = FURNITURE_DEFAULTS[f.kind];
    if (!def) continue;
    const r = (f.rotation * Math.PI) / 180;
    const [x, y] = P(f.position);
    const pl = placement(c, storeyPl, x, y, 0, Math.cos(r), -Math.sin(r));
    const solid = box(c, 0, 0, 0, f.width ?? def.w, f.depth ?? def.d, def.h);
    const pre = f.kind.startsWith("bed")
      ? "BED"
      : f.kind.startsWith("sofa")
        ? "SOFA"
        : f.kind.includes("chair")
          ? "CHAIR"
          : f.kind === "desk"
            ? "DESK"
            : f.kind.includes("table")
              ? "TABLE"
              : f.kind === "bookshelf"
                ? "SHELF"
                : "NOTDEFINED";
    const entity = f.kind === "bathtub" || f.kind === "shower-cabin" ? "IFCSANITARYTERMINAL" : "IFCFURNITURE";
    const preType = entity === "IFCSANITARYTERMINAL" ? (f.kind === "bathtub" ? "BATH" : "SHOWER") : pre;
    out.push(product(c, entity, f.id, def.label, pl, shape(c, [solid], "SweptSolid", entity === "IFCFURNITURE" ? "furniture" : "sanitary"), [enumv(preType)]));
  }
}

function exportMep(c: Ctx, lm: LevelModel, storeyPl: Ref, out: Ref[]) {
  // Elektra
  const elecMap: Record<string, [string, string]> = {
    socket: ["IFCOUTLET", "POWEROUTLET"],
    "socket-double": ["IFCOUTLET", "POWEROUTLET"],
    perilex: ["IFCOUTLET", "POWEROUTLET"],
    outdoor: ["IFCOUTLET", "POWEROUTLET"],
    data: ["IFCOUTLET", "DATAOUTLET"],
    switch: ["IFCSWITCHINGDEVICE", "TOGGLESWITCH"],
    light: ["IFCLIGHTFIXTURE", "POINTSOURCE"],
    spot: ["IFCLIGHTFIXTURE", "POINTSOURCE"],
    "wall-light": ["IFCLIGHTFIXTURE", "POINTSOURCE"],
    panel: ["IFCELECTRICDISTRIBUTIONBOARD", "DISTRIBUTIONBOARD"],
  };
  for (const e of lm.electrical) {
    const [entity, pre] = elecMap[e.type] ?? ["IFCOUTLET", "NOTDEFINED"];
    const [x, y] = P(e.position);
    const pl = placement(c, storeyPl, x, y, e.heightZ);
    const size = e.type === "panel" ? [0.6, 0.15, 0.8] : e.type === "light" || e.type === "spot" ? [0.1, 0.1, 0.05] : [0.08, 0.05, 0.08];
    const solid = box(c, 0, 0, -size[2] / 2, size[0], size[1], size[2]);
    const name = ELECTRICAL_LABEL[e.type] + (e.label ? ` ${e.label}` : "");
    const ref = product(c, entity, e.id, name, pl, shape(c, [solid], "SweptSolid", "electrical"), [enumv(pre)], ELECTRICAL_LABEL[e.type]);
    out.push(ref);
    pset(c, ref, "Bouwproject_Elektra", [
      ["Montagehoogte", len(e.heightZ)],
      ["Groep", e.group ? label(e.group) : undefined],
      ["Opmerking", e.note ? text(e.note) : undefined],
    ]);
  }

  // Sanitair + leidingen
  const fixtureMap: Record<string, [string, string]> = {
    toilet: ["IFCSANITARYTERMINAL", "TOILETPAN"],
    sink: ["IFCSANITARYTERMINAL", "WASHHANDBASIN"],
    shower: ["IFCSANITARYTERMINAL", "SHOWER"],
    bath: ["IFCSANITARYTERMINAL", "BATH"],
    "kitchen-tap": ["IFCSANITARYTERMINAL", "SINK"],
    "washing-machine": ["IFCELECTRICAPPLIANCE", "WASHINGMACHINE"],
    boiler: ["IFCBOILER", "WATER"],
    "outdoor-tap": ["IFCVALVE", "FAUCET"],
  };
  const pipeStyle: Record<string, string> = { "supply-cold": "cold", "supply-hot": "hot", drain: "drain", "cv-pipe": "cv" };
  const pipeName: Record<string, string> = { "supply-cold": "Koudwaterleiding", "supply-hot": "Warmwaterleiding", drain: "Afvoer", "cv-pipe": "CV-leiding" };
  for (const p of lm.plumbing) {
    if (p.type === "fixture") {
      if (!p.position || !p.fixture) continue;
      const [entity, pre] = fixtureMap[p.fixture];
      const fp = FIXTURE_FOOTPRINT[p.fixture];
      const [x, y] = P(p.position);
      const h = p.fixture === "bath" ? 0.6 : p.fixture === "shower" ? 0.05 : p.fixture === "boiler" ? 0.7 : 0.4;
      const z = p.fixture === "boiler" ? 1.2 : p.fixture === "sink" ? 0.85 - h : 0;
      const pl = placement(c, storeyPl, x, y, Math.max(0, z));
      const ref = product(c, entity, p.id, FIXTURE_LABEL[p.fixture], pl, shape(c, [box(c, 0, 0, 0, fp.w, fp.h, h)], "SweptSolid", "sanitary"), [enumv(pre)]);
      out.push(ref);
      if (p.heightZ != null) pset(c, ref, "Bouwproject_Aansluiting", [["Aansluithoogte", len(p.heightZ)]]);
      continue;
    }
    const d = (p.diameter ?? (p.type === "drain" ? 50 : 16)) / 1000;
    exportRun(c, storeyPl, out, p.id, p.path, p.heightZ ?? (p.type === "drain" ? 0.05 : 0.1), d, "IFCPIPESEGMENT", pipeName[p.type], pipeStyle[p.type]);
  }

  // HVAC
  for (const h of lm.hvac) {
    if (h.path && h.path.length >= 2) {
      const isDuct = h.type === "ventilation";
      exportRun(c, storeyPl, out, h.id, h.path, h.heightZ ?? (isDuct ? 2.3 : 0.1), isDuct ? 0.125 : 0.022, isDuct ? "IFCDUCTSEGMENT" : "IFCPIPESEGMENT", HVAC_LABEL[h.type], isDuct ? "duct" : "cv");
      continue;
    }
    if (!h.position) continue;
    const [x, y] = P(h.position);
    const z = h.heightZ ?? 0;
    const pl = placement(c, storeyPl, x, y, z);
    let entity = "IFCSPACEHEATER";
    let pre = "RADIATOR";
    let dims: [number, number, number] = [1.0, 0.1, 0.6];
    if (h.type === "floor-heating") { pre = "USERDEFINED"; dims = [0.6, 0.1, 0.5]; }
    if (h.type === "ventilation") { entity = "IFCAIRTERMINAL"; pre = "DIFFUSER"; dims = [0.15, 0.15, 0.05]; }
    if (h.type === "wtw") { entity = "IFCAIRTOAIRHEATRECOVERY"; pre = "FIXEDPLATECOUNTERFLOWEXCHANGER"; dims = [0.6, 0.4, 0.7]; }
    if (h.type === "cv-pipe") { entity = "IFCPIPEFITTING"; pre = "NOTDEFINED"; dims = [0.05, 0.05, 0.05]; }
    out.push(product(c, entity, h.id, HVAC_LABEL[h.type], pl, shape(c, [box(c, 0, 0, 0, ...dims)], "SweptSolid", "heater"), [enumv(pre)]));
  }
}

function exportRun(c: Ctx, storeyPl: Ref, out: Ref[], id: string, path: { x: number; y: number }[] | undefined, z: number, diameter: number, entity: string, name: string, style: string) {
  if (!path || path.length < 2) return;
  for (let i = 0; i < path.length - 1; i++) {
    const L = dist(path[i], path[i + 1]);
    if (L < 0.005) continue;
    const [sx, sy] = P(path[i]);
    const [ex, ey] = P(path[i + 1]);
    const pl = placement(c, storeyPl, sx, sy, z, ex - sx, ey - sy);
    const pos2 = c.w.add("IFCAXIS2PLACEMENT2D", pt2(c, 0, 0), null);
    const prof = c.w.add("IFCCIRCLEPROFILEDEF", enumv("AREA"), null, pos2, diameter / 2);
    const ref = product(c, entity, `${id}:${i}`, `${name} Ø${Math.round(diameter * 1000)}`, pl, shape(c, [sweepX(c, prof, L)], "SweptSolid", style, [[0, 0], [L, 0]]), [enumv("RIGIDSEGMENT")]);
    out.push(ref);
    pset(c, ref, "Bouwproject_Leiding", [["Diameter", len(diameter)], ["Hoogte", len(z)], ["Traject", label(id)]]);
  }
}

// ── Hoofdfunctie ──────────────────────────────────────────────────────────────

export interface IfcExportOptions {
  includeFurniture?: boolean;
  includeMep?: boolean;
  includeDemolished?: boolean;
  author?: string;
}

export function exportIfc(model: ProjectModel, opts: IfcExportOptions = {}): string {
  const { includeFurniture = true, includeMep = true, includeDemolished = true } = opts;
  const w = new StepWriter();
  const pid = model.project.id;

  const origin3 = w.add("IFCCARTESIANPOINT", [0, 0, 0]);
  const zDir = w.add("IFCDIRECTION", [0, 0, 1]);
  const xDir = w.add("IFCDIRECTION", [1, 0, 0]);
  const wcs = w.add("IFCAXIS2PLACEMENT3D", origin3, null, null);
  // Noordrichting: northDegrees = waar noord wijst t.o.v. "omhoog" op het plan (met de klok mee).
  const nRad = ((model.project.northDegrees ?? 0) * Math.PI) / 180;
  const trueNorth = w.add("IFCDIRECTION", [Math.sin(nRad), Math.cos(nRad)]);
  const ctx = w.add("IFCGEOMETRICREPRESENTATIONCONTEXT", null, "Model", new Raw("3"), 1e-5, wcs, trueNorth);
  const body = w.add("IFCGEOMETRICREPRESENTATIONSUBCONTEXT", "Body", "Model", "*", "*", "*", "*", ctx, null, enumv("MODEL_VIEW"), null);
  const axis = w.add("IFCGEOMETRICREPRESENTATIONSUBCONTEXT", "Axis", "Model", "*", "*", "*", "*", ctx, null, enumv("GRAPH_VIEW"), null);

  const c: Ctx = {
    w, body, axis, origin3, zDir, xDir,
    styles: new Map(),
    materials: new Map(),
    materialRefs: new Map(),
    phaseName: new Map(model.phases.map((p) => [p.id, p.name])),
    psets: [],
    qtos: [],
  };
  makeStyles(c);

  const units = w.add("IFCUNITASSIGNMENT", [
    w.add("IFCSIUNIT", "*", enumv("LENGTHUNIT"), null, enumv("METRE")),
    w.add("IFCSIUNIT", "*", enumv("AREAUNIT"), null, enumv("SQUARE_METRE")),
    w.add("IFCSIUNIT", "*", enumv("VOLUMEUNIT"), null, enumv("CUBIC_METRE")),
    w.add("IFCSIUNIT", "*", enumv("PLANEANGLEUNIT"), null, enumv("RADIAN")),
    w.add("IFCSIUNIT", "*", enumv("THERMODYNAMICTEMPERATUREUNIT"), null, enumv("KELVIN")),
  ]);
  // Schakel de "renovatiefase" in IFC-viewers in via de Phase-tekst van het project.
  const project = w.add("IFCPROJECT", ifcGuid(`${pid}:project`), null, model.project.name, model.project.description ?? null, null, null, "Renovatie", [ctx], units);

  const sitePl = placement(c, null, 0, 0, 0);
  const site = w.add("IFCSITE", ifcGuid(`${pid}:site`), null, "Perceel", null, null, sitePl, null, null, enumv("ELEMENT"), null, null, null, null, null);
  const bldPl = placement(c, sitePl, 0, 0, 0);
  const building = w.add("IFCBUILDING", ifcGuid(`${pid}:building`), null, model.project.name, model.project.description ?? null, null, bldPl, null, null, enumv("ELEMENT"), null, null, null);
  w.add("IFCRELAGGREGATES", ifcGuid(`${pid}:agg-project`), null, null, null, project, [site]);
  w.add("IFCRELAGGREGATES", ifcGuid(`${pid}:agg-site`), null, null, null, site, [building]);

  const storeys: Ref[] = [];
  for (const lm0 of model.levels) {
    const lm: LevelModel = includeDemolished ? lm0 : { ...lm0, walls: lm0.walls.filter((x) => x.status !== "demolish") };
    const level: Level = lm.level;
    const stPl = placement(c, bldPl, 0, 0, level.elevation);
    const storey = w.add("IFCBUILDINGSTOREY", ifcGuid(level.id), null, level.name, null, null, stPl, null, null, enumv("ELEMENT"), level.elevation);
    storeys.push(storey);

    const elements: Ref[] = [];
    const spaces: Ref[] = [];
    for (const wall of lm.walls) exportWall(c, lm, wall, stPl, elements);
    exportSpaces(c, lm, stPl, spaces);
    exportStructure(c, lm, stPl, elements);
    exportRoofs(c, lm, stPl, elements);
    if (includeFurniture) exportFurniture(c, lm, stPl, elements);
    if (includeMep) exportMep(c, lm, stPl, elements);

    if (spaces.length) w.add("IFCRELAGGREGATES", ifcGuid(`${level.id}:spaces`), null, null, null, storey, spaces);
    if (elements.length) w.add("IFCRELCONTAINEDINSPATIALSTRUCTURE", ifcGuid(`${level.id}:contains`), null, null, null, elements, storey);
    pset(c, storey, "Pset_BuildingStoreyCommon", [["EntranceLevel", bool(level.order === model.levels[0]?.level.order)], ["GrossPlannedArea", undefined]]);
    pset(c, storey, "Bouwproject_Bouwlaag", [["Verdiepingshoogte", len(level.height)]]);
  }
  if (storeys.length) w.add("IFCRELAGGREGATES", ifcGuid(`${pid}:agg-building`), null, null, null, building, storeys);

  // Materialen
  for (const [name, products] of c.materials) {
    const mat = w.add("IFCMATERIAL", name, null, name.startsWith("Staal") ? "Steel" : "Masonry");
    w.add("IFCRELASSOCIATESMATERIAL", ifcGuid(`${pid}:mat:${name}`), null, null, null, products, mat);
  }

  // Property sets
  let n = 0;
  for (const ps of c.psets) {
    const props = ps.props.map(([k, v]) => w.add("IFCPROPERTYSINGLEVALUE", k, null, v, null));
    const set = w.add("IFCPROPERTYSET", ifcGuid(`${pid}:pset:${n}:${ps.name}:${ps.product.ref}`), null, ps.name, null, props);
    w.add("IFCRELDEFINESBYPROPERTIES", ifcGuid(`${pid}:rel-pset:${n++}:${ps.product.ref}`), null, null, null, [ps.product], set);
  }
  for (const q of c.qtos) {
    const quants = q.q.map(([k, kind, v]) =>
      kind === "length"
        ? w.add("IFCQUANTITYLENGTH", k, null, null, v, null)
        : kind === "area"
          ? w.add("IFCQUANTITYAREA", k, null, null, v, null)
          : w.add("IFCQUANTITYVOLUME", k, null, null, v, null),
    );
    const set = w.add("IFCELEMENTQUANTITY", ifcGuid(`${pid}:qto:${n}:${q.product.ref}`), null, q.name, null, null, quants);
    w.add("IFCRELDEFINESBYPROPERTIES", ifcGuid(`${pid}:rel-qto:${n++}:${q.product.ref}`), null, null, null, [q.product], set);
  }

  const safeName = model.project.name.replace(/[^\w\- ]+/g, "").trim() || "bouwproject";
  return w.toString({
    description: "ViewDefinition [ReferenceView_V1.2]",
    name: `${safeName}.ifc`,
    author: opts.author ?? "",
    organization: "",
    app: "Bouwproject digital twin",
    schema: "IFC4",
  });
}
