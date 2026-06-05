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
