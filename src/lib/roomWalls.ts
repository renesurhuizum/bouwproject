// Bepaalt welke muren bij een ruimte horen (als zijden van het polygon).
// Gebruikt voor wandaanzichten op de aanzichten- en werkbladpagina.

import type { Wall, Point } from "./domain/types";
import { dist, projectOnSegment } from "./geometry";

const SNAP_DIST = 0.8; // m

export function roomWalls(roomPolygon: Point[], walls: Wall[]): Wall[] {
  if (roomPolygon.length < 2) return [];
  const result: Wall[] = [];
  for (let i = 0; i < roomPolygon.length; i++) {
    const a = roomPolygon[i];
    const b = roomPolygon[(i + 1) % roomPolygon.length];
    let best: Wall | null = null;
    let bestScore = 0;
    for (const w of walls) {
      const len = dist(w.start, w.end);
      if (len < 0.01) continue;
      const { dist: da } = projectOnSegment(a, w.start, w.end);
      const { dist: db } = projectOnSegment(b, w.start, w.end);
      if (da < SNAP_DIST && db < SNAP_DIST) {
        const score = 1 / (da + db + 0.001);
        if (score > bestScore) {
          best = w;
          bestScore = score;
        }
      }
    }
    if (best && !result.find((r) => r.id === best!.id)) result.push(best);
  }
  return result;
}
