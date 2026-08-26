// Tests voor de validatieregels. Afschot is de eerste regel die met echte
// getallen rekent in plaats van alleen een vlag te controleren.

import { describe, expect, it } from "vitest";
import { validateLintels, validatePipeFall, validateWalls } from "./validation";
import type { Opening, PlumbingItem, Wall } from "./domain/types";

// Afvoer van 10 m; verval in meters over die lengte.
function drain(startZ: number, endZ: number, over: Partial<PlumbingItem> = {}): PlumbingItem {
  return {
    id: "p1", updatedAt: 0, levelId: "lvl", type: "drain",
    path: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    diameter: 110, startZ, endZ, ...over,
  };
}

describe("validatePipeFall", () => {
  it("keurt een afvoer met voldoende afschot goed", () => {
    // 10 m met 6 cm verval = 6 mm/m, boven het minimum van 5.
    expect(validatePipeFall([drain(0.06, 0)])).toEqual([]);
  });

  it("waarschuwt bij te weinig afschot", () => {
    // 10 m met 2 cm verval = 2 mm/m.
    const issues = validatePipeFall([drain(0.02, 0)]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warn");
    expect(issues[0].message).toContain("2.0 mm/m");
    expect(issues[0].entityId).toBe("p1");
  });

  it("geeft een fout als de afvoer omhoog loopt", () => {
    const issues = validatePipeFall([drain(0, 0.05)]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toContain("omhoog");
  });

  it("meet het afschot over de werkelijke padlengte, niet hemelsbreed", () => {
    // Twee segmenten van 10 m: 12 cm verval over 20 m = 6 mm/m → goed.
    const item = drain(0.12, 0, {
      path: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
    });
    expect(validatePipeFall([item])).toEqual([]);
    // Hetzelfde verval over één segment van 10 m zou 12 mm/m zijn — ook goed,
    // maar met 3 cm over 20 m (1,5 mm/m) moet het misgaan.
    const flat = drain(0.03, 0, {
      path: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
    });
    expect(validatePipeFall([flat])).toHaveLength(1);
  });

  it("negeert waterleidingen en sanitair (geen afschot-eis)", () => {
    const supply: PlumbingItem = {
      id: "s1", updatedAt: 0, levelId: "lvl", type: "supply-cold",
      path: [{ x: 0, y: 0 }, { x: 10, y: 0 }], startZ: 1, endZ: 1,
    };
    const fixture: PlumbingItem = {
      id: "f1", updatedAt: 0, levelId: "lvl", type: "fixture",
      fixture: "toilet", position: { x: 1, y: 1 }, heightZ: 0.4,
    };
    expect(validatePipeFall([supply, fixture])).toEqual([]);
  });

  it("valt terug op heightZ als start/eind ontbreken (oude leidingen)", () => {
    const legacy: PlumbingItem = {
      id: "old", updatedAt: 0, levelId: "lvl", type: "drain",
      path: [{ x: 0, y: 0 }, { x: 10, y: 0 }], heightZ: 0.05,
    };
    // Gelijke begin- en eindhoogte = 0 mm/m → waarschuwing, geen crash.
    const issues = validatePipeFall([legacy]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warn");
  });

  it("negeert leidingen met minder dan twee punten", () => {
    const stub: PlumbingItem = {
      id: "x", updatedAt: 0, levelId: "lvl", type: "drain", path: [{ x: 0, y: 0 }],
    };
    expect(validatePipeFall([stub])).toEqual([]);
  });
});

describe("validateWalls", () => {
  const wall = (over: Partial<Wall>): Wall => ({
    id: "w1", updatedAt: 0, levelId: "lvl",
    start: { x: 0, y: 0 }, end: { x: 4, y: 0 },
    thickness: 0.1, height: 2.6, material: "brick",
    loadBearing: false, status: "new", ...over,
  });

  it("meldt sloop van een dragende muur als fout", () => {
    const issues = validateWalls([wall({ loadBearing: true, status: "demolish" })]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
  });

  it("laat sloop van een niet-dragende muur met rust", () => {
    expect(validateWalls([wall({ status: "demolish" })])).toEqual([]);
  });

  it("laat een dragende muur die blijft staan met rust", () => {
    expect(validateWalls([wall({ loadBearing: true, status: "existing" })])).toEqual([]);
  });
});

describe("validateLintels", () => {
  const wall = (over: Partial<Wall>): Wall => ({
    id: "w1", updatedAt: 0, levelId: "lvl",
    start: { x: 0, y: 0 }, end: { x: 5, y: 0 },
    thickness: 0.1, height: 2.6, material: "brick",
    loadBearing: true, status: "existing", ...over,
  });
  const opening = (over: Partial<Opening> = {}): Opening => ({
    id: "o1", updatedAt: 0, wallId: "w1", type: "door",
    width: 0.9, height: 2.1, sillHeight: 0, offset: 1, ...over,
  });

  it("waarschuwt bij een opening in een dragende muur zonder latei", () => {
    const issues = validateLintels([wall({})], [opening()]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("warn");
    expect(issues[0].entityId).toBe("o1");
    expect(issues[0].message).toContain("Deur");
  });

  it("zwijgt zodra er een latei gekozen is", () => {
    expect(validateLintels([wall({})], [opening({ lintelProfile: "HEA100" })])).toEqual([]);
  });

  it("zwijgt bij een niet-dragende muur", () => {
    expect(validateLintels([wall({ loadBearing: false })], [opening()])).toEqual([]);
  });

  it("noemt het juiste soort opening", () => {
    const issues = validateLintels([wall({})], [opening({ type: "window" })]);
    expect(issues[0].message).toContain("Raam");
  });

  it("negeert een opening waarvan de muur ontbreekt", () => {
    expect(validateLintels([], [opening()])).toEqual([]);
  });
});
