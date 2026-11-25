// Tests voor de indicatieve profielkeuze. De verwachte waarden zijn met de hand
// uit de formules narekenbaar — bij constructiegetallen is "het lijkt te
// kloppen" niet goed genoeg.

import { describe, expect, it } from "vitest";
import { checkProfile, suggestProfiles, DEFLECTION_LIMIT } from "./sizing";
import { estimateLineLoad } from "./loads";
import { findSection, MATERIAL_PROPS } from "./sections";

describe("suggestProfiles", () => {
  it("rekent het moment als qL²/8", () => {
    // 10 kN/m over 4 m → 10 × 16 / 8 = 20 kNm.
    const res = suggestProfiles({ spanM: 4, designKnM: 10, serviceKnM: 7, material: "steel" });
    expect(res.designMomentKnm).toBeCloseTo(20, 2);
  });

  it("leidt het benodigde weerstandsmoment af uit moment en staalsterkte", () => {
    // Wy = M/f_d = 20e6 N·mm / 235 N/mm² = 85106 mm³ ≈ 85,1 cm³.
    const res = suggestProfiles({ spanM: 4, designKnM: 10, serviceKnM: 7, material: "steel" });
    expect(res.requiredWyCm3).toBeCloseTo(85.11, 1);
  });

  it("hanteert L/250 als doorbuigingsgrens", () => {
    const res = suggestProfiles({ spanM: 5, designKnM: 8, serviceKnM: 6, material: "steel" });
    expect(res.allowedDeflectionMm).toBeCloseTo((5 * 1000) / DEFLECTION_LIMIT, 3);
  });

  it("geeft alleen profielen die beide controles doorstaan", () => {
    const res = suggestProfiles({ spanM: 4, designKnM: 10, serviceKnM: 7, material: "steel" });
    expect(res.suggestions.length).toBeGreaterThan(0);
    for (const s of res.suggestions) {
      expect(s.strengthUtilisation).toBeLessThanOrEqual(1);
      expect(s.deflectionUtilisation).toBeLessThanOrEqual(1);
    }
  });

  it("zet het lichtste profiel vooraan", () => {
    const res = suggestProfiles({ spanM: 4, designKnM: 10, serviceKnM: 7, material: "steel" });
    const weights = res.suggestions.map((s) => s.profile.weightKgPerM);
    expect([...weights].sort((a, b) => a - b)).toEqual(weights);
  });

  it("geeft bij een gangbare doorbraak een profiel in de HEA/IPE-orde", () => {
    // Doorbraak van 3,5 m in een dragende muur die een vloer plus 2,6 m
    // metselwerk draagt — het klassieke "muurtje eruit"-geval.
    const load = estimateLineLoad({
      supports: "floor-and-wall",
      tributaryWidthM: 2.5,
      wallHeightM: 2.6,
      wallThicknessM: 0.1,
      wallMaterial: "brick",
    });
    const res = suggestProfiles({
      spanM: 3.5,
      designKnM: load.designKnM,
      serviceKnM: load.serviceKnM,
      material: "steel",
    });
    const lightest = res.suggestions[0];
    expect(lightest).toBeDefined();
    // Een dergelijke overspanning vraagt om een profiel van minstens 100 mm hoog.
    expect(lightest.profile.h).toBeGreaterThanOrEqual(0.1);
    expect(res.disclaimer).toContain("constructeur");
  });

  it("laat bij een lange overspanning de doorbuiging maatgevend zijn", () => {
    // 6 m met een lichte belasting: de sterkte is dan ruim, de stijfheid niet.
    const res = suggestProfiles({ spanM: 6, designKnM: 4, serviceKnM: 3, material: "steel" });
    expect(res.suggestions[0].governing).toBe("doorbuiging");
  });

  it("laat bij een korte overspanning de sterkte maatgevend zijn", () => {
    const res = suggestProfiles({ spanM: 1.5, designKnM: 30, serviceKnM: 22, material: "steel" });
    expect(res.suggestions[0].governing).toBe("sterkte");
  });

  it("filtert op materiaal", () => {
    const timber = suggestProfiles({ spanM: 3, designKnM: 4, serviceKnM: 3, material: "timber" });
    expect(timber.suggestions.every((s) => s.profile.material === "timber")).toBe(true);
  });

  it("geeft geen enkel profiel bij een absurde belasting", () => {
    const res = suggestProfiles({ spanM: 12, designKnM: 200, serviceKnM: 150, material: "steel" });
    expect(res.suggestions).toEqual([]);
  });

  it("gaat om met een overspanning van nul zonder te ontploffen", () => {
    const res = suggestProfiles({ spanM: 0, designKnM: 10, serviceKnM: 7, material: "steel" });
    expect(res.designMomentKnm).toBe(0);
    expect(res.suggestions.length).toBeGreaterThan(0);
  });
});

describe("checkProfile", () => {
  it("keurt een ruim bemeten profiel goed", () => {
    const heb200 = findSection("HEB200")!;
    const res = checkProfile(heb200, { spanM: 3, designKnM: 10, serviceKnM: 7 });
    expect(res.adequate).toBe(true);
    expect(res.strengthUtilisation).toBeLessThan(1);
  });

  it("keurt een te licht profiel af", () => {
    const ipe100 = findSection("IPE100")!;
    const res = checkProfile(ipe100, { spanM: 6, designKnM: 30, serviceKnM: 22 });
    expect(res.adequate).toBe(false);
  });

  it("rekent de doorbuiging met 5qL⁴/384EI", () => {
    const hea200 = findSection("HEA200")!;
    const span = 4;
    const q = 8; // kN/m karakteristiek
    const res = checkProfile(hea200, { spanM: span, designKnM: 11, serviceKnM: q });
    const lMm = span * 1000;
    const expected =
      (5 * q * Math.pow(lMm, 4)) /
      (384 * MATERIAL_PROPS.steel.e * hea200.iy * 1e4);
    expect(res.deflectionMm).toBeCloseTo(Math.round(expected * 100) / 100, 2);
  });
});

describe("estimateLineLoad", () => {
  it("rekent het muurgewicht als dichtheid × dikte × hoogte", () => {
    const load = estimateLineLoad({
      supports: "wall-only",
      tributaryWidthM: 0,
      wallHeightM: 2.5,
      wallThicknessM: 0.1,
      wallMaterial: "brick",
    });
    // 18 kN/m³ × 0,1 m × 2,5 m = 4,5 kN/m.
    expect(load.permanentKnM).toBeCloseTo(4.5, 3);
    expect(load.variableKnM).toBe(0);
    expect(load.designKnM).toBeCloseTo(1.35 * 4.5, 3);
  });

  it("telt vloerbelasting mee over de belastingbreedte", () => {
    const load = estimateLineLoad({
      supports: "floor",
      tributaryWidthM: 2,
      wallHeightM: 0,
      wallThicknessM: 0.1,
      wallMaterial: "brick",
    });
    expect(load.permanentKnM).toBeCloseTo(1.2 * 2, 3);
    expect(load.variableKnM).toBeCloseTo(1.75 * 2, 3);
    // UGT = 1,35·G + 1,5·Q
    expect(load.designKnM).toBeCloseTo(1.35 * 2.4 + 1.5 * 3.5, 3);
    // BGT = G + Q
    expect(load.serviceKnM).toBeCloseTo(2.4 + 3.5, 3);
  });

  it("combineert vloer en muur", () => {
    const load = estimateLineLoad({
      supports: "floor-and-wall",
      tributaryWidthM: 2,
      wallHeightM: 2.5,
      wallThicknessM: 0.1,
      wallMaterial: "brick",
    });
    expect(load.permanentKnM).toBeCloseTo(4.5 + 2.4, 3);
    expect(load.breakdown).toHaveLength(3);
  });

  it("gebruikt sneeuw in plaats van woonbelasting bij een dak", () => {
    const load = estimateLineLoad({
      supports: "roof",
      tributaryWidthM: 3,
      wallHeightM: 0,
      wallThicknessM: 0.1,
      wallMaterial: "brick",
    });
    expect(load.variableKnM).toBeCloseTo(0.56 * 3, 3);
  });

  it("houdt rekening met lichter materiaal", () => {
    const brick = estimateLineLoad({
      supports: "wall-only", tributaryWidthM: 0, wallHeightM: 2.5,
      wallThicknessM: 0.1, wallMaterial: "brick",
    });
    const aerated = estimateLineLoad({
      supports: "wall-only", tributaryWidthM: 0, wallHeightM: 2.5,
      wallThicknessM: 0.1, wallMaterial: "aerated-concrete",
    });
    expect(aerated.permanentKnM).toBeLessThan(brick.permanentKnM);
  });
});
