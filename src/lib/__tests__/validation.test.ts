import { describe, expect, it } from "vitest";
import type {
  ElectricalItem,
  ElectricalType,
  Level,
  PlumbingItem,
  Room,
  Wall,
} from "../domain/types";
import {
  nvoArea,
  validateElectrical,
  validateRooms,
  validateRoomServices,
  validateWalls,
} from "../validation";

let nextId = 0;
const id = () => `t${nextId++}`;

function mkWall(patch: Partial<Wall> = {}): Wall {
  return {
    id: id(),
    levelId: "l1",
    start: { x: 0, y: 0 },
    end: { x: 4, y: 0 },
    thickness: 0.1,
    height: 2.6,
    material: "brick",
    loadBearing: false,
    status: "existing",
    updatedAt: 0,
    ...patch,
  };
}

function mkRoom(name: string, polygon: Room["polygon"], func?: string): Room {
  return { id: id(), levelId: "l1", name, func, polygon, updatedAt: 0 };
}

function mkElec(type: ElectricalType, patch: Partial<ElectricalItem> = {}): ElectricalItem {
  return {
    id: id(),
    levelId: "l1",
    type,
    position: { x: 1, y: 1 },
    heightZ: 0.3,
    updatedAt: 0,
    ...patch,
  };
}

function rect(w: number, h: number) {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
}

describe("validateWalls", () => {
  it("geeft een fout bij sloop van een dragende muur", () => {
    const issues = validateWalls([mkWall({ loadBearing: true, status: "demolish" })]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toContain("constructeur");
  });

  it("accepteert sloop van een niet-dragende muur", () => {
    expect(validateWalls([mkWall({ status: "demolish" })])).toHaveLength(0);
  });

  it("accepteert een dragende muur die blijft staan", () => {
    expect(validateWalls([mkWall({ loadBearing: true })])).toHaveLength(0);
  });
});

describe("validateElectrical", () => {
  it("waarschuwt bij meer dan 12 stopcontacten op één groep", () => {
    const items = Array.from({ length: 13 }, () => mkElec("socket", { group: "1" }));
    const issues = validateElectrical(items);
    expect(issues.some((i) => i.severity === "warn" && i.message.includes("max 12"))).toBe(true);
  });

  it("accepteert 12 stopcontacten op één groep", () => {
    const items = Array.from({ length: 12 }, () => mkElec("socket", { group: "1" }));
    expect(validateElectrical(items)).toHaveLength(0);
  });

  it("meldt een schakelaar zonder gekoppeld lichtpunt", () => {
    const sw = mkElec("switch");
    const issues = validateElectrical([sw]);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("info");
    expect(issues[0].entityId).toBe(sw.id);
  });

  it("accepteert een gekoppelde schakelaar", () => {
    const issues = validateElectrical([mkElec("switch", { linkedIds: ["licht-1"] })]);
    expect(issues).toHaveLength(0);
  });
});

describe("validateRooms", () => {
  const level: Level = {
    id: "l1", projectId: "p1", name: "Begane grond",
    elevation: 0, height: 2.6, order: 0, updatedAt: 0,
  };

  it("waarschuwt bij een woonruimte kleiner dan 7,5 m²", () => {
    const issues = validateRooms([mkRoom("Slaapkamer", rect(2, 3))], [level]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("7,5");
  });

  it("accepteert een woonruimte van 9 m²", () => {
    expect(validateRooms([mkRoom("Slaapkamer", rect(3, 3))], [level])).toHaveLength(0);
  });

  it("waarschuwt bij een badkamer kleiner dan 1,6 m²", () => {
    const issues = validateRooms([mkRoom("Badkamer", rect(1, 1.5))], [level]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("1,6");
  });

  it("waarschuwt bij een verdieping lager dan 2,6 m", () => {
    const issues = validateRooms([], [{ ...level, height: 2.4 }]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("260");
  });

  it("slaat ruimtes zonder geldige polygon over", () => {
    expect(validateRooms([mkRoom("Slaapkamer", [])], [level])).toHaveLength(0);
  });
});

describe("validateRoomServices", () => {
  it("meldt ontbrekende keukenvoorzieningen (kraan, Perilex)", () => {
    const keuken = mkRoom("Keuken", rect(4, 4));
    const issues = validateRoomServices([keuken], [], [], []);
    expect(issues.some((i) => i.message.includes("kraan"))).toBe(true);
    expect(issues.some((i) => i.message.includes("Perilex"))).toBe(true);
    expect(issues.every((i) => i.entityId === keuken.id)).toBe(true);
  });

  it("waarschuwt bij een badkamer zonder ventilatie", () => {
    const issues = validateRoomServices([mkRoom("Badkamer", rect(2, 2))], [], [], []);
    expect(issues.some((i) => i.severity === "warn" && i.message.includes("ventilatie"))).toBe(true);
  });

  it("herkent sanitair en leidingen binnen de ruimte", () => {
    const keuken = mkRoom("Keuken", rect(4, 4));
    const tap: PlumbingItem = {
      id: id(), levelId: "l1", type: "fixture", fixture: "kitchen-tap",
      position: { x: 2, y: 2 }, updatedAt: 0,
    };
    const koud: PlumbingItem = {
      id: id(), levelId: "l1", type: "supply-cold",
      path: [{ x: 2, y: 0 }, { x: 2, y: 2 }], updatedAt: 0,
    };
    const issues = validateRoomServices([keuken], [tap, koud], [], []);
    expect(issues.some((i) => i.message.includes("nog geen kraan"))).toBe(false);
    expect(issues.some((i) => i.message.includes("koudwater"))).toBe(false);
    expect(issues.some((i) => i.message.includes("warmwater"))).toBe(true);
  });
});

describe("nvoArea", () => {
  it("trekt de halve wanddikte langs de omtrek af (fallback 10 cm)", () => {
    // 4×4 m bruto, omtrek 16 m, fallback-dikte 0,1 m → 16 − 16×0,05 = 15,2
    expect(nvoArea(mkRoom("Kamer", rect(4, 4)), [])).toBeCloseTo(15.2);
  });

  it("geeft het bruto oppervlak bij een ongeldige polygon", () => {
    expect(nvoArea(mkRoom("Kamer", []), [])).toBe(0);
  });
});
