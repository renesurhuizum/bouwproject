// Tests voor dakhoogte, hoogtelijnen en bruikbaar zolderoppervlak.
//
// IJkgeval (met de hand na te rekenen): zolder 8 m breed × 10 m lang onder een
// zadeldak van 45°, geen overstek. Dan is hd = 4 m en de nok 4,00 m hoog.
// Stahoogte H wordt gehaald waar |z| ≤ hd − H:
//   ≥ 1,50 m → strook van 2·(4 − 1,5) = 5,0 m breed → 50,0 m² van de 80
//   ≥ 2,30 m → strook van 2·(4 − 2,3) = 3,4 m breed → 34,0 m²

import { describe, expect, it } from "vitest";
import { atticAreas, headroomAt, HEADROOM_LIVING_M, HEADROOM_USABLE_M } from "./attic";
import { roofContourLines, roofHeightAt, toRoofLocal, fromRoofLocal } from "./roofGeometry";
import type { Dormer, Roof, Room } from "./domain/types";

const fp = { W: 8, D: 8, center: { x: 0, y: 0 } };

function roof(over: Partial<Roof> = {}): Roof {
  return {
    id: "r1", updatedAt: 0, levelId: "zolder", type: "gable",
    pitch: 45, ridgeDirection: 0, overhang: 0, ...over,
  };
}

describe("roofHeightAt — zadeldak", () => {
  it("is op de nok gelijk aan tan(helling) × halve diepte", () => {
    expect(roofHeightAt("gable", 8, 8, 45, 0, { x: 0, y: 0 })).toBeCloseTo(4, 6);
  });

  it("loopt lineair af naar de dakvoet", () => {
    expect(roofHeightAt("gable", 8, 8, 45, 0, { x: 0, y: 2 })).toBeCloseTo(2, 6);
    expect(roofHeightAt("gable", 8, 8, 45, 0, { x: 0, y: -2 })).toBeCloseTo(2, 6);
    expect(roofHeightAt("gable", 8, 8, 45, 0, { x: 0, y: 4 })).toBeCloseTo(0, 6);
  });

  it("is symmetrisch en onafhankelijk van de positie langs de nok", () => {
    const a = roofHeightAt("gable", 8, 20, 45, 0, { x: -9, y: 1 });
    const b = roofHeightAt("gable", 8, 20, 45, 0, { x: 9, y: -1 });
    expect(a).toBeCloseTo(b, 6);
  });

  it("geeft 0 buiten de dakvoet", () => {
    expect(roofHeightAt("gable", 8, 8, 45, 0, { x: 0, y: 9 })).toBe(0);
  });

  it("volgt de helling: 30° is lager dan 45°", () => {
    const steil = roofHeightAt("gable", 8, 8, 45, 0, { x: 0, y: 0 });
    const flauw = roofHeightAt("gable", 8, 8, 30, 0, { x: 0, y: 0 });
    expect(flauw).toBeLessThan(steil);
    expect(flauw).toBeCloseTo(Math.tan((30 * Math.PI) / 180) * 4, 6);
  });
});

describe("roofHeightAt — overige daktypes", () => {
  it("plat dak heeft overal hoogte 0", () => {
    expect(roofHeightAt("flat", 8, 8, 45, 0, { x: 1, y: 1 })).toBe(0);
  });

  it("lessenaarsdak loopt op van de ene naar de andere zijde", () => {
    expect(roofHeightAt("shed", 8, 8, 45, 0, { x: 0, y: -4 })).toBeCloseTo(0, 6);
    expect(roofHeightAt("shed", 8, 8, 45, 0, { x: 0, y: 0 })).toBeCloseTo(4, 6);
    expect(roofHeightAt("shed", 8, 8, 45, 0, { x: 0, y: 4 })).toBeCloseTo(8, 6);
  });

  it("schilddak loopt ook aan de uiteinden af", () => {
    // Lang schilddak: in het midden als zadeldak, bij de kop lager.
    const midden = roofHeightAt("hip", 20, 8, 45, 0, { x: 0, y: 0 });
    const kop = roofHeightAt("hip", 20, 8, 45, 0, { x: 8, y: 0 });
    expect(midden).toBeCloseTo(4, 6);
    expect(kop).toBeLessThan(midden);
  });
});

describe("toRoofLocal / fromRoofLocal", () => {
  it("zijn elkaars omgekeerde", () => {
    const r = roof({ ridgeDirection: 37 });
    const f = { W: 8, D: 10, center: { x: 12, y: -3 } };
    const world = { x: 15.5, y: 1.25 };
    const back = fromRoofLocal(toRoofLocal(world, r, f), r, f);
    expect(back.x).toBeCloseTo(world.x, 6);
    expect(back.y).toBeCloseTo(world.y, 6);
  });

  it("verschuift het middelpunt naar de oorsprong", () => {
    const f = { W: 8, D: 8, center: { x: 5, y: 7 } };
    const local = toRoofLocal({ x: 5, y: 7 }, roof(), f);
    expect(local.x).toBeCloseTo(0, 6);
    expect(local.y).toBeCloseTo(0, 6);
  });

  it("houdt rekening met de nokrichting", () => {
    // Bij 90° gedraaid dak ligt de nok langs de wereld-y-as.
    const r = roof({ ridgeDirection: 90 });
    const f = { W: 8, D: 8, center: { x: 0, y: 0 } };
    const local = toRoofLocal({ x: 0, y: 3 }, r, f);
    // Een punt 3 m in wereld-y ligt dan 3 m langs de nok, niet dwars erop.
    expect(Math.abs(local.x)).toBeCloseTo(3, 6);
    expect(Math.abs(local.y)).toBeCloseTo(0, 6);
  });
});

describe("roofContourLines", () => {
  it("geeft bij een zadeldak twee lijnen evenwijdig aan de nok", () => {
    const lines = roofContourLines(roof(), fp, HEADROOM_USABLE_M);
    expect(lines).toHaveLength(2);
    // Op |z| = 4 − 1,5 = 2,5 m van de nok.
    const zs = lines.map((l) => Math.abs(l.a.y)).sort();
    expect(zs[0]).toBeCloseTo(2.5, 6);
    expect(zs[1]).toBeCloseTo(2.5, 6);
  });

  it("legt de lijn voor stahoogte dichter bij de nok", () => {
    const usable = roofContourLines(roof(), fp, HEADROOM_USABLE_M);
    const living = roofContourLines(roof(), fp, HEADROOM_LIVING_M);
    expect(Math.abs(living[0].a.y)).toBeLessThan(Math.abs(usable[0].a.y));
    expect(Math.abs(living[0].a.y)).toBeCloseTo(1.7, 6);
  });

  it("geeft niets als het dak die hoogte nergens haalt", () => {
    // Nok is 4 m; 5 m wordt nergens gehaald.
    expect(roofContourLines(roof(), fp, 5)).toEqual([]);
  });

  it("geeft niets bij een plat dak", () => {
    expect(roofContourLines(roof({ type: "flat" }), fp, 1.5)).toEqual([]);
  });

  it("geeft bij een schilddak een gesloten rechthoek", () => {
    const lines = roofContourLines(roof({ type: "hip" }), { W: 20, D: 8, center: { x: 0, y: 0 } }, HEADROOM_USABLE_M);
    expect(lines).toHaveLength(4);
  });
});

describe("atticAreas — het ijkgeval", () => {
  // Zolder 8 m breed (dwars op de nok) × 10 m lang.
  const zolder: Room = {
    id: "zolder", updatedAt: 0, levelId: "l", name: "Zolder",
    polygon: [
      { x: -4, y: -4 },
      { x: 6, y: -4 },
      { x: 6, y: 4 },
      { x: -4, y: 4 },
    ],
  };
  // Nok langs de X-as, dus de kap spant 8 m in de y-richting.
  const langFp = { W: 10, D: 8, center: { x: 1, y: 0 } };

  it("rekent bruto het volledige vloeroppervlak", () => {
    const a = atticAreas(zolder, roof(), langFp);
    expect(a.grossM2).toBeCloseTo(80, 1);
  });

  it("rekent bruikbaar oppervlak (≥1,50 m) op 50 m²", () => {
    const a = atticAreas(zolder, roof(), langFp);
    expect(a.usableM2).toBeCloseTo(50, 0);
  });

  it("rekent verblijfsoppervlak (≥2,30 m) op 34 m²", () => {
    const a = atticAreas(zolder, roof(), langFp);
    expect(a.livingM2).toBeCloseTo(34, 0);
  });

  it("meldt de nokhoogte als hoogste punt", () => {
    const a = atticAreas(zolder, roof(), langFp);
    expect(a.maxHeadroomM).toBeCloseTo(4, 1);
  });

  it("levert bij een steilere kap meer bruikbaar oppervlak op", () => {
    const flauw = atticAreas(zolder, roof({ pitch: 30 }), langFp);
    const steil = atticAreas(zolder, roof({ pitch: 60 }), langFp);
    expect(steil.usableM2).toBeGreaterThan(flauw.usableM2);
  });

  it("telt alles als bruikbaar bij een plat dak", () => {
    const a = atticAreas(zolder, roof({ type: "flat" }), langFp);
    expect(a.usableM2).toBeCloseTo(a.grossM2, 1);
  });

  it("telt alles als bruikbaar zonder dak", () => {
    const a = atticAreas(zolder, null, null);
    expect(a.usableM2).toBe(a.grossM2);
  });

  it("levert extra bruikbaar oppervlak op door een dakkapel", () => {
    const zonder = atticAreas(zolder, roof(), langFp);
    const kapel: Dormer = {
      id: "d1", updatedAt: 0, roofId: "r1", type: "gable-dormer",
      position: { x: 1, y: 3 }, width: 3, height: 2.4,
    };
    const met = atticAreas(zolder, roof(), langFp, [kapel]);
    expect(met.usableM2).toBeGreaterThan(zonder.usableM2);
    expect(met.livingM2).toBeGreaterThan(zonder.livingM2);
  });
});

describe("headroomAt", () => {
  it("is onder de nok gelijk aan de nokhoogte", () => {
    expect(headroomAt({ x: 0, y: 0 }, roof(), fp)).toBeCloseTo(4, 6);
  });

  it("wordt lokaal opgetrokken door een dakkapel", () => {
    const kapel: Dormer = {
      id: "d1", updatedAt: 0, roofId: "r1", type: "gable-dormer",
      position: { x: 0, y: 3 }, width: 3, height: 2.2,
    };
    // Bij z = 3 is het dak nog maar 1 m hoog; de kapel maakt er 2,2 m van.
    expect(headroomAt({ x: 0, y: 3 }, roof(), fp)).toBeCloseTo(1, 6);
    expect(headroomAt({ x: 0, y: 3 }, roof(), fp, [kapel])).toBeCloseTo(2.2, 6);
  });

  it("negeert een verwijderde dakkapel", () => {
    const kapel: Dormer = {
      id: "d1", updatedAt: 0, roofId: "r1", type: "gable-dormer",
      position: { x: 0, y: 3 }, width: 3, height: 2.2, deleted: true,
    };
    expect(headroomAt({ x: 0, y: 3 }, roof(), fp, [kapel])).toBeCloseTo(1, 6);
  });
});

describe("kniewand (basishoogte)", () => {
  const zolder: Room = {
    id: "zolder", updatedAt: 0, levelId: "l", name: "Zolder",
    polygon: [
      { x: -4, y: -4 },
      { x: 6, y: -4 },
      { x: 6, y: 4 },
      { x: -4, y: 4 },
    ],
  };
  const langFp = { W: 10, D: 8, center: { x: 1, y: 0 } };

  it("telt de muurhoogte onder het dak overal mee", () => {
    // Met een kniewand van 1 m staat het dak 1 m hoger, dus onder de nok 5 m.
    expect(headroomAt({ x: 1, y: 0 }, roof(), langFp, [], 1)).toBeCloseTo(5, 6);
  });

  it("vergroot het bruikbare oppervlak", () => {
    const zonder = atticAreas(zolder, roof(), langFp, [], 0);
    const met = atticAreas(zolder, roof(), langFp, [], 1);
    // Grens verschuift van |z| ≤ 2,5 naar |z| ≤ 3,5 → van 50 naar 70 m².
    expect(zonder.usableM2).toBeCloseTo(50, 0);
    expect(met.usableM2).toBeCloseTo(70, 0);
  });

  it("maakt bij een volle verdiepingshoogte alles bruikbaar", () => {
    const a = atticAreas(zolder, roof(), langFp, [], 2.5);
    expect(a.usableM2).toBeCloseTo(a.grossM2, 0);
  });
});
