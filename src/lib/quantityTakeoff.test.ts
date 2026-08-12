// Karakterisatietest: legt het HUIDIGE gedrag van computeQuantities vast als
// vangnet, zodat de vervangende takeoff-engine bewust (en zichtbaar) afwijkt
// in plaats van per ongeluk.

import { describe, expect, it } from "vitest";
import { computeQuantities, type QuantityItem } from "./quantityTakeoff";
import type { Level, Opening, Room, Wall } from "./domain/types";

const level: Level = {
  id: "lvl", updatedAt: 0, projectId: "p", name: "Begane grond",
  elevation: 0, height: 2.6, order: 0,
};

function wall(over: Partial<Wall> & Pick<Wall, "id" | "start" | "end">): Wall {
  return {
    updatedAt: 0, levelId: "lvl", thickness: 0.1, height: 2.6,
    material: "brick", loadBearing: false, status: "new", ...over,
  };
}

function find(items: QuantityItem[], name: string): QuantityItem | undefined {
  return items.find((i) => i.name === name);
}

// Vierkante ruimte 4×4 m, vier muren van 4 m, hoogte 2,6 m.
const square: Wall[] = [
  wall({ id: "w1", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } }),
  wall({ id: "w2", start: { x: 4, y: 0 }, end: { x: 4, y: 4 } }),
  wall({ id: "w3", start: { x: 4, y: 4 }, end: { x: 0, y: 4 } }),
  wall({ id: "w4", start: { x: 0, y: 4 }, end: { x: 0, y: 0 } }),
];

const room: Room = {
  id: "r1", updatedAt: 0, levelId: "lvl", name: "Ruimte 1",
  polygon: [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ],
};

describe("computeQuantities", () => {
  it("rekent vloer- en plafondoppervlak uit de ruimtepolygoon", () => {
    const items = computeQuantities(square, [room], [], level);
    expect(find(items, "Totaal vloeroppervlak")?.quantity).toBe(16);
    // Plafond is vandaag een exacte kopie van de vloer.
    expect(find(items, "Plafondoppervlak")?.quantity).toBe(16);
  });

  it("rekent netto wandoppervlak met aftrek van sparingen", () => {
    const opening: Opening = {
      id: "o1", updatedAt: 0, wallId: "w1", type: "door",
      width: 0.9, height: 2.1, sillHeight: 0, offset: 1,
    };
    const items = computeQuantities(square, [room], [opening], level);
    // 4 muren × 4 m × 2,6 m = 41,6 m²; deur 0,9 × 2,1 = 1,89 m² eraf.
    expect(find(items, "Totaal wandoppervlak (netto)")?.quantity).toBeCloseTo(39.71, 2);
  });

  it("valt terug op de verdiepingshoogte als de muurhoogte 0 is", () => {
    const items = computeQuantities(
      [wall({ id: "w1", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, height: 0 })],
      [], [], level,
    );
    expect(find(items, "Totaal wandoppervlak (netto)")?.quantity).toBeCloseTo(10.4, 2);
  });

  it("splitst nieuw en te slopen wandoppervlak", () => {
    const walls = [
      wall({ id: "w1", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, status: "new" }),
      wall({ id: "w2", start: { x: 4, y: 0 }, end: { x: 4, y: 4 }, status: "demolish" }),
      wall({ id: "w3", start: { x: 4, y: 4 }, end: { x: 0, y: 4 }, status: "existing" }),
    ];
    const items = computeQuantities(walls, [], [], level);
    expect(find(items, "Nieuw te bouwen wanden")?.quantity).toBeCloseTo(10.4, 2);
    expect(find(items, "Te slopen wanden")?.quantity).toBeCloseTo(10.4, 2);
    // Schilderwerk = (totaal − sloop) × 2 lagen.
    expect(find(items, "Schilderwerk wanden (2 lagen)")?.quantity).toBeCloseTo(41.6, 2);
  });

  it("telt openingen per type", () => {
    const openings: Opening[] = [
      { id: "o1", updatedAt: 0, wallId: "w1", type: "door", width: 0.9, height: 2.1, sillHeight: 0, offset: 1 },
      { id: "o2", updatedAt: 0, wallId: "w2", type: "window", width: 1.2, height: 1.4, sillHeight: 0.9, offset: 1 },
      { id: "o3", updatedAt: 0, wallId: "w3", type: "passage", width: 1.0, height: 2.3, sillHeight: 0, offset: 1 },
    ];
    const items = computeQuantities(square, [room], openings, level);
    expect(find(items, "Binnendeur (kozijn + deur)")?.quantity).toBe(1);
    expect(find(items, "Raam / kozijn")?.quantity).toBe(1);
    expect(find(items, "Doorgang (afwerken)")?.quantity).toBe(1);
  });

  it("rekent plinten als omtrek minus deurbreedtes", () => {
    const opening: Opening = {
      id: "o1", updatedAt: 0, wallId: "w1", type: "door",
      width: 0.9, height: 2.1, sillHeight: 0, offset: 1,
    };
    const items = computeQuantities(square, [room], [opening], level);
    // Omtrek 16 m − deur 0,9 m.
    expect(find(items, "Plinten")?.quantity).toBeCloseTo(15.1, 1);
  });

  it("telt vloerafwerking per materiaal met 10% snijverlies", () => {
    const items = computeQuantities(square, [{ ...room, floorMaterial: "tile" }], [], level);
    expect(find(items, "Tegels")?.quantity).toBeCloseTo(17.6, 2);
  });

  it("laat nulregels weg", () => {
    expect(computeQuantities([], [], [], level)).toEqual([]);
  });
});
