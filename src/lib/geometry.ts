// 2D-geometrie in meters. Pure functies, geen mutatie.

import type { Point } from "./domain/types";

export function dist(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function snapToGrid(p: Point, grid: number): Point {
  return {
    x: Math.round(p.x / grid) * grid,
    y: Math.round(p.y / grid) * grid,
  };
}

// Zoek het dichtstbijzijnde bestaande punt binnen `radius` (m).
export function snapToPoints(p: Point, points: Point[], radius: number): Point | null {
  let best: Point | null = null;
  let bestD = radius;
  for (const q of points) {
    const d = dist(p, q);
    if (d <= bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}

// Oppervlak van een (gesloten) polygoon via de schoenveterformule. m².
export function polygonArea(poly: Point[]): number {
  if (poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function polygonCentroid(poly: Point[]): Point {
  if (poly.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

// Hoek van een lijnsegment in radialen.
export function angle(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

// Afstand van punt p tot lijnsegment a-b (m).
export function distToSegment(p: Point, a: Point, b: Point): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}

// Projecteer punt p op segment a-b. Geeft t (0..1), het punt en de afstand.
export function projectOnSegment(
  p: Point,
  a: Point,
  b: Point,
): { t: number; point: Point; dist: number } {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return { t: 0, point: a, dist: dist(p, a) };
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  return { t, point, dist: dist(p, point) };
}

// Constrain cursor to nearest angle multiple (45° default) from origin.
// Used for Shift-ortho drawing.
export function constrainToAngle(cursor: Point, origin: Point, stepDeg = 45): Point {
  const dx = cursor.x - origin.x;
  const dy = cursor.y - origin.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.0001) return cursor;
  const a = Math.atan2(dy, dx);
  const step = (stepDeg * Math.PI) / 180;
  const snapped = Math.round(a / step) * step;
  return { x: origin.x + d * Math.cos(snapped), y: origin.y + d * Math.sin(snapped) };
}

// Compute a convex-hull fill polygon for a wall junction point.
// Returns flat [x, y, x, y, …] screen-coord array ready for Konva.
// Each wall contributes its two near-corner points at `endpoint`.
export function getCornerFillPoints(endpoint: Point, walls: Array<{ start: Point; end: Point; thickness: number }>): Point[] {
  if (walls.length < 2) return [];
  const pts: Point[] = [];
  for (const w of walls) {
    const len = dist(w.start, w.end);
    if (len < 0.001) continue;
    const dx = (w.end.x - w.start.x) / len;
    const dy = (w.end.y - w.start.y) / len;
    const ht = w.thickness / 2;
    pts.push({ x: endpoint.x - dy * ht, y: endpoint.y + dx * ht });
    pts.push({ x: endpoint.x + dy * ht, y: endpoint.y - dx * ht });
  }
  if (pts.length < 3) return pts;
  // Sort by angle from centroid → gives convex hull for these near-perpendicular points.
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  pts.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  return pts;
}

// Spiegel een set punten rond een spil-punt langs de horizontale ("h": x flipt)
// of verticale ("v": y flipt) as.
export function mirrorPoints(pts: Point[], axis: "h" | "v", pivot: Point): Point[] {
  return pts.map((p) =>
    axis === "h"
      ? { x: 2 * pivot.x - p.x, y: p.y }
      : { x: p.x, y: 2 * pivot.y - p.y },
  );
}

// Snijpunt van de oneindige verlengingen van twee muren (lijnen door start→end).
// Geeft null bij (vrijwel) parallelle lijnen.
export function wallIntersection(
  a: { start: Point; end: Point },
  b: { start: Point; end: Point },
): Point | null {
  const x1 = a.start.x, y1 = a.start.y, x2 = a.end.x, y2 = a.end.y;
  const x3 = b.start.x, y3 = b.start.y, x4 = b.end.x, y4 = b.end.y;
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-9) return null; // parallel of degeneraat
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

// Ligt punt p binnen de (as-georiënteerde) rechthoek min..max?
export function pointInRect(p: Point, min: Point, max: Point): boolean {
  return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y;
}

// Bounding box van een set punten.
export function bounds(points: Point[]): { min: Point; max: Point } {
  if (points.length === 0) {
    return { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

// Punt-in-polygon (ray casting). Randpunten tellen als binnen
// (kwadratische afstand, tolerantie 1 mm — geen sqrt in de hot loop).
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const ex = p.x - (a.x + t * dx);
    const ey = p.y - (a.y + t * dy);
    if (ex * ex + ey * ey < 1e-6) return true;
    const intersects =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}
