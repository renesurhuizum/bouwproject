// Dak-mesh generatie. Pure berekening op basis van de bounding box van de
// dakvoet (W = breedte langs X, D = diepte langs Z). Geeft losse driehoeken
// terug (positions + indices); normalen worden door three berekend, materiaal
// rendert dubbelzijdig zodat winding er niet toe doet.
//
// Coördinaten: gecentreerd op de oorsprong, y=0 op de dakvoet (eaves),
// +y omhoog. De nok loopt langs de X-as (ridgeDirection draait het geheel
// in de 3D-scene).

import type { Dormer, Point, Roof, RoofType, Wall } from "./domain/types";
import { bounds } from "./geometry";

export interface RoofMesh {
  positions: number[];
  indices: number[];
  /** UV's in METERS, zodat een dakpan overal even groot is. */
  uvs: number[];
  ridgeHeight: number;
  ridgeStart: number; // lokale x van het begin van de nok
  ridgeEnd: number; // lokale x van het einde van de nok
}

// Wolfseind / schild aan een kopse kant: `run` = horizontale afstand van de
// dakrand (incl. overstek) tot het begin van de nok, `foot` = hoogte van de
// onderrand van het schildvlak boven de dakvoet (0 = volledig schild).
export interface HipEnd {
  run: number;
  foot: number;
}

export interface RoofOptions {
  gableEnds?: boolean;
  hipStart?: HipEnd; // kant x-
  hipEnd?: HipEnd; // kant x+
}

/** Afmetingen van de dakvoet, afgeleid uit de bounding box van de muren. */
export interface RoofFootprint {
  /** Breedte langs X (m). */
  W: number;
  /** Diepte langs Z (m). */
  D: number;
  /** Middelpunt in wereldcoördinaten (x, y = wereld-z). */
  center: Point;
}

/**
 * De dakvoet zoals de 3D-scene hem afleidt: de bounding box van de muren, of
 * van `roof.polygon` als die is ingevuld. Eén functie, zodat de plattegrond,
 * de hoogtelijnen en de oppervlakteberekening niet uiteen kunnen lopen.
 * Geeft `null` als er niets is om een dak op te zetten.
 */
export function roofFootprint(roof: Roof, walls: Wall[]): RoofFootprint | null {
  const pts =
    roof.polygon && roof.polygon.length >= 3
      ? roof.polygon
      : walls.flatMap((w) => [w.start, w.end]);
  if (pts.length < 2) return null;
  const bb = bounds(pts);
  const W = bb.max.x - bb.min.x;
  const D = bb.max.y - bb.min.y;
  if (!isFinite(W) || !isFinite(D) || W <= 0 || D <= 0) return null;
  return {
    W,
    D,
    center: { x: (bb.min.x + bb.max.x) / 2, y: (bb.min.y + bb.max.y) / 2 },
  };
}

function builder() {
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  // UV in meters: u langs de nokrichting (X), v langs het hellend vlak. Het
  // hellingvlak wordt "uitgeslagen" zodat pannen op het schuine dak niet
  // uitgerekt lijken; daarom v = de gemeten lengte langs de helling.
  const v = (x: number, y: number, z: number, u = x, w = Math.hypot(z, y)) => {
    positions.push(x, y, z);
    uvs.push(u, w);
    return positions.length / 3 - 1;
  };
  // Winding omgekeerd, zodat de normalen naar BUITEN wijzen. Dat is niet
  // cosmetisch: `computeVertexNormals` leidt de belichting eruit af, dus met
  // de normalen naar binnen krijgt het dak zijn licht van de verkeerde kant en
  // ziet het er vlak uit. Nu is FrontSide de pannenkant en BackSide het
  // dakbeschot dat je vanaf de zolder ziet.
  const tri = (a: number, b: number, c: number) => indices.push(a, c, b);
  const quad = (a: number, b: number, c: number, d: number) => {
    tri(a, b, c);
    tri(a, c, d);
  };
  return { positions, indices, uvs, v, tri, quad };
}

export function buildRoof(
  type: RoofType,
  W: number,
  D: number,
  pitchDeg: number,
  overhang: number,
  opts: RoofOptions = {},
): RoofMesh {
  const gableEnds = opts.gableEnds ?? true;
  const b = builder();
  const hw = W / 2 + overhang;
  const hd = D / 2 + overhang;
  const pitch = (pitchDeg * Math.PI) / 180;

  if (type === "flat") {
    const a = b.v(-hw, 0, -hd);
    const c = b.v(hw, 0, -hd);
    const d = b.v(hw, 0, hd);
    const e = b.v(-hw, 0, hd);
    b.quad(a, c, d, e);
    return { positions: b.positions, indices: b.indices, uvs: b.uvs, ridgeHeight: 0, ridgeStart: -hw, ridgeEnd: hw };
  }

  if (type === "shed") {
    const h = Math.tan(pitch) * (2 * hd);
    const a = b.v(-hw, 0, -hd);
    const c = b.v(hw, 0, -hd);
    const d = b.v(hw, h, hd);
    const e = b.v(-hw, h, hd);
    b.quad(a, c, d, e);
    return { positions: b.positions, indices: b.indices, uvs: b.uvs, ridgeHeight: h, ridgeStart: -hw, ridgeEnd: hw };
  }

  if (type === "hip") {
    const h = Math.tan(pitch) * (D / 2);
    const rx = Math.max(0, hw - hd); // 45° heupen
    const r0 = b.v(-rx, h, 0);
    const r1 = b.v(rx, h, 0);
    const A = b.v(-hw, 0, -hd);
    const B = b.v(hw, 0, -hd);
    const C = b.v(hw, 0, hd);
    const Dd = b.v(-hw, 0, hd);
    b.quad(A, B, r1, r0); // lange schuine vlak (z-)
    b.quad(Dd, r0, r1, C); // lange schuine vlak (z+)
    b.tri(A, r0, Dd); // heupvlak x-
    b.tri(B, C, r1); // heupvlak x+
    return { positions: b.positions, indices: b.indices, uvs: b.uvs, ridgeHeight: h, ridgeStart: -rx, ridgeEnd: rx };
  }

  // gable (zadeldak) + mansard (benaderd als steil zadeldak), optioneel met
  // wolfseind/schild aan één of beide kopse kanten.
  const tan = Math.tan(pitch);
  const h = tan * hd;
  const footZ = (foot: number) => Math.max(0, hd - foot / tan); // |z| waar het dakvlak `foot` bereikt
  const hs = opts.hipStart;
  const he = opts.hipEnd;
  const r0 = b.v(-hw + (hs ? hs.run : 0), h, 0);
  const r1 = b.v(hw - (he ? he.run : 0), h, 0);
  const A = b.v(-hw, 0, -hd);
  const B = b.v(hw, 0, -hd);
  const C = b.v(hw, 0, hd);
  const Dd = b.v(-hw, 0, hd);
  const Ps = hs && hs.foot > 0.001 ? [b.v(-hw, hs.foot, -footZ(hs.foot)), b.v(-hw, hs.foot, footZ(hs.foot))] : null;
  const Pe = he && he.foot > 0.001 ? [b.v(hw, he.foot, -footZ(he.foot)), b.v(hw, he.foot, footZ(he.foot))] : null;
  const fan = (pts: number[]) => {
    for (let i = 1; i < pts.length - 1; i++) b.tri(pts[0], pts[i], pts[i + 1]);
  };
  // dakvlak z-  en  z+ (winding zo dat de normalen naar buiten wijzen, zie builder)
  fan([A, B, ...(Pe ? [Pe[0]] : []), r1, r0, ...(Ps ? [Ps[0]] : [])]);
  fan([Dd, ...(Ps ? [Ps[1]] : []), r0, r1, ...(Pe ? [Pe[1]] : []), C]);
  // kopse kant x-
  if (hs) b.tri(Ps ? Ps[0] : A, r0, Ps ? Ps[1] : Dd);
  if ((!hs || Ps) && gableEnds) {
    if (Ps) b.quad(A, Ps[0], Ps[1], Dd);
    else b.tri(A, r0, Dd);
  }
  // kopse kant x+
  if (he) b.tri(Pe ? Pe[0] : B, Pe ? Pe[1] : C, r1);
  if ((!he || Pe) && gableEnds) {
    if (Pe) b.quad(B, C, Pe[1], Pe[0]);
    else b.tri(B, C, r1);
  }
  return {
    positions: b.positions,
    indices: b.indices,
    uvs: b.uvs,
    ridgeHeight: h,
    ridgeStart: -hw + (hs ? hs.run : 0),
    ridgeEnd: hw - (he ? he.run : 0),
  };
}

// Hoogte van het dakvlak (boven de dakvoet) op lokaal punt (x, z) voor een
// zadeldak met optionele wolfseinden. Buiten het dak: 0.
export function gableRoofHeightAt(W: number, D: number, pitchDeg: number, overhang: number, x: number, z: number, opts: RoofOptions = {}): number {
  const hw = W / 2 + overhang;
  const hd = D / 2 + overhang;
  const tan = Math.tan((pitchDeg * Math.PI) / 180);
  const H = tan * hd;
  let y = tan * (hd - Math.abs(z));
  if (opts.hipStart) y = Math.min(y, opts.hipStart.foot + ((x + hw) * (H - opts.hipStart.foot)) / opts.hipStart.run);
  if (opts.hipEnd) y = Math.min(y, opts.hipEnd.foot + ((hw - x) * (H - opts.hipEnd.foot)) / opts.hipEnd.run);
  return Math.max(0, y);
}

// ── Dakhoogte op een punt ────────────────────────────────────────────────────
//
// Dit is de bouwsteen die ontbrak. `buildRoof` maakte wel een mesh, maar er was
// geen manier om te vragen "hoe hoog is het dak hier?" — en zonder dat antwoord
// kun je niet zeggen hoeveel van een zolder bruikbaar is, waar een kniewand
// hoort, of hoe de hoogtelijnen op de plattegrond lopen.
//
// Zelfde stelsel als buildRoof: oorsprong in het midden van de dakvoet, y = 0
// op de dakvoet, nok langs de X-as.

/** Hoogte van de onderkant van het dakvlak (m boven de dakvoet). */
export function roofHeightAt(
  type: RoofType,
  W: number,
  D: number,
  pitchDeg: number,
  overhang: number,
  local: Point,
  opts: RoofOptions = {},
): number {
  const hw = W / 2 + overhang;
  const hd = D / 2 + overhang;
  const pitch = (pitchDeg * Math.PI) / 180;
  const t = Math.tan(pitch);

  // Buiten de dakvoet is er geen dak meer.
  if (Math.abs(local.x) > hw || Math.abs(local.y) > hd) return 0;

  if (type === "flat") return 0;

  if (type === "shed") {
    // Loopt lineair op van z = −hd (0) naar z = +hd (h).
    return Math.max(0, t * (local.y + hd));
  }

  if (type === "hip") {
    // Zadeldak-profiel dwars, plus aflopende heupen aan de uiteinden.
    const alongRidge = t * (hd - Math.abs(local.y));
    const rx = Math.max(0, hw - hd);
    const atHip = Math.abs(local.x) <= rx ? Infinity : t * (hw - Math.abs(local.x));
    return Math.max(0, Math.min(alongRidge, atHip));
  }

  // gable + mansard (benaderd als steil zadeldak, net als in buildRoof),
  // eventueel met wolfseinden.
  return gableRoofHeightAt(W, D, pitchDeg, overhang, local.x, local.y, opts);
}

/** Wereldpunt → lokaal dakstelsel (zelfde centrering/rotatie als de 3D-mesh). */
export function toRoofLocal(world: Point, roof: Roof, fp: RoofFootprint): Point {
  const dx = world.x - fp.center.x;
  const dz = world.y - fp.center.y;
  // RoofMesh3D roteert de groep met −ridgeDirection; om een wereldpunt in dat
  // stelsel te krijgen draaien we de andere kant op.
  const a = (roof.ridgeDirection * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return { x: dx * cos - dz * sin, y: dx * sin + dz * cos };
}

/** Lokaal dakstelsel → wereld. */
export function fromRoofLocal(local: Point, roof: Roof, fp: RoofFootprint): Point {
  const a = -(roof.ridgeDirection * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return {
    x: local.x * cos - local.y * sin + fp.center.x,
    y: local.x * sin + local.y * cos + fp.center.y,
  };
}

export interface Segment {
  a: Point;
  b: Point;
}

/**
 * Waar bereikt het dak precies deze hoogte? Analytisch per daktype, dus exacte
 * lijnen in plaats van een benadering uit een raster. Gebruikt voor de
 * hoogtelijnen op de plattegrond én voor de plaatsing van kniewanden.
 * Geeft wereldcoördinaten terug.
 */
export function roofContourLines(
  roof: Roof,
  fp: RoofFootprint,
  headroom: number,
): Segment[] {
  const { W, D } = fp;
  const hw = W / 2 + roof.overhang;
  const hd = D / 2 + roof.overhang;
  const t = Math.tan((roof.pitch * Math.PI) / 180);
  if (t <= 0 || headroom <= 0) return [];

  const seg = (ax: number, ay: number, bx: number, by: number): Segment => ({
    a: fromRoofLocal({ x: ax, y: ay }, roof, fp),
    b: fromRoofLocal({ x: bx, y: by }, roof, fp),
  });

  if (roof.type === "flat") return [];

  if (roof.type === "shed") {
    // Eén lijn dwars op de helling.
    const z = headroom / t - hd;
    if (z < -hd || z > hd) return [];
    return [seg(-hw, z, hw, z)];
  }

  // Afstand vanaf de nok waar het dak `headroom` hoog is.
  const dz = hd - headroom / t;
  if (dz <= 0) return []; // nergens hoog genoeg
  const z = Math.min(dz, hd);

  if (roof.type === "hip") {
    // Rechthoek: ook de heupen aan de uiteinden lopen af.
    const dxHip = hw - headroom / t;
    if (dxHip <= 0) return [];
    const x = Math.min(dxHip, hw);
    return [
      seg(-x, -z, x, -z),
      seg(-x, z, x, z),
      seg(-x, -z, -x, z),
      seg(x, -z, x, z),
    ];
  }

  // gable + mansard: twee lijnen evenwijdig aan de nok.
  return [seg(-hw, -z, hw, -z), seg(-hw, z, hw, z)];
}

// ── Uitsparingen voor dakkapellen ─────────────────────────────────────────────
//
// Een dakkapel die alleen bovenop het dakvlak staat levert niets op: van
// binnenuit kijk je nog steeds tegen het dak aan. Daarom snijden we zijn
// footprint uit de dakmesh.
//
// De uitsparing is een rechthoek in het lokale dakstelsel (x = langs de nok,
// z = over de helling). We knippen elke driehoek tegen de vier vlakken van die
// rechthoek: het deel búiten een vlak is gegarandeerd buiten het gat en blijft
// staan, het deel erbinnen gaat door naar het volgende vlak. Wat na alle vier
// overblijft ligt in het gat en vervalt. Zo ontstaan geen overlappingen.

/** Rechthoekige uitsparing in het lokale dakstelsel. */
export interface RoofHole {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

interface Vtx {
  x: number;
  y: number;
  z: number;
  u: number;
  v: number;
}

/** Tekenafstand tot een verticaal knipvlak; positief = behouden. */
type Dist = (p: Vtx) => number;

function lerp(a: Vtx, b: Vtx, t: number): Vtx {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    u: a.u + (b.u - a.u) * t,
    v: a.v + (b.v - a.v) * t,
  };
}

/** Sutherland–Hodgman: houdt het deel van de polygoon waar `d` ≥ 0. */
function clip(poly: Vtx[], d: Dist): Vtx[] {
  const out: Vtx[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const da = d(a);
    const db = d(b);
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      if (isFinite(t)) out.push(lerp(a, b, t));
    }
  }
  return out;
}

export function cutRoofHoles(mesh: RoofMesh, holes: RoofHole[]): RoofMesh {
  if (holes.length === 0) return mesh;

  const read = (i: number): Vtx => ({
    x: mesh.positions[i * 3],
    y: mesh.positions[i * 3 + 1],
    z: mesh.positions[i * 3 + 2],
    u: mesh.uvs[i * 2],
    v: mesh.uvs[i * 2 + 1],
  });

  let tris: Vtx[][] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    tris.push([read(mesh.indices[i]), read(mesh.indices[i + 1]), read(mesh.indices[i + 2])]);
  }

  for (const h of holes) {
    // Naar binnen wijzende vlakken van de rechthoek.
    const planes: Dist[] = [
      (p) => p.x - h.x0,
      (p) => h.x1 - p.x,
      (p) => p.z - h.z0,
      (p) => h.z1 - p.z,
    ];
    const kept: Vtx[][] = [];
    let remaining = tris;
    for (const plane of planes) {
      const next: Vtx[][] = [];
      for (const poly of remaining) {
        const outside = clip(poly, (p) => -plane(p));
        if (outside.length >= 3) kept.push(outside);
        const inside = clip(poly, plane);
        if (inside.length >= 3) next.push(inside);
      }
      remaining = next;
    }
    // `remaining` ligt binnen alle vier de vlakken: dat is het gat.
    tris = kept;
  }

  // Waaier-triangulatie: elke polygoon hier is convex (doorsnede van
  // halfvlakken met een driehoek), dus dat mag.
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const poly of tris) {
    const base = positions.length / 3;
    for (const p of poly) {
      positions.push(p.x, p.y, p.z);
      uvs.push(p.u, p.v);
    }
    for (let i = 1; i < poly.length - 1; i++) indices.push(base, base + i, base + i + 1);
  }
  return { positions, indices, uvs, ridgeHeight: mesh.ridgeHeight, ridgeStart: mesh.ridgeStart, ridgeEnd: mesh.ridgeEnd };
}

/** Diepte van een dakkapel over de helling (m) — zoals de 3D-scene hem tekent. */
export const DORMER_DEPTH_M = 1.1;

/**
 * De uitsparingen die een set dakkapellen in dít dak maakt. Een velux ligt
 * ín het dakvlak en snijdt dus niets weg.
 */
export function dormerHoles(roof: Roof, fp: RoofFootprint, dormers: Dormer[]): RoofHole[] {
  const out: RoofHole[] = [];
  for (const d of dormers) {
    if (d.deleted || d.type === "velux") continue;
    const local = toRoofLocal(d.position, roof, fp);
    out.push({
      x0: local.x - d.width / 2,
      x1: local.x + d.width / 2,
      z0: local.y - DORMER_DEPTH_M / 2,
      z1: local.y + DORMER_DEPTH_M / 2,
    });
  }
  return out;
}
