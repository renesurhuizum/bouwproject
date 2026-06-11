// Dak-mesh generatie voor 3D weergave.
// Alle coördinaten in meters; Y-as omhoog (Three.js conventie).

import type { Point } from "./domain/types";

export interface RoofMeshData {
  vertices: Float32Array;   // x, y, z triplets
  indices: Uint16Array;
  normals: Float32Array;
}

function bounds2d(pts: Point[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

// Vergroot een polygoon met `amount` meter naar buiten (overhang).
function expandPolygon(pts: Point[], amount: number): Point[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const dx1 = p.x - prev.x, dy1 = p.y - prev.y;
    const dx2 = next.x - p.x, dy2 = next.y - p.y;
    const l1 = Math.hypot(dx1, dy1) || 1;
    const l2 = Math.hypot(dx2, dy2) || 1;
    // Gemiddelde normaal (naar buiten)
    const nx = (-dy1 / l1 + -dy2 / l2) / 2;
    const ny = (dx1 / l1 + dx2 / l2) / 2;
    const nl = Math.hypot(nx, ny) || 1;
    return { x: p.x + (nx / nl) * amount, y: p.y + (ny / nl) * amount };
  });
}

// Bouw een zadeldak (gable roof).
// `footprint`: dakvoet-polygoon in 2D (x, z in Three.js: x=oost, z=noord).
// `pitch`: hellingshoek in graden.
// `ridgeDir`: nokrichting in graden (0 = nok loopt noord-zuid, d.w.z. helling oost-west).
// `overhang`: dakoversteek in m.
// Geeft vertices/indices/normals voor een Three.js BufferGeometry.
export function buildGableRoof(
  footprint: Point[],
  pitch: number,
  ridgeDir: number,
  overhang: number,
  wallHeight: number,
): RoofMeshData {
  if (footprint.length < 3) {
    return { vertices: new Float32Array(0), indices: new Uint16Array(0), normals: new Float32Array(0) };
  }

  const expanded = overhang > 0 ? expandPolygon(footprint, overhang) : footprint;
  const { minX, minY, maxX, maxY } = bounds2d(expanded);

  const pitchRad = (pitch * Math.PI) / 180;
  // Nokrichting: de nok loopt in richting ridgeDir.
  // De helling loopt loodrecht op de nok.
  const nokDirRad = ((ridgeDir + 90) * Math.PI) / 180; // loodrecht op nok = richting van de helling
  const cos = Math.cos(nokDirRad);
  const sin = Math.sin(nokDirRad);

  // Project elk punt op de helling-as
  // Gebruik breedte loodrecht op de nok
  const projections = expanded.map((p) => p.x * cos + p.y * sin);
  const minProj = Math.min(...projections);
  const maxProj = Math.max(...projections);
  const halfW = (maxProj - minProj) / 2;
  const ridgeHeight = halfW * Math.tan(pitchRad);
  const ridgeMidProj = (minProj + maxProj) / 2;

  // Elk dakvoet-punt krijgt een hoogte op basis van zijn projectie op de helling-as
  function getHeight(p: Point): number {
    const proj = p.x * cos + p.y * sin;
    const distFromRidge = Math.abs(proj - ridgeMidProj);
    return wallHeight + Math.max(0, ridgeHeight - distFromRidge * Math.tan(pitchRad));
  }

  // Trianguleer het dak als een fan vanuit het centroid op de nok
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const ridgeCenterHeight = wallHeight + ridgeHeight;

  const verts: number[] = [];
  const idxs: number[] = [];
  const norms: number[] = [];

  // Voor een eenvoudig zadeldak: maak voor elk paar aangrenzende dakvoet-punten
  // een driehoek naar het nok-middelpunt (vereenvoudigd als een cirkelvormig dak).
  // We doen dit beter: twee vlakken (voorzijde en achterzijde).

  // Maak eerst het dakvoet-punt-array met hoogtes
  const pts3: Array<{ x: number; y: number; z: number }> = expanded.map((p) => ({
    x: p.x,
    y: getHeight(p),
    z: p.y,
  }));

  // Nok-lijn: twee punten langs de nok-richting
  const nokDir = { x: Math.cos(((ridgeDir) * Math.PI) / 180), z: Math.sin(((ridgeDir) * Math.PI) / 180) };
  const nokHalfLen = Math.hypot(maxX - minX, maxY - minY) / 2;

  const nok1 = { x: cx + nokDir.x * nokHalfLen, y: ridgeCenterHeight, z: cy + nokDir.z * nokHalfLen };
  const nok2 = { x: cx - nokDir.x * nokHalfLen, y: ridgeCenterHeight, z: cy - nokDir.z * nokHalfLen };

  function addTriangle(
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
    c: { x: number; y: number; z: number },
  ) {
    const base = verts.length / 3;
    verts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    idxs.push(base, base + 1, base + 2);
    // Normaal via cross-product
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
    const nx_ = aby * acz - abz * acy;
    const ny_ = abz * acx - abx * acz;
    const nz_ = abx * acy - aby * acx;
    const nl = Math.hypot(nx_, ny_, nz_) || 1;
    norms.push(nx_ / nl, ny_ / nl, nz_ / nl);
    norms.push(nx_ / nl, ny_ / nl, nz_ / nl);
    norms.push(nx_ / nl, ny_ / nl, nz_ / nl);
  }

  // Verbind elke zijde van de dakvoet met de nok-lijn
  const n = pts3.length;
  for (let i = 0; i < n; i++) {
    const a = pts3[i];
    const b = pts3[(i + 1) % n];
    // Bepaal dichtstbijzijnde nok-punt
    const projA = (a.x - cx) * nokDir.x + (a.z - cy) * nokDir.z;
    const projB = (b.x - cx) * nokDir.x + (b.z - cy) * nokDir.z;
    const na = projA > 0 ? nok1 : nok2;
    const nb = projB > 0 ? nok1 : nok2;
    if (na === nb) {
      addTriangle(a, b, na);
    } else {
      addTriangle(a, b, na);
      addTriangle(b, nb, na);
    }
  }

  return {
    vertices: new Float32Array(verts),
    indices: new Uint16Array(idxs),
    normals: new Float32Array(norms),
  };
}

// Bouw een lessenaarsdak (shed roof) — één hellend vlak.
export function buildShedRoof(
  footprint: Point[],
  pitch: number,
  ridgeDir: number,
  overhang: number,
  wallHeight: number,
): RoofMeshData {
  if (footprint.length < 3) {
    return { vertices: new Float32Array(0), indices: new Uint16Array(0), normals: new Float32Array(0) };
  }

  const expanded = overhang > 0 ? expandPolygon(footprint, overhang) : footprint;
  const pitchRad = (pitch * Math.PI) / 180;
  const slopeDir = ((ridgeDir + 90) * Math.PI) / 180;
  const cos = Math.cos(slopeDir);
  const sin = Math.sin(slopeDir);

  const projections = expanded.map((p) => p.x * cos + p.y * sin);
  const minProj = Math.min(...projections);

  function getHeight(p: Point): number {
    const proj = p.x * cos + p.y * sin;
    return wallHeight + (proj - minProj) * Math.tan(pitchRad);
  }

  const pts3 = expanded.map((p) => ({ x: p.x, y: getHeight(p), z: p.y }));
  const verts: number[] = [];
  const idxs: number[] = [];
  const norms: number[] = [];

  // Trianguleer als fan vanuit eerste punt
  for (let i = 1; i < pts3.length - 1; i++) {
    const base = verts.length / 3;
    const a = pts3[0], b = pts3[i], c = pts3[i + 1];
    verts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    idxs.push(base, base + 1, base + 2);
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    for (let k = 0; k < 3; k++) norms.push(nx / nl, ny / nl, nz / nl);
  }

  return {
    vertices: new Float32Array(verts),
    indices: new Uint16Array(idxs),
    normals: new Float32Array(norms),
  };
}

// Plat dak — eenvoudig vlak op wallHeight + kleine ophoging.
export function buildFlatRoof(footprint: Point[], overhang: number, wallHeight: number): RoofMeshData {
  const expanded = overhang > 0 ? expandPolygon(footprint, overhang) : footprint;
  const y = wallHeight + 0.1;
  const pts3 = expanded.map((p) => ({ x: p.x, y, z: p.y }));
  const verts: number[] = [];
  const idxs: number[] = [];
  const norms: number[] = [];

  for (let i = 1; i < pts3.length - 1; i++) {
    const base = verts.length / 3;
    const a = pts3[0], b = pts3[i], c = pts3[i + 1];
    verts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    idxs.push(base, base + 1, base + 2);
    for (let k = 0; k < 3; k++) norms.push(0, 1, 0);
  }

  return {
    vertices: new Float32Array(verts),
    indices: new Uint16Array(idxs),
    normals: new Float32Array(norms),
  };
}
