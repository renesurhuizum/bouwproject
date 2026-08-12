// Vangnet voor de pure geometrie-helpers. Deze functies zijn de basis onder
// snapping, hoeveelheden en (straks) kabelroutering — regressies hier zijn duur.

import { describe, expect, it } from "vitest";
import {
  bounds,
  constrainToAngle,
  dist,
  distToSegment,
  mirrorPoints,
  pointInPolygon,
  pathLength,
  pointInRect,
  polygonArea,
  projectOnSegment,
  segmentIntersection,
  snapToGrid,
  snapToPoints,
  wallIntersection,
} from "./geometry";

describe("dist", () => {
  it("meet de 3-4-5-driehoek", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("snapToGrid", () => {
  it("rondt af op het dichtstbijzijnde rasterpunt", () => {
    expect(snapToGrid({ x: 0.13, y: 0.27 }, 0.1)).toEqual({
      x: expect.closeTo(0.1, 6),
      y: expect.closeTo(0.3, 6),
    });
  });
});

describe("snapToPoints", () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
  ];

  it("pakt het dichtstbijzijnde punt binnen de straal", () => {
    expect(snapToPoints({ x: 4.9, y: 0.05 }, pts, 0.2)).toEqual({ x: 5, y: 0 });
  });

  it("geeft null buiten de straal", () => {
    expect(snapToPoints({ x: 2.5, y: 2.5 }, pts, 0.2)).toBeNull();
  });
});

describe("pathLength", () => {
  it("telt de segmenten van een polylijn op", () => {
    expect(
      pathLength([
        { x: 0, y: 0 },
        { x: 3, y: 4 }, // 5
        { x: 3, y: 6 }, // 2
      ]),
    ).toBeCloseTo(7, 6);
  });

  it("geeft 0 bij minder dan twee punten", () => {
    expect(pathLength([])).toBe(0);
    expect(pathLength([{ x: 1, y: 1 }])).toBe(0);
  });
});

describe("polygonArea", () => {
  it("rekent een rechthoek van 4×3", () => {
    expect(
      polygonArea([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ]),
    ).toBe(12);
  });

  it("is richtingsonafhankelijk (met de klok mee = zelfde oppervlak)", () => {
    expect(
      polygonArea([
        { x: 0, y: 0 },
        { x: 0, y: 3 },
        { x: 4, y: 3 },
        { x: 4, y: 0 },
      ]),
    ).toBe(12);
  });

  it("geeft 0 bij minder dan 3 punten", () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });
});

describe("projectOnSegment", () => {
  it("projecteert loodrecht op het midden", () => {
    const r = projectOnSegment({ x: 2, y: 1 }, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(r.t).toBeCloseTo(0.5, 6);
    expect(r.point).toEqual({ x: 2, y: 0 });
    expect(r.dist).toBeCloseTo(1, 6);
  });

  it("klemt voorbij het eindpunt op t=1", () => {
    const r = projectOnSegment({ x: 9, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(r.t).toBe(1);
    expect(r.point).toEqual({ x: 4, y: 0 });
  });
});

describe("distToSegment", () => {
  it("meet loodrecht binnen het segment", () => {
    expect(distToSegment({ x: 2, y: 3 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeCloseTo(3, 6);
  });

  it("meet naar het eindpunt buiten het segment", () => {
    expect(distToSegment({ x: 7, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 })).toBeCloseTo(3, 6);
  });
});

describe("constrainToAngle", () => {
  it("trekt een bijna-horizontale lijn recht", () => {
    const r = constrainToAngle({ x: 3, y: 0.2 }, { x: 0, y: 0 }, 45);
    expect(r.y).toBeCloseTo(0, 6);
    expect(r.x).toBeCloseTo(Math.hypot(3, 0.2), 6);
  });

  it("snapt naar 45°", () => {
    const r = constrainToAngle({ x: 3, y: 2.6 }, { x: 0, y: 0 }, 45);
    expect(r.x).toBeCloseTo(r.y, 6);
  });
});

describe("mirrorPoints", () => {
  it("spiegelt horizontaal rond een spil", () => {
    expect(mirrorPoints([{ x: 1, y: 5 }], "h", { x: 3, y: 0 })).toEqual([{ x: 5, y: 5 }]);
  });

  it("spiegelt verticaal rond een spil", () => {
    expect(mirrorPoints([{ x: 1, y: 5 }], "v", { x: 0, y: 3 })).toEqual([{ x: 1, y: 1 }]);
  });
});

describe("wallIntersection", () => {
  it("vindt het snijpunt van verlengde lijnen", () => {
    const p = wallIntersection(
      { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
      { start: { x: 4, y: -5 }, end: { x: 4, y: 5 } },
    );
    expect(p?.x).toBeCloseTo(4, 6);
    expect(p?.y).toBeCloseTo(0, 6);
  });

  it("geeft null bij parallelle muren", () => {
    expect(
      wallIntersection(
        { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
        { start: { x: 0, y: 2 }, end: { x: 10, y: 2 } },
      ),
    ).toBeNull();
  });
});

describe("segmentIntersection", () => {
  it("kruist binnen beide segmenten", () => {
    const r = segmentIntersection(
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: -1 },
      { x: 2, y: 1 },
    );
    expect(r?.point.x).toBeCloseTo(2, 6);
  });

  it("geeft null als het snijpunt buiten een segment valt", () => {
    expect(
      segmentIntersection({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 9, y: -1 }, { x: 9, y: 1 }),
    ).toBeNull();
  });
});

describe("pointInRect / bounds", () => {
  it("herkent punten binnen en buiten", () => {
    const min = { x: 0, y: 0 };
    const max = { x: 4, y: 3 };
    expect(pointInRect({ x: 2, y: 2 }, min, max)).toBe(true);
    expect(pointInRect({ x: 5, y: 2 }, min, max)).toBe(false);
  });

  it("berekent de bounding box", () => {
    expect(bounds([{ x: 1, y: 7 }, { x: -2, y: 3 }, { x: 4, y: 5 }])).toEqual({
      min: { x: -2, y: 3 },
      max: { x: 4, y: 7 },
    });
  });

  it("geeft een nul-box voor een lege set", () => {
    expect(bounds([])).toEqual({ min: { x: 0, y: 0 }, max: { x: 0, y: 0 } });
  });
});

describe("pointInPolygon", () => {
  const sq = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];

  it("herkent binnen, buiten en op de rand", () => {
    expect(pointInPolygon({ x: 2, y: 2 }, sq)).toBe(true);
    expect(pointInPolygon({ x: 6, y: 2 }, sq)).toBe(false);
    expect(pointInPolygon({ x: 0, y: 2 }, sq)).toBe(true);
  });
});
