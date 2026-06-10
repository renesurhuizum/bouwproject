// Hoeveelheidsstaat: auto-berekening van materiaalsoorten vanuit de plattegrond.
// Basis voor de materiaallijst (BOM) en budgetramingen.

import type { Wall, Room, Opening, Level } from "./domain/types";
import { dist, polygonArea } from "./geometry";

export interface QuantityItem {
  name: string;
  quantity: number;
  unit: string;
  category: "walls" | "floors" | "openings" | "finishes";
  detail?: string;
}

export function computeQuantities(
  walls: Wall[],
  rooms: Room[],
  openings: Opening[],
  level: Level,
): QuantityItem[] {
  const items: QuantityItem[] = [];

  // ── Vloeroppervlak per ruimte ─────────────────────────────────────────────
  let totalFloor = 0;
  for (const room of rooms) {
    if (room.polygon.length < 3) continue;
    const area = polygonArea(room.polygon);
    totalFloor += area;
  }
  if (totalFloor > 0) {
    items.push({
      name: "Totaal vloeroppervlak",
      quantity: Math.round(totalFloor * 100) / 100,
      unit: "m²",
      category: "floors",
    });
    items.push({
      name: "Plafondoppervlak",
      quantity: Math.round(totalFloor * 100) / 100,
      unit: "m²",
      category: "floors",
    });
  }

  // ── Wandoppervlak per status ──────────────────────────────────────────────
  // Opening-oppervlak per muur
  const openingsByWall = new Map<string, Opening[]>();
  for (const op of openings) {
    const list = openingsByWall.get(op.wallId) ?? [];
    list.push(op);
    openingsByWall.set(op.wallId, list);
  }

  let totalWallArea = 0;
  let newWallArea = 0;
  let demolishArea = 0;

  for (const wall of walls) {
    const len = dist(wall.start, wall.end);
    const h = wall.height > 0 ? wall.height : level.height;
    let area = len * h;
    // Trek openingsoppervlak af
    for (const op of openingsByWall.get(wall.id) ?? []) {
      area -= op.width * op.height;
    }
    area = Math.max(0, area);
    totalWallArea += area;
    if (wall.status === "new") newWallArea += area;
    if (wall.status === "demolish") demolishArea += area;
  }

  if (totalWallArea > 0) {
    items.push({
      name: "Totaal wandoppervlak (netto)",
      quantity: Math.round(totalWallArea * 100) / 100,
      unit: "m²",
      category: "walls",
    });
  }
  if (newWallArea > 0) {
    items.push({
      name: "Nieuw te bouwen wanden",
      quantity: Math.round(newWallArea * 100) / 100,
      unit: "m²",
      category: "walls",
      detail: "Inclusief stucwerk beide zijden",
    });
  }
  if (demolishArea > 0) {
    items.push({
      name: "Te slopen wanden",
      quantity: Math.round(demolishArea * 100) / 100,
      unit: "m²",
      category: "walls",
    });
  }

  // ── Schilderwerk (alle niet-sloopwanden) ──────────────────────────────────
  const paintArea = totalWallArea - demolishArea;
  if (paintArea > 0) {
    items.push({
      name: "Schilderwerk wanden (2 lagen)",
      quantity: Math.round(paintArea * 2 * 100) / 100,
      unit: "m²",
      category: "finishes",
      detail: "2× factor voor twee lagen",
    });
  }

  // ── Deuren en ramen ───────────────────────────────────────────────────────
  const doors = openings.filter((o) => o.type === "door");
  const windows = openings.filter((o) => o.type === "window");
  const passages = openings.filter((o) => o.type === "passage");

  if (doors.length > 0) {
    items.push({ name: "Binnendeur (kozijn + deur)", quantity: doors.length, unit: "st", category: "openings" });
  }
  if (windows.length > 0) {
    items.push({ name: "Raam / kozijn", quantity: windows.length, unit: "st", category: "openings" });
  }
  if (passages.length > 0) {
    items.push({ name: "Doorgang (afwerken)", quantity: passages.length, unit: "st", category: "openings" });
  }

  // ── Plinten (lopende meter) ───────────────────────────────────────────────
  let totalPerimeter = 0;
  let doorWidth = 0;
  for (const room of rooms) {
    if (room.polygon.length < 3) continue;
    for (let i = 0; i < room.polygon.length; i++) {
      const a = room.polygon[i];
      const b = room.polygon[(i + 1) % room.polygon.length];
      totalPerimeter += dist(a, b);
    }
  }
  for (const op of doors) doorWidth += op.width;
  const skirtingM = Math.max(0, totalPerimeter - doorWidth);
  if (skirtingM > 0) {
    items.push({
      name: "Plinten",
      quantity: Math.round(skirtingM * 10) / 10,
      unit: "m",
      category: "finishes",
    });
  }

  // ── Vloer per materiaal (als opgegeven) ────────────────────────────────────
  const floorByMaterial = new Map<string, number>();
  for (const room of rooms) {
    if (room.polygon.length < 3 || !room.floorMaterial) continue;
    const area = polygonArea(room.polygon);
    floorByMaterial.set(room.floorMaterial, (floorByMaterial.get(room.floorMaterial) ?? 0) + area);
  }
  const MATERIAL_NL: Record<string, string> = {
    tile: "Tegels", wood: "Houten vloer", carpet: "Vloerbedekking",
    stone: "Natuursteen vloer", concrete: "Betonvloer",
  };
  for (const [mat, area] of floorByMaterial) {
    items.push({
      name: MATERIAL_NL[mat] ?? mat,
      quantity: Math.round(area * 110) / 100, // +10% snijverlies
      unit: "m²",
      category: "floors",
      detail: "+10% snijverlies",
    });
  }

  return items;
}
