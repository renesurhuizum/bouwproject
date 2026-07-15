import { describe, expect, it } from "vitest";
import type { Level, Opening, Room, Wall } from "../domain/types";
import { computeQuantities } from "../quantityTakeoff";

let nextId = 0;
const id = () => `t${nextId++}`;

const level: Level = {
  id: "l1", projectId: "p1", name: "Begane grond",
  elevation: 0, height: 2.6, order: 0, updatedAt: 0,
};

function mkWall(patch: Partial<Wall> = {}): Wall {
  return {
    id: id(),
    levelId: "l1",
    start: { x: 0, y: 0 },
    end: { x: 5, y: 0 },
    thickness: 0.1,
    height: 2.6,
    material: "brick",
    loadBearing: false,
    status: "existing",
    updatedAt: 0,
    ...patch,
  };
}

function mkRoom(patch: Partial<Room> = {}): Room {
  return {
    id: id(),
    levelId: "l1",
    name: "Kamer",
    polygon: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ],
    updatedAt: 0,
    ...patch,
  };
}

function find(items: ReturnType<typeof computeQuantities>, name: string) {
  return items.find((i) => i.name === name);
}

describe("computeQuantities", () => {
  it("berekent vloer- en plafondoppervlak uit de ruimtes", () => {
    const items = computeQuantities([], [mkRoom()], [], level);
    expect(find(items, "Totaal vloeroppervlak")?.quantity).toBe(16);
    expect(find(items, "Plafondoppervlak")?.quantity).toBe(16);
  });

  it("trekt openingen van het wandoppervlak af", () => {
    const wall = mkWall(); // 5 m × 2,6 m = 13 m²
    const deur: Opening = {
      id: id(), wallId: wall.id, type: "door",
      width: 1, height: 2, sillHeight: 0, offset: 1, updatedAt: 0,
    };
    const items = computeQuantities([wall], [], [deur], level);
    expect(find(items, "Totaal wandoppervlak (netto)")?.quantity).toBe(11);
    expect(find(items, "Binnendeur (kozijn + deur)")?.quantity).toBe(1);
  });

  it("valt terug op de verdiepingshoogte bij muurhoogte 0", () => {
    const items = computeQuantities([mkWall({ height: 0 })], [], [], level);
    expect(find(items, "Totaal wandoppervlak (netto)")?.quantity).toBe(13);
  });

  it("splitst nieuw en te slopen wandoppervlak uit", () => {
    const items = computeQuantities(
      [
        mkWall(), // bestaand: 13 m²
        mkWall({ status: "new", end: { x: 2, y: 0 } }), // nieuw: 5,2 m²
        mkWall({ status: "demolish", end: { x: 1, y: 0 } }), // sloop: 2,6 m²
      ],
      [], [], level,
    );
    expect(find(items, "Nieuw te bouwen wanden")?.quantity).toBe(5.2);
    expect(find(items, "Te slopen wanden")?.quantity).toBe(2.6);
    expect(find(items, "Totaal wandoppervlak (netto)")?.quantity).toBe(20.8);
    // Schilderwerk: (totaal − sloop) × 2 lagen
    expect(find(items, "Schilderwerk wanden (2 lagen)")?.quantity).toBeCloseTo(36.4);
  });

  it("berekent plinten als omtrek minus deurbreedtes", () => {
    const wall = mkWall();
    const deur: Opening = {
      id: id(), wallId: wall.id, type: "door",
      width: 1, height: 2, sillHeight: 0, offset: 1, updatedAt: 0,
    };
    const items = computeQuantities([wall], [mkRoom()], [deur], level);
    // Omtrek 16 m − 1 m deur = 15 m
    expect(find(items, "Plinten")?.quantity).toBe(15);
  });

  it("telt vloermateriaal met 10% snijverlies", () => {
    const items = computeQuantities([], [mkRoom({ floorMaterial: "tile" })], [], level);
    expect(find(items, "Tegels")?.quantity).toBeCloseTo(17.6);
    expect(find(items, "Tegels")?.detail).toContain("snijverlies");
  });

  it("geeft geen items bij lege input", () => {
    expect(computeQuantities([], [], [], level)).toHaveLength(0);
  });
});
