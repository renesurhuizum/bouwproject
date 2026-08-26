// Tests voor de hoeveelheidsengine. De verwachte waarden zijn met de hand
// narekenbaar: dit is de lijst waarmee de gebruiker naar de bouwmarkt gaat.

import { describe, expect, it } from "vitest";
import { computeTakeoff, type PlanModel, type TakeoffLine } from "./engine";
import { ARTICLE_BY_KEY } from "./catalog";
import type { Level, Opening, Room, Wall } from "../domain/types";

const level: Level = {
  id: "bg", updatedAt: 0, projectId: "p", name: "Begane grond",
  elevation: 0, height: 2.6, order: 1,
};

function wall(over: Partial<Wall> & Pick<Wall, "id" | "start" | "end">): Wall {
  return {
    updatedAt: 0, levelId: "bg", thickness: 0.1, height: 2.6,
    material: "gypsum", loadBearing: false, status: "new", ...over,
  };
}

function emptyModel(over: Partial<PlanModel> = {}): PlanModel {
  return {
    levels: [level], walls: [], rooms: [], openings: [],
    plumbing: [], electrical: [], circuits: [], beams: [], ...over,
  };
}

function find(lines: TakeoffLine[], sourceId: string): TakeoffLine | undefined {
  return lines.find((l) => l.sourceId === sourceId);
}

describe("computeTakeoff — wanden", () => {
  it("rekent gipsplaat voor beide zijden en rondt af op hele platen", () => {
    // Muur 4 m × 2,6 m = 10,4 m²; twee zijden = 20,8 m²; +10% = 22,88 m².
    // Plaat is 3,12 m² → 8 platen (24,96 m²).
    const lines = computeTakeoff(emptyModel({
      walls: [wall({ id: "w1", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } })],
    }));
    const gips = find(lines, "gipsplaat-1200x2600")!;
    expect(gips.netQty).toBeCloseTo(20.8, 2);
    expect(gips.grossQty).toBeCloseTo(22.88, 2);
    expect(gips.packs).toBe(8);
    expect(gips.buyQty).toBeCloseTo(24.96, 2);
  });

  it("trekt sparingen af van het wandoppervlak", () => {
    const opening: Opening = {
      id: "o1", updatedAt: 0, wallId: "w1", type: "door",
      width: 0.9, height: 2.1, sillHeight: 0, offset: 1,
    };
    const lines = computeTakeoff(emptyModel({
      walls: [wall({ id: "w1", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } })],
      openings: [opening],
    }));
    // (10,4 − 1,89) × 2 = 17,02 m².
    expect(find(lines, "gipsplaat-1200x2600")!.netQty).toBeCloseTo(17.02, 2);
  });

  it("bouwt geen bestaande of te slopen muren", () => {
    const lines = computeTakeoff(emptyModel({
      walls: [
        wall({ id: "w1", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, status: "existing" }),
        wall({ id: "w2", start: { x: 0, y: 3 }, end: { x: 4, y: 3 }, status: "demolish" }),
      ],
    }));
    expect(find(lines, "gipsplaat-1200x2600")).toBeUndefined();
  });

  it("kiest het materiaal dat bij de muur hoort", () => {
    const lines = computeTakeoff(emptyModel({
      walls: [wall({ id: "w1", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, material: "sand-lime" })],
    }));
    expect(find(lines, "kalkzandsteen-blok")).toBeDefined();
    expect(find(lines, "gipsplaat-1200x2600")).toBeUndefined();
  });

  it("gebruikt de verdiepingshoogte als de muurhoogte 0 is", () => {
    const lines = computeTakeoff(emptyModel({
      walls: [wall({ id: "w1", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, height: 0 })],
    }));
    expect(find(lines, "gipsplaat-1200x2600")!.netQty).toBeCloseTo(20.8, 2);
  });
});

describe("computeTakeoff — vloeren en afwerking", () => {
  const room: Room = {
    id: "r1", updatedAt: 0, levelId: "bg", name: "Woonkamer",
    polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }],
  };

  it("rekent dekvloer en plafond over het vloeroppervlak", () => {
    const lines = computeTakeoff(emptyModel({ rooms: [room] }));
    expect(find(lines, "dekvloer")!.netQty).toBeCloseTo(12, 2);
    expect(find(lines, "plafond-gipsplaat")!.netQty).toBeCloseTo(12, 2);
  });

  it("rekent plinten als omtrek minus deurbreedtes", () => {
    const opening: Opening = {
      id: "o1", updatedAt: 0, wallId: "w1", type: "door",
      width: 0.9, height: 2.1, sillHeight: 0, offset: 1,
    };
    const lines = computeTakeoff(emptyModel({ rooms: [room], openings: [opening] }));
    // Omtrek 14 m − 0,9 m deur = 13,1 m; +10% = 14,41; per lengte van 2,4 m → 7.
    const plint = find(lines, "plint")!;
    expect(plint.netQty).toBeCloseTo(13.1, 2);
    expect(plint.packs).toBe(7);
  });

  it("zet vloerafwerking om naar dozen", () => {
    const lines = computeTakeoff(emptyModel({ rooms: [{ ...room, floorMaterial: "tile" }] }));
    const tegels = find(lines, "vloer-tegel")!;
    expect(tegels.netQty).toBeCloseTo(12, 2);
    // 12 × 1,10 = 13,2 m²; doos is 1,44 m² → 10 dozen.
    expect(tegels.packs).toBe(10);
  });

  it("rekent verf om van m² naar liters bij twee lagen", () => {
    const lines = computeTakeoff(emptyModel({
      walls: [wall({ id: "w1", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } })],
    }));
    // 10,4 m² × 2 lagen ÷ 8 m²/l = 2,6 l.
    expect(find(lines, "muurverf")!.netQty).toBeCloseTo(2.6, 2);
    expect(find(lines, "muurverf")!.packs).toBe(1);
  });
});

describe("computeTakeoff — leidingen", () => {
  it("telt leidingmeters per type en diameter apart", () => {
    const lines = computeTakeoff(emptyModel({
      plumbing: [
        {
          id: "p1", updatedAt: 0, levelId: "bg", type: "drain", diameter: 110,
          path: [{ x: 0, y: 0 }, { x: 6, y: 0 }], startZ: 0.05, endZ: 0,
        },
        {
          id: "p2", updatedAt: 0, levelId: "bg", type: "supply-cold", diameter: 15,
          path: [{ x: 0, y: 0 }, { x: 4, y: 0 }], startZ: 1, endZ: 1,
        },
      ],
    }));
    // Afvoer: 6 m horizontaal + 0,05 m verval.
    expect(find(lines, "afvoerbuis:110")!.netQty).toBeCloseTo(6.05, 2);
    expect(find(lines, "waterleiding:15")!.netQty).toBeCloseTo(4, 2);
  });

  it("telt fittingen per knik in een leiding", () => {
    const lines = computeTakeoff(emptyModel({
      plumbing: [{
        id: "p1", updatedAt: 0, levelId: "bg", type: "supply-cold", diameter: 15,
        path: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 8, y: 3 }],
      }],
    }));
    // Vier punten → twee knikken.
    expect(find(lines, "leidingfitting")!.netQty).toBe(2);
  });

  it("negeert sanitair (dat is geen leiding)", () => {
    const lines = computeTakeoff(emptyModel({
      plumbing: [{
        id: "f1", updatedAt: 0, levelId: "bg", type: "fixture",
        fixture: "toilet", position: { x: 1, y: 1 },
      }],
    }));
    expect(find(lines, "afvoerbuis:110")).toBeUndefined();
  });
});

describe("computeTakeoff — elektra", () => {
  it("zet kabelmeters om naar rollen van 100 m", () => {
    const lines = computeTakeoff(emptyModel({
      walls: [wall({ id: "w1", start: { x: 0, y: 0 }, end: { x: 20, y: 0 }, status: "existing" })],
      circuits: [{
        id: "c1", updatedAt: 0, projectId: "p", number: "1", name: "Groep 1",
        breaker: "B16", cableSpec: "3×2,5 mm²", color: "#000",
        panelId: "panel", routeAt: "ceiling",
      }],
      electrical: [
        {
          id: "panel", updatedAt: 0, levelId: "bg", type: "panel",
          position: { x: 0, y: 0 }, heightZ: 1.5, circuitId: "c1",
        },
        {
          id: "s1", updatedAt: 0, levelId: "bg", type: "socket",
          position: { x: 20, y: 0 }, heightZ: 0.3, circuitId: "c1",
        },
      ],
    }));
    const kabel = find(lines, "kabel-3x2.5:3×2,5 mm²")!;
    expect(kabel).toBeDefined();
    expect(kabel.packs).toBe(1); // onder de 100 m
    expect(kabel.unit).toBe("m");
  });

  it("telt inbouwdozen en centraaldozen apart, zonder de meterkast", () => {
    const lines = computeTakeoff(emptyModel({
      electrical: [
        { id: "panel", updatedAt: 0, levelId: "bg", type: "panel", position: { x: 0, y: 0 }, heightZ: 1.5 },
        { id: "s1", updatedAt: 0, levelId: "bg", type: "socket", position: { x: 1, y: 0 }, heightZ: 0.3 },
        { id: "s2", updatedAt: 0, levelId: "bg", type: "socket", position: { x: 2, y: 0 }, heightZ: 0.3 },
        { id: "l1", updatedAt: 0, levelId: "bg", type: "light", position: { x: 3, y: 0 }, heightZ: 2.6 },
      ],
    }));
    expect(find(lines, "inbouwdoos")!.netQty).toBe(2);
    expect(find(lines, "centraaldoos")!.netQty).toBe(1);
  });
});

describe("computeTakeoff — constructie", () => {
  it("rekent staal in kilo's en hout in meters", () => {
    const lines = computeTakeoff(emptyModel({
      beams: [
        {
          id: "b1", updatedAt: 0, levelId: "bg", profile: "HEA140",
          start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, height: 2.4,
        },
        {
          id: "b2", updatedAt: 0, levelId: "bg", profile: "HOUT75x225",
          start: { x: 0, y: 3 }, end: { x: 3, y: 3 }, height: 2.4,
        },
      ],
    }));
    // HEA140 weegt 24,7 kg/m → 4 m = 98,8 kg.
    expect(find(lines, "staalprofiel")!.netQty).toBeCloseTo(98.8, 1);
    expect(find(lines, "houten-balk")!.netQty).toBeCloseTo(3, 2);
  });

  it("telt lateien mee inclusief oplegging", () => {
    const lines = computeTakeoff(emptyModel({
      openings: [{
        id: "o1", updatedAt: 0, wallId: "w1", type: "door",
        width: 0.9, height: 2.1, sillHeight: 0, offset: 1, lintelProfile: "HEA100",
      }],
    }));
    // 0,9 + 2 × 0,15 = 1,2 m × 16,7 kg/m = 20,04 kg.
    expect(find(lines, "staalprofiel")!.netQty).toBeCloseTo(20.04, 1);
  });
});

describe("computeTakeoff — algemeen", () => {
  it("geeft een lege lijst voor een leeg plan", () => {
    expect(computeTakeoff(emptyModel())).toEqual([]);
  });

  it("laat nulregels weg", () => {
    const lines = computeTakeoff(emptyModel({
      walls: [wall({ id: "w1", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } })],
    }));
    expect(lines.every((l) => l.netQty > 0)).toBe(true);
  });

  it("geeft stabiele sourceIds over herberekeningen heen", () => {
    const model = emptyModel({
      walls: [wall({ id: "w1", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } })],
    });
    const a = computeTakeoff(model).map((l) => l.sourceId);
    const b = computeTakeoff(model).map((l) => l.sourceId);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length); // geen duplicaten
  });

  it("sorteert op bouwvolgorde", () => {
    const lines = computeTakeoff(emptyModel({
      walls: [wall({ id: "w1", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } })],
      beams: [{
        id: "b1", updatedAt: 0, levelId: "bg", profile: "HEA140",
        start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, height: 2.4,
      }],
    }));
    const orders = lines.map((l) => l.phaseOrder ?? 99);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it("rekent de prijs over de inkoophoeveelheid, niet de gemeten", () => {
    const lines = computeTakeoff(emptyModel({
      walls: [wall({ id: "w1", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } })],
    }));
    const gips = find(lines, "gipsplaat-1200x2600")!;
    const price = ARTICLE_BY_KEY["gipsplaat-1200x2600"].unitPrice!;
    expect(gips.totalPrice).toBeCloseTo(Math.round(gips.buyQty * price * 100) / 100, 2);
  });
});
