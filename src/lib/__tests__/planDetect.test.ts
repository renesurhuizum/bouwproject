import { describe, expect, it } from "vitest";
import { detectWalls, type DetectedWall } from "../planDetect";

// Synthetische RGBA-bitmap: wit canvas, zwarte rechthoeken als "muren".
function makeImage(width: number, height: number, rects: Array<[number, number, number, number]>) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.set([255, 255, 255, 255], i * 4);
  }
  for (const [x, y, w, h] of rects) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        data.set([0, 0, 0, 255], (yy * width + xx) * 4);
      }
    }
  }
  return { width, height, data };
}

function findNear(walls: DetectedWall[], pred: (w: DetectedWall) => boolean) {
  return walls.find(pred);
}

// 0,05 m per pixel → 200×160 px = 10×8 m.
const M_PER_PX = 0.05;

describe("detectWalls", () => {
  it("detecteert een horizontale muur met juiste lengte, positie en dikte", () => {
    // Muur: x 20..179 (160 px = 8 m), y 10..15 (6 px = 0,3 m)
    const img = makeImage(200, 160, [[20, 10, 160, 6]]);
    const walls = detectWalls(img, M_PER_PX);
    const w = findNear(walls, (w) => Math.abs(w.start.y - w.end.y) < 1e-9);
    expect(w).toBeDefined();
    expect(w!.start.x).toBeCloseTo(1.0, 1);
    expect(w!.end.x).toBeCloseTo(9.0, 1);
    expect(w!.start.y).toBeCloseTo(0.65, 1); // hartlijn van rij 10-15
    expect(w!.thickness).toBeCloseTo(0.3, 1);
  });

  it("detecteert een verticale muur", () => {
    // Muur: x 100..105 (6 px = 0,3 m), y 20..139 (120 px = 6 m)
    const img = makeImage(200, 160, [[100, 20, 6, 120]]);
    const walls = detectWalls(img, M_PER_PX);
    const w = findNear(walls, (w) => Math.abs(w.start.x - w.end.x) < 1e-9);
    expect(w).toBeDefined();
    expect(w!.start.y).toBeCloseTo(1.0, 1);
    expect(w!.end.y).toBeCloseTo(7.0, 1);
    expect(w!.start.x).toBeCloseTo(5.15, 1);
    expect(w!.thickness).toBeCloseTo(0.3, 1);
  });

  it("detecteert een kamercontour als vier muren", () => {
    // Rechthoek van muren (dikte 6 px): buitenmaat 160×120 px = 8×6 m.
    const img = makeImage(200, 160, [
      [20, 10, 160, 6], // boven
      [20, 124, 160, 6], // onder
      [20, 10, 6, 120], // links
      [174, 10, 6, 120], // rechts
    ]);
    const walls = detectWalls(img, M_PER_PX);
    const horiz = walls.filter((w) => w.start.y === w.end.y);
    const vert = walls.filter((w) => w.start.x === w.end.x);
    expect(horiz.length).toBe(2);
    expect(vert.length).toBe(2);
    // De verticale muren lopen (bijna) de volledige hoogte.
    for (const w of vert) {
      expect(Math.abs(w.end.y - w.start.y)).toBeGreaterThan(5.5);
    }
  });

  it("negeert korte vlekken en dikke vlakken", () => {
    const img = makeImage(200, 160, [
      [50, 50, 6, 6], // vlekje (0,3×0,3 m)
      [100, 60, 40, 40], // vlakvulling (2×2 m) — te dik voor een muur
    ]);
    expect(detectWalls(img, M_PER_PX)).toHaveLength(0);
  });

  it("een deuropening splitst de muur in twee segmenten", () => {
    // Horizontale muur met een gat van 20 px (1 m) in het midden.
    const img = makeImage(200, 160, [
      [20, 10, 70, 6],
      [110, 10, 70, 6],
    ]);
    const walls = detectWalls(img, M_PER_PX);
    expect(walls).toHaveLength(2);
  });

  it("geeft lege lijst bij lege of ongeldige input", () => {
    expect(detectWalls(makeImage(50, 50, []), M_PER_PX)).toHaveLength(0);
    expect(detectWalls(makeImage(0, 0, []), M_PER_PX)).toHaveLength(0);
    expect(detectWalls(makeImage(50, 50, [[10, 10, 30, 4]]), 0)).toHaveLength(0);
  });
});
