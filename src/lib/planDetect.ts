// Heuristische muurdetectie op een gescande/gefotografeerde plattegrond.
// Werkt op strakke, contrastrijke (zwart-wit)plattegronden met as-gerichte
// muren: binariseer, zoek donkere "runs" per rij/kolom en voeg aangrenzende
// runs samen tot banden (= muurkandidaten met dikte). Puur en zonder DOM,
// zodat het unit-testbaar is; de aanroeper levert ImageData-achtige input.

import type { Point } from "./domain/types";

export interface DetectedWall {
  start: Point; // meters, t.o.v. de linkerbovenhoek van de afbeelding
  end: Point;
  thickness: number; // meters
}

export interface DetectOptions {
  /** Luminantiedrempel 0-255; donkerder = muur. */
  threshold?: number;
  /** Kandidaten korter dan dit worden genegeerd (m). */
  minWallLengthM?: number;
  /** Banden dikker dan dit zijn geen muur (m) — filtert vlakvullingen. */
  maxWallThicknessM?: number;
}

interface ImageLike {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array; // RGBA
}

interface Band {
  startPrimary: number; // eerste rij (of kolom) van de band
  endPrimary: number; // laatste rij (of kolom)
  min: number; // run-begin langs de secundaire as (mediaanbenadering)
  max: number; // run-einde
  rows: number;
}

function binarize(img: ImageLike, threshold: number): Uint8Array {
  const { width, height, data } = img;
  const out = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    // Luminantie (Rec. 601); alpha < 128 telt als achtergrond.
    const lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    out[i] = data[o + 3] >= 128 && lum < threshold ? 1 : 0;
  }
  return out;
}

// Donkere runs langs één lijn (rij of kolom).
function lineRuns(
  grid: Uint8Array,
  lineIndex: number,
  lineLength: number,
  at: (line: number, pos: number) => number,
  minRunPx: number,
): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let start = -1;
  for (let p = 0; p <= lineLength; p++) {
    const v = p < lineLength ? grid[at(lineIndex, p)] : 0;
    if (v && start < 0) start = p;
    if (!v && start >= 0) {
      if (p - start >= minRunPx) runs.push([start, p - 1]);
      start = -1;
    }
  }
  return runs;
}

function overlap(a: [number, number], b: Band): number {
  const lo = Math.max(a[0], b.min);
  const hi = Math.min(a[1], b.max);
  return hi - lo + 1;
}

// Voeg per-lijn-runs samen tot banden over aangrenzende lijnen.
function collectBands(
  grid: Uint8Array,
  primaryCount: number, // aantal rijen (horizontaal) of kolommen (verticaal)
  secondaryCount: number,
  at: (line: number, pos: number) => number,
  minRunPx: number,
): Band[] {
  const done: Band[] = [];
  let active: Band[] = [];
  for (let line = 0; line < primaryCount; line++) {
    const runs = lineRuns(grid, line, secondaryCount, at, minRunPx);
    const next: Band[] = [];
    const used = new Set<Band>();
    for (const run of runs) {
      // Beste overlappende actieve band die op de vorige lijn eindigde.
      let best: Band | null = null;
      let bestOv = 0;
      for (const b of active) {
        if (used.has(b) || b.endPrimary !== line - 1) continue;
        const ov = overlap(run, b);
        const shorter = Math.min(run[1] - run[0], b.max - b.min) + 1;
        if (ov > bestOv && ov >= shorter * 0.6) {
          best = b;
          bestOv = ov;
        }
      }
      if (best) {
        used.add(best);
        best.endPrimary = line;
        best.rows += 1;
        // Schuif het bereik geleidelijk mee (robust tegen rafelranden).
        best.min = Math.round((best.min * (best.rows - 1) + run[0]) / best.rows);
        best.max = Math.round((best.max * (best.rows - 1) + run[1]) / best.rows);
        next.push(best);
      } else {
        next.push({ startPrimary: line, endPrimary: line, min: run[0], max: run[1], rows: 1 });
      }
    }
    for (const b of active) if (!next.includes(b)) done.push(b);
    active = next;
  }
  done.push(...active);
  return done;
}

export function detectWalls(
  img: ImageLike,
  mPerPx: number,
  opts: DetectOptions = {},
): DetectedWall[] {
  const threshold = opts.threshold ?? 140;
  const minLenM = opts.minWallLengthM ?? 0.5;
  const maxThickM = opts.maxWallThicknessM ?? 0.6;
  if (mPerPx <= 0 || img.width === 0 || img.height === 0) return [];

  const grid = binarize(img, threshold);
  const minRunPx = Math.max(3, Math.round(minLenM / mPerPx));
  const walls: DetectedWall[] = [];

  const pushBand = (b: Band, horizontal: boolean) => {
    const thicknessM = (b.endPrimary - b.startPrimary + 1) * mPerPx;
    const lengthM = (b.max - b.min + 1) * mPerPx;
    if (thicknessM > maxThickM || thicknessM <= 0) return;
    if (lengthM < minLenM) return;
    // Een muur moet duidelijk langer zijn dan dik, anders is het een vlek.
    if (lengthM < thicknessM * 2) return;
    const centerPrimaryM = ((b.startPrimary + b.endPrimary + 1) / 2) * mPerPx;
    const thickness = Math.min(maxThickM, Math.max(0.05, thicknessM));
    walls.push(
      horizontal
        ? {
            start: { x: b.min * mPerPx, y: centerPrimaryM },
            end: { x: (b.max + 1) * mPerPx, y: centerPrimaryM },
            thickness,
          }
        : {
            start: { x: centerPrimaryM, y: b.min * mPerPx },
            end: { x: centerPrimaryM, y: (b.max + 1) * mPerPx },
            thickness,
          },
    );
  };

  // Horizontale muren: banden over rijen.
  for (const b of collectBands(
    grid,
    img.height,
    img.width,
    (row, x) => row * img.width + x,
    minRunPx,
  )) {
    pushBand(b, true);
  }
  // Verticale muren: banden over kolommen.
  for (const b of collectBands(
    grid,
    img.width,
    img.height,
    (col, y) => y * img.width + col,
    minRunPx,
  )) {
    pushBand(b, false);
  }

  return walls;
}
