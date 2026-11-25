// IFC-import: een model van architect/tekenaar (Revit, ArchiCAD, …) omzetten
// naar het eigen datamodel (muren, kozijnen, ruimtes, kolommen, balken).
//
// Aanpak: web-ifc rekent de 3D-geometrie van elk element uit (ongeacht hoe het
// in IFC is gemodelleerd — extrusie, brep, met sparingen). Uit de vorm halen we
// de maten terug: voor een muur de kleinste omhullende rechthoek in bovenaanzicht
// (lengte, dikte, richting) plus de hoogte; voor een ruimte de omtrek van het
// ondervlak. Eigenschappen (dragend, gevel, status, materiaal) komen uit de
// property sets. Zo werkt het voor vrijwel elke IFC2x3/IFC4-export.
//
// Assen: web-ifc levert Y-omhoog (X, Y=hoogte, Z=−IFC-Y). Plan-x = X, plan-y = Z.

import type { BeamProfile, OpeningType, Point, WallMaterial, WallStatus } from "../domain/types";
import { BEAM_PROFILE_DIMS } from "../domain/constants";

// Minimale interface van web-ifc's IfcAPI die we gebruiken (testbaar in Node).
export interface IfcApiLike {
  OpenModel(data: Uint8Array, settings?: Record<string, unknown>): number;
  CloseModel(modelID: number): void;
  GetLineIDsWithType(modelID: number, type: number, includeInherited?: boolean): { size(): number; get(i: number): number };
  GetLine(modelID: number, id: number, flatten?: boolean): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  StreamAllMeshesWithTypes(
    modelID: number,
    types: number[],
    cb: (mesh: {
      expressID: number;
      geometries: { size(): number; get(i: number): { geometryExpressID: number; flatTransformation: number[] } };
    }) => void,
  ): void;
  GetGeometry(modelID: number, id: number): {
    GetVertexData(): number;
    GetVertexDataSize(): number;
    GetIndexData(): number;
    GetIndexDataSize(): number;
    delete?(): void;
  };
  GetVertexArray(ptr: number, size: number): Float32Array;
  GetIndexArray(ptr: number, size: number): Uint32Array;
}

// IFC-type-codes (gelijk aan web-ifc's constanten; hier vast zodat dit
// bestand geen runtime-import van web-ifc nodig heeft).
export const T = {
  IFCBUILDINGSTOREY: 3124254112,
  IFCWALL: 2391406946,
  IFCWALLSTANDARDCASE: 3512223829,
  IFCDOOR: 395920057,
  IFCWINDOW: 3304561284,
  IFCSPACE: 3856911033,
  IFCCOLUMN: 843113511,
  IFCBEAM: 753842376,
  IFCRELCONTAINEDINSPATIALSTRUCTURE: 3242617779,
  IFCRELAGGREGATES: 160246688,
  IFCRELDEFINESBYPROPERTIES: 4186316022,
  IFCRELASSOCIATESMATERIAL: 2655215786,
  IFCSIUNIT: 448429030,
  IFCCONVERSIONBASEDUNIT: 2889183280,
  IFCUNITASSIGNMENT: 180925521,
  IFCPROJECT: 103090709,
} as const;

// ── Resultaat ────────────────────────────────────────────────────────────────

export interface ImportedWall {
  ifcId: number;
  start: Point;
  end: Point;
  thickness: number;
  height: number;
  baseOffset: number; // onderkant t.o.v. bouwlaag
  material: WallMaterial;
  loadBearing: boolean;
  isExternal?: boolean;
  status?: WallStatus;
  name: string;
}

export interface ImportedOpening {
  ifcId: number;
  wallIfcId: number;
  type: OpeningType;
  width: number;
  height: number;
  sillHeight: number;
  offset: number;
}

export interface ImportedRoom {
  ifcId: number;
  name: string;
  func?: string;
  polygon: Point[];
}

export interface ImportedColumn {
  ifcId: number;
  position: Point;
  size: number;
  shape: "round" | "square";
  height: number;
}

export interface ImportedBeam {
  ifcId: number;
  start: Point;
  end: Point;
  height: number; // hart balk boven vloer
  profile: BeamProfile;
  width?: number;
}

export interface ImportedLevel {
  ifcId: number;
  name: string;
  elevation: number;
  height: number;
  walls: ImportedWall[];
  openings: ImportedOpening[];
  rooms: ImportedRoom[];
  columns: ImportedColumn[];
  beams: ImportedBeam[];
}

export interface ImportResult {
  projectName?: string;
  schema?: string;
  levels: ImportedLevel[];
  skipped: { kind: string; reason: string }[];
  offset: Point; // verschuiving die is toegepast (grote georef-coördinaten)
}

// ── 2D-geometrie ─────────────────────────────────────────────────────────────

function convexHull(pts: Point[]): Point[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-12) lower.pop();
    lower.push(q);
  }
  const upper: Point[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 1e-12) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

interface Rect {
  center: Point;
  dir: Point; // eenheidsvector langs de lange zijde
  length: number;
  width: number;
}

/** Kleinste omhullende rechthoek (rotating calipers over de convexe hull). */
export function minAreaRect(pts: Point[]): Rect | null {
  const hull = convexHull(pts);
  if (hull.length < 2) return null;
  let best: Rect | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const q of hull) {
      const u = q.x * ux + q.y * uy;
      const v = -q.x * uy + q.y * ux;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < bestArea - 1e-9) {
      bestArea = area;
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      const center = { x: cu * ux - cv * uy, y: cu * uy + cv * ux };
      const du = maxU - minU;
      const dv = maxV - minV;
      best = du >= dv
        ? { center, dir: { x: ux, y: uy }, length: du, width: dv }
        : { center, dir: { x: -uy, y: ux }, length: dv, width: du };
    }
  }
  return best;
}

/** Omtrek van het ondervlak van een prisma (ruimte): randen die maar één keer voorkomen. */
function bottomOutline(tris: [number[], number[], number[]][], minY: number): Point[] | null {
  const key = (v: number[]) => `${Math.round(v[0] * 1000)},${Math.round(v[2] * 1000)}`;
  const count = new Map<string, number>();
  const edges: [string, string][] = [];
  const coord = new Map<string, Point>();
  for (const t of tris) {
    if (t.some((v) => Math.abs(v[1] - minY) > 0.02)) continue; // alleen ondervlak
    for (let i = 0; i < 3; i++) {
      const a = t[i];
      const b = t[(i + 1) % 3];
      const ka = key(a);
      const kb = key(b);
      if (ka === kb) continue;
      coord.set(ka, { x: a[0], y: a[2] });
      coord.set(kb, { x: b[0], y: b[2] });
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      count.set(k, (count.get(k) ?? 0) + 1);
      edges.push([ka, kb]);
    }
  }
  const adj = new Map<string, string[]>();
  for (const [a, b] of edges) {
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (count.get(k) !== 1) continue;
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  }
  // Langste lus volgen.
  const visited = new Set<string>();
  let best: string[] = [];
  for (const start of adj.keys()) {
    if (visited.has(start)) continue;
    const loop = [start];
    visited.add(start);
    let prev = "";
    let cur = start;
    for (let guard = 0; guard < 10000; guard++) {
      const next = (adj.get(cur) ?? []).find((n) => n !== prev && (!visited.has(n) || (n === start && loop.length > 2)));
      if (!next || next === start) break;
      loop.push(next);
      visited.add(next);
      prev = cur;
      cur = next;
    }
    if (loop.length > best.length) best = loop;
  }
  if (best.length < 3) return null;
  // Collineaire punten weghalen.
  const pts = best.map((k) => coord.get(k)!);
  const out: Point[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i - 1 + pts.length) % pts.length];
    const b = pts[i];
    const c = pts[(i + 1) % pts.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) > 1e-4) out.push(b);
  }
  return out.length >= 3 ? out : null;
}

// ── Eigenschappen ────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const val = (x: any): any => (x && typeof x === "object" && "value" in x ? x.value : x);

function decodeIfcString(s: unknown): string {
  if (typeof s !== "string") return "";
  return s
    .replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (_, hex: string) => {
      let out = "";
      for (let i = 0; i < hex.length; i += 4) out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
      return out;
    })
    .replace(/\\X\\([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\S\\(.)/g, (_, c: string) => String.fromCharCode(c.charCodeAt(0) + 128));
}

function collectNames(obj: any, out: string[], depth = 0) {
  if (!obj || depth > 6) return;
  if (Array.isArray(obj)) {
    for (const o of obj) collectNames(o, out, depth + 1);
    return;
  }
  if (typeof obj !== "object") return;
  if (obj.Name && typeof val(obj.Name) === "string") out.push(decodeIfcString(val(obj.Name)));
  for (const k of Object.keys(obj)) if (typeof obj[k] === "object") collectNames(obj[k], out, depth + 1);
}

export function guessMaterial(text: string, thickness: number): WallMaterial {
  const t = text.toLowerCase();
  if (/kalkzand|sand.?lime|kzs/.test(t)) return "sand-lime";
  if (/cellen|gasbeton|ytong|aerated/.test(t)) return "aerated-concrete";
  if (/beton|concrete/.test(t)) return "concrete";
  if (/gips|metal.?stud|plaster|drywall|gypsum/.test(t)) return "gypsum";
  if (/hsb|hout|timber|wood/.test(t)) return "timber-frame";
  if (/baksteen|brick|metsel|masonry/.test(t)) return "brick";
  return thickness < 0.12 ? "gypsum" : "brick";
}

function lengthScale(api: IfcApiLike, m: number): number {
  const ids = api.GetLineIDsWithType(m, T.IFCUNITASSIGNMENT);
  if (ids.size() === 0) return 1;
  const ua = api.GetLine(m, ids.get(0), true);
  for (const u of ua.Units ?? []) {
    if (val(u.UnitType) !== "LENGTHUNIT") continue;
    if (u.ConversionFactor) {
      const f = val(u.ConversionFactor?.ValueComponent);
      return typeof f === "number" ? f * lengthScaleOfUnit(u.ConversionFactor?.UnitComponent) : 0.3048;
    }
    return lengthScaleOfUnit(u);
  }
  return 1;
}

function lengthScaleOfUnit(u: any): number {
  const prefix = val(u?.Prefix);
  return { MILLI: 0.001, CENTI: 0.01, DECI: 0.1, KILO: 1000 }[prefix as string] ?? 1;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Hoofdfunctie ─────────────────────────────────────────────────────────────

const BEAM_PROFILES = Object.entries(BEAM_PROFILE_DIMS).filter(([k]) => k !== "custom") as [BeamProfile, { h: number; w: number }][];

export function importIfc(api: IfcApiLike, data: Uint8Array): ImportResult {
  const m = api.OpenModel(data, { COORDINATE_TO_ORIGIN: false });
  const skipped: ImportResult["skipped"] = [];
  try {
    const scale = lengthScale(api, m);
    const ids = (type: number) => {
      const v = api.GetLineIDsWithType(m, type, true);
      const out: number[] = [];
      for (let i = 0; i < v.size(); i++) out.push(v.get(i));
      return out;
    };
    const line = (id: number, flat = false) => api.GetLine(m, id, flat);

    // Projectnaam
    let projectName: string | undefined;
    const proj = ids(T.IFCPROJECT)[0];
    if (proj) projectName = decodeIfcString(val(line(proj).Name)) || undefined;

    // Bouwlagen
    const storeys = ids(T.IFCBUILDINGSTOREY).map((id) => {
      const s = line(id);
      return { id, name: decodeIfcString(val(s.Name)) || "Bouwlaag", elevation: (Number(val(s.Elevation)) || 0) * scale };
    });

    // Element → bouwlaag
    const storeyOf = new Map<number, number>();
    for (const rid of ids(T.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
      const r = line(rid);
      const st = val(r.RelatingStructure);
      for (const e of r.RelatedElements ?? []) storeyOf.set(val(e), st);
    }
    for (const rid of ids(T.IFCRELAGGREGATES)) {
      const r = line(rid);
      const parent = val(r.RelatingObject);
      for (const e of r.RelatedObjects ?? []) if (!storeyOf.has(val(e))) storeyOf.set(val(e), parent);
    }

    // Property sets (alleen de paar waarden die we gebruiken)
    const props = new Map<number, Record<string, unknown>>();
    for (const rid of ids(T.IFCRELDEFINESBYPROPERTIES)) {
      const r = line(rid);
      const def = line(val(r.RelatingPropertyDefinition));
      if (!def?.HasProperties) continue;
      const kv: Record<string, unknown> = {};
      for (const pref of def.HasProperties) {
        const p = line(val(pref));
        const name = val(p?.Name);
        if (typeof name === "string" && p.NominalValue) kv[name] = val(p.NominalValue);
      }
      for (const o of r.RelatedObjects ?? []) props.set(val(o), { ...(props.get(val(o)) ?? {}), ...kv });
    }

    // Materiaalnamen per element
    const matText = new Map<number, string>();
    for (const rid of ids(T.IFCRELASSOCIATESMATERIAL)) {
      const r = line(rid);
      const names: string[] = [];
      try {
        collectNames(line(val(r.RelatingMaterial), true), names);
      } catch {
        /* onbekende materiaalstructuur: negeren */
      }
      for (const o of r.RelatedObjects ?? []) matText.set(val(o), names.join(" "));
    }

    // Vul/vervang-relaties: deur/raam → muur
    const fillWall = new Map<number, number>();
    const openingWall = new Map<number, number>();
    for (const rid of ids(1401173127 /* IFCRELVOIDSELEMENT */)) {
      const r = line(rid);
      openingWall.set(val(r.RelatedOpeningElement), val(r.RelatingBuildingElement));
    }
    for (const rid of ids(3940055652 /* IFCRELFILLSELEMENT */)) {
      const r = line(rid);
      const w = openingWall.get(val(r.RelatingOpeningElement));
      if (w) fillWall.set(val(r.RelatedBuildingElement), w);
    }

    // Geometrie verzamelen per element
    interface Geo { pts: Point[]; minY: number; maxY: number; tris: [number[], number[], number[]][] }
    const geo = new Map<number, Geo>();
    const types = [T.IFCWALL, T.IFCWALLSTANDARDCASE, T.IFCDOOR, T.IFCWINDOW, T.IFCSPACE, T.IFCCOLUMN, T.IFCBEAM];
    const wantTris = new Set(ids(T.IFCSPACE));
    api.StreamAllMeshesWithTypes(m, types, (mesh) => {
      const g: Geo = geo.get(mesh.expressID) ?? { pts: [], minY: Infinity, maxY: -Infinity, tris: [] };
      for (let i = 0; i < mesh.geometries.size(); i++) {
        const pg = mesh.geometries.get(i);
        const gm = api.GetGeometry(m, pg.geometryExpressID);
        const verts = api.GetVertexArray(gm.GetVertexData(), gm.GetVertexDataSize());
        const idx = api.GetIndexArray(gm.GetIndexData(), gm.GetIndexDataSize());
        const M = pg.flatTransformation;
        const world: number[][] = [];
        for (let v = 0; v < verts.length; v += 6) {
          const x = verts[v], y = verts[v + 1], z = verts[v + 2];
          const wx = M[0] * x + M[4] * y + M[8] * z + M[12];
          const wy = M[1] * x + M[5] * y + M[9] * z + M[13];
          const wz = M[2] * x + M[6] * y + M[10] * z + M[14];
          world.push([wx, wy, wz]);
          g.pts.push({ x: wx, y: wz });
          g.minY = Math.min(g.minY, wy);
          g.maxY = Math.max(g.maxY, wy);
        }
        if (wantTris.has(mesh.expressID)) {
          for (let t = 0; t < idx.length; t += 3) g.tris.push([world[idx[t]], world[idx[t + 1]], world[idx[t + 2]]]);
        }
        gm.delete?.();
      }
      geo.set(mesh.expressID, g);
    });

    // Recentreren als de coördinaten ver van de oorsprong liggen (RD-coördinaten).
    let minX = Infinity, minZ = Infinity;
    for (const g of geo.values()) for (const p of g.pts) { minX = Math.min(minX, p.x); minZ = Math.min(minZ, p.y); }
    const offset = Number.isFinite(minX) && (Math.abs(minX) > 1000 || Math.abs(minZ) > 1000) ? { x: minX - 1, y: minZ - 1 } : { x: 0, y: 0 };
    const sh = (p: Point): Point => ({ x: p.x - offset.x, y: p.y - offset.y });

    // Bouwlagen opbouwen
    const sorted = [...storeys].sort((a, b) => a.elevation - b.elevation);
    const levels: ImportedLevel[] = sorted.map((s, i) => ({
      ifcId: s.id,
      name: s.name,
      elevation: s.elevation,
      height: i < sorted.length - 1 ? Math.max(2.2, sorted[i + 1].elevation - s.elevation) : 2.6,
      walls: [],
      openings: [],
      rooms: [],
      columns: [],
      beams: [],
    }));
    const levelById = new Map(levels.map((l) => [l.ifcId, l]));
    // Zonder bouwlagen: één laag op peil 0.
    const fallback = (): ImportedLevel => {
      if (!levels.length) levels.push({ ifcId: -1, name: "Begane grond", elevation: 0, height: 2.6, walls: [], openings: [], rooms: [], columns: [], beams: [] });
      return levels[0];
    };
    const levelFor = (id: number, g: Geo): ImportedLevel => {
      const lv = levelById.get(storeyOf.get(id) ?? -2);
      if (lv) return lv;
      // Geen relatie: kies de laag waarvan het peil net onder het element ligt.
      let best = levels[0] ?? fallback();
      for (const l of levels) if (l.elevation <= g.minY + 0.05) best = l;
      return best;
    };

    const nameOf = (id: number) => {
      const l = line(id);
      return [decodeIfcString(val(l.Name)), decodeIfcString(val(l.ObjectType))].filter(Boolean).join(" ");
    };

    // Muren
    const wallIds = new Set([...ids(T.IFCWALL), ...ids(T.IFCWALLSTANDARDCASE)]);
    const wallLevel = new Map<number, ImportedLevel>();
    for (const id of wallIds) {
      const g = geo.get(id);
      if (!g || g.pts.length < 3) { skipped.push({ kind: "muur", reason: "geen geometrie" }); continue; }
      const r = minAreaRect(g.pts.map(sh));
      if (!r || r.length < 0.05) continue;
      if (r.width > 1.2 && r.width > r.length * 0.5) { skipped.push({ kind: "muur", reason: "geen rechte muur (te breed)" }); continue; }
      const lv = levelFor(id, g);
      const half = r.length / 2;
      const p = props.get(id) ?? {};
      const statusRaw = String(p.Status ?? "").toUpperCase();
      const status: WallStatus | undefined = statusRaw.includes("DEMOLISH") ? "demolish" : statusRaw.includes("NEW") ? "new" : statusRaw.includes("EXISTING") ? "existing" : undefined;
      const text = `${nameOf(id)} ${matText.get(id) ?? ""}`;
      const w: ImportedWall = {
        ifcId: id,
        start: { x: r.center.x - r.dir.x * half, y: r.center.y - r.dir.y * half },
        end: { x: r.center.x + r.dir.x * half, y: r.center.y + r.dir.y * half },
        thickness: Math.round(r.width * 1000) / 1000,
        height: Math.round((g.maxY - g.minY) * 1000) / 1000,
        baseOffset: g.minY - lv.elevation,
        material: guessMaterial(text, r.width),
        loadBearing: typeof p.LoadBearing === "boolean" ? (p.LoadBearing as boolean) : r.width >= 0.2,
        isExternal: typeof p.IsExternal === "boolean" ? (p.IsExternal as boolean) : undefined,
        status,
        name: nameOf(id),
      };
      lv.walls.push(w);
      wallLevel.set(id, lv);
    }

    // Deuren & ramen
    for (const [type, kind] of [[T.IFCDOOR, "door"], [T.IFCWINDOW, "window"]] as const) {
      for (const id of ids(type)) {
        const g = geo.get(id);
        if (!g || g.pts.length < 3) continue;
        const r = minAreaRect(g.pts.map(sh));
        if (!r) continue;
        let wallIfc = fillWall.get(id);
        let lv = wallIfc ? wallLevel.get(wallIfc) : undefined;
        let wall = lv?.walls.find((w) => w.ifcId === wallIfc);
        if (!wall) {
          // Geen relatie: dichtstbijzijnde evenwijdige muur.
          let bestD = 0.6;
          for (const l of levels) for (const w of l.walls) {
            const d = distToLine(r.center, w.start, w.end);
            if (d < bestD && d < w.thickness / 2 + 0.3) { bestD = d; wall = w; lv = l; }
          }
          wallIfc = wall?.ifcId;
        }
        if (!wall || !lv) { skipped.push({ kind: kind === "door" ? "deur" : "raam", reason: "geen muur gevonden" }); continue; }
        const L = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
        const ux = (wall.end.x - wall.start.x) / L;
        const uy = (wall.end.y - wall.start.y) / L;
        // Breedte = uitslag langs de muur.
        let minU = Infinity, maxU = -Infinity;
        for (const q of g.pts) {
          const s = sh(q);
          const u = (s.x - wall.start.x) * ux + (s.y - wall.start.y) * uy;
          minU = Math.min(minU, u); maxU = Math.max(maxU, u);
        }
        const width = maxU - minU;
        if (width < 0.2) continue;
        const sill = Math.max(0, g.minY - lv.elevation - wall.baseOffset);
        lv.openings.push({
          ifcId: id,
          wallIfcId: wall.ifcId,
          type: kind === "door" && sill < 0.1 ? "door" : "window",
          width: round3(width),
          height: round3(g.maxY - g.minY),
          sillHeight: round3(kind === "door" ? 0 : sill),
          offset: round3((minU + maxU) / 2),
        });
      }
    }

    // Ruimtes
    for (const id of ids(T.IFCSPACE)) {
      const g = geo.get(id);
      if (!g || g.tris.length === 0) continue;
      const outline = bottomOutline(g.tris, g.minY);
      const poly = outline ?? convexHull(g.pts);
      if (poly.length < 3) continue;
      const l = line(id);
      const name = decodeIfcString(val(l.LongName)) || decodeIfcString(val(l.Name)) || "Ruimte";
      const func = decodeIfcString(val(l.ObjectType)) || undefined;
      levelFor(id, g).rooms.push({ ifcId: id, name, func, polygon: poly.map((p) => ({ x: round3(p.x - offset.x), y: round3(p.y - offset.y) })) });
    }

    // Kolommen
    for (const id of ids(T.IFCCOLUMN)) {
      const g = geo.get(id);
      if (!g || g.pts.length < 3) continue;
      const r = minAreaRect(g.pts.map(sh));
      if (!r) continue;
      const hull = convexHull(g.pts.map(sh));
      const round = hull.length > 12 && Math.abs(r.length - r.width) < 0.02;
      levelFor(id, g).columns.push({
        ifcId: id,
        position: { x: round3(r.center.x), y: round3(r.center.y) },
        size: round3(Math.max(r.length, r.width)),
        shape: round ? "round" : "square",
        height: round3(g.maxY - g.minY),
      });
    }

    // Balken
    for (const id of ids(T.IFCBEAM)) {
      const g = geo.get(id);
      if (!g || g.pts.length < 3) continue;
      const r = minAreaRect(g.pts.map(sh));
      if (!r || r.length < 0.3) continue;
      const lv = levelFor(id, g);
      const depth = g.maxY - g.minY;
      let profile: BeamProfile = "custom";
      let bestErr = 0.015;
      for (const [k, d] of BEAM_PROFILES) {
        const err = Math.abs(d.h - depth) + Math.abs(d.w - r.width);
        if (err < bestErr) { bestErr = err; profile = k; }
      }
      const half = r.length / 2;
      lv.beams.push({
        ifcId: id,
        start: { x: round3(r.center.x - r.dir.x * half), y: round3(r.center.y - r.dir.y * half) },
        end: { x: round3(r.center.x + r.dir.x * half), y: round3(r.center.y + r.dir.y * half) },
        height: round3((g.minY + g.maxY) / 2 - lv.elevation),
        profile,
        width: profile === "custom" ? round3(r.width) : undefined,
      });
    }

    // Afronden + verdiepingshoogte uit de muren als er maar één laag is.
    for (const l of levels) {
      for (const w of l.walls) {
        w.start = { x: round3(w.start.x), y: round3(w.start.y) };
        w.end = { x: round3(w.end.x), y: round3(w.end.y) };
      }
      const maxWall = Math.max(0, ...l.walls.map((w) => w.height));
      if (levels.length === 1 && maxWall > 1.8) l.height = round3(maxWall);
    }

    const schemaLine = new TextDecoder().decode(data.subarray(0, 2000)).match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i);
    return { projectName, schema: schemaLine?.[1], levels: levels.filter((l) => l.walls.length + l.rooms.length + l.columns.length + l.beams.length > 0), skipped, offset };
  } finally {
    api.CloseModel(m);
  }
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function distToLine(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
