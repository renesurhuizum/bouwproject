import { describe, expect, it } from "vitest";
import {
  angle,
  bounds,
  constrainToAngle,
  dist,
  distToSegment,
  mirrorPoints,
  pointInPolygon,
  pointInRect,
  polygonArea,
  polygonCentroid,
  projectOnSegment,
  segmentIntersection,
  snapToGrid,
  snapToPoints,
  wallIntersection,
} from "../geometry";

const vierkant4x4 = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
];

describe("dist", () => {
  it("berekent euclidische afstand", () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe("snapToGrid", () => {
  it("rondt af op het dichtstbijzijnde rasterpunt", () => {
    expect(snapToGrid({ x: 0.26, y: 0.74 }, 0.5)).toEqual({ x: 0.5, y: 0.5 });
    expect(snapToGrid({ x: -0.3, y: 1.3 }, 0.25)).toEqual({ x: -0.25, y: 1.25 });
  });
});

describe("snapToPoints", () => {
  it("vindt het dichtstbijzijnde punt binnen de radius", () => {
    const punten = [{ x: 0.05, y: 0 }, { x: 1, y: 1 }];
    expect(snapToPoints({ x: 0, y: 0 }, punten, 0.1)).toEqual({ x: 0.05, y: 0 });
  });

  it("geeft null als niets binnen de radius ligt", () => {
    expect(snapToPoints({ x: 0, y: 0 }, [{ x: 1, y: 1 }], 0.1)).toBeNull();
  });
});

describe("polygonArea", () => {
  it("berekent het oppervlak van een vierkant", () => {
    expect(polygonArea(vierkant4x4)).toBe(16);
  });

  it("is onafhankelijk van de draairichting", () => {
    expect(polygonArea([...vierkant4x4].reverse())).toBe(16);
  });

  it("berekent het oppervlak van een driehoek", () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }])).toBe(6);
  });

  it("geeft 0 bij minder dan 3 punten", () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });
});

describe("polygonCentroid", () => {
  it("geeft het gemiddelde van de hoekpunten", () => {
    expect(polygonCentroid(vierkant4x4)).toEqual({ x: 2, y: 2 });
  });

  it("geeft (0,0) bij lege input", () => {
    expect(polygonCentroid([])).toEqual({ x: 0, y: 0 });
  });
});

describe("angle", () => {
  it("geeft de hoek van het segment in radialen", () => {
    expect(angle({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2);
    expect(angle({ x: 0, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(Math.PI);
  });
});

describe("distToSegment", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 4, y: 0 };

  it("meet loodrecht op het segment", () => {
    expect(distToSegment({ x: 2, y: 2 }, a, b)).toBe(2);
  });

  it("klemt op de eindpunten", () => {
    expect(distToSegment({ x: 6, y: 0 }, a, b)).toBe(2);
  });

  it("werkt bij een gedegenereerd segment (punt)", () => {
    expect(distToSegment({ x: 3, y: 4 }, a, a)).toBe(5);
  });
});

describe("projectOnSegment", () => {
  it("projecteert op het segment met parameter t", () => {
    const r = projectOnSegment({ x: 2, y: 3 }, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(r.t).toBe(0.5);
    expect(r.point).toEqual({ x: 2, y: 0 });
    expect(r.dist).toBe(3);
  });

  it("klemt t op 0..1", () => {
    const r = projectOnSegment({ x: -2, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(r.t).toBe(0);
    expect(r.point).toEqual({ x: 0, y: 0 });
  });
});

describe("constrainToAngle", () => {
  it("snapt naar het dichtstbijzijnde veelvoud van 45°", () => {
    const r = constrainToAngle({ x: 2, y: 0.1 }, { x: 0, y: 0 });
    expect(r.y).toBeCloseTo(0);
    expect(r.x).toBeCloseTo(Math.hypot(2, 0.1));
  });

  it("behoudt de afstand tot de oorsprong", () => {
    const r = constrainToAngle({ x: 1, y: 0.9 }, { x: 0, y: 0 });
    expect(Math.hypot(r.x, r.y)).toBeCloseTo(Math.hypot(1, 0.9));
    expect(Math.atan2(r.y, r.x)).toBeCloseTo(Math.PI / 4);
  });
});

describe("mirrorPoints", () => {
  it("spiegelt x rond de spil bij as 'h'", () => {
    expect(mirrorPoints([{ x: 0, y: 5 }], "h", { x: 1, y: 0 })).toEqual([{ x: 2, y: 5 }]);
  });

  it("spiegelt y rond de spil bij as 'v'", () => {
    expect(mirrorPoints([{ x: 3, y: 0 }], "v", { x: 0, y: 1 })).toEqual([{ x: 3, y: 2 }]);
  });
});

describe("wallIntersection", () => {
  it("vindt het snijpunt van twee muren", () => {
    const p = wallIntersection(
      { start: { x: 0, y: 0 }, end: { x: 4, y: 0 } },
      { start: { x: 2, y: -1 }, end: { x: 2, y: 1 } },
    );
    expect(p).toEqual({ x: 2, y: 0 });
  });

  it("gebruikt de oneindige verlenging van beide muren", () => {
    const p = wallIntersection(
      { start: { x: 0, y: 0 }, end: { x: 4, y: 0 } },
      { start: { x: 10, y: -1 }, end: { x: 10, y: 1 } },
    );
    expect(p).toEqual({ x: 10, y: 0 });
  });

  it("geeft null bij parallelle muren", () => {
    const p = wallIntersection(
      { start: { x: 0, y: 0 }, end: { x: 4, y: 0 } },
      { start: { x: 0, y: 1 }, end: { x: 4, y: 1 } },
    );
    expect(p).toBeNull();
  });
});

describe("segmentIntersection", () => {
  it("vindt het snijpunt van kruisende segmenten", () => {
    const r = segmentIntersection(
      { x: 0, y: 0 }, { x: 4, y: 0 },
      { x: 2, y: -1 }, { x: 2, y: 1 },
    );
    expect(r?.point).toEqual({ x: 2, y: 0 });
    expect(r?.t).toBe(0.5);
    expect(r?.u).toBe(0.5);
  });

  it("geeft null als segmenten elkaar net niet raken", () => {
    const r = segmentIntersection(
      { x: 0, y: 0 }, { x: 4, y: 0 },
      { x: 5, y: -1 }, { x: 5, y: 1 },
    );
    expect(r).toBeNull();
  });

  it("geeft null bij parallelle segmenten", () => {
    const r = segmentIntersection(
      { x: 0, y: 0 }, { x: 4, y: 0 },
      { x: 0, y: 1 }, { x: 4, y: 1 },
    );
    expect(r).toBeNull();
  });
});

describe("pointInRect", () => {
  it("herkent binnen, buiten en de rand", () => {
    const min = { x: 0, y: 0 };
    const max = { x: 2, y: 2 };
    expect(pointInRect({ x: 1, y: 1 }, min, max)).toBe(true);
    expect(pointInRect({ x: 3, y: 1 }, min, max)).toBe(false);
    expect(pointInRect({ x: 2, y: 2 }, min, max)).toBe(true);
  });
});

describe("bounds", () => {
  it("berekent de bounding box", () => {
    expect(bounds([{ x: -1, y: 2 }, { x: 3, y: -4 }])).toEqual({
      min: { x: -1, y: -4 },
      max: { x: 3, y: 2 },
    });
  });

  it("geeft nul-box bij lege input", () => {
    expect(bounds([])).toEqual({ min: { x: 0, y: 0 }, max: { x: 0, y: 0 } });
  });
});

describe("pointInPolygon", () => {
  it("herkent punten binnen en buiten", () => {
    expect(pointInPolygon({ x: 2, y: 2 }, vierkant4x4)).toBe(true);
    expect(pointInPolygon({ x: 5, y: 2 }, vierkant4x4)).toBe(false);
  });

  it("telt randpunten als binnen", () => {
    expect(pointInPolygon({ x: 4, y: 2 }, vierkant4x4)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 0 }, vierkant4x4)).toBe(true);
  });

  it("geeft false bij minder dan 3 punten", () => {
    expect(pointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }])).toBe(false);
  });
});
