// Ruimte-indeling generator — zone-gebaseerd algoritme voor Nederlandse woningen.
//
// Aanpak:
//  1. Categoriseer kamers op functie (wonen / circulatie / nat / slapen)
//  2. Deel de begrenzing op in drie functionele zones
//  3. Verdeel binnen elke zone via aspect-ratio-bewuste recursieve splitsing
//  4. Genereer deuren op alle inwendige muren
//  5. Ken kleuren toe per kamerfunctie

import type { Point } from "./domain/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface LayoutRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface RoomSpec {
  name: string;
  weight: number; // relatief gewicht voor oppervlakteverdeling
}

export interface FloorplanOptions {
  openLiving: boolean; // keuken + woonkamer als één open ruimte
}

export interface FloorplanPreset {
  label: string;
  description: string;
  rooms: RoomSpec[];
}

export interface GeneratedWall {
  start: Point;
  end: Point;
  isPerimeter: boolean;
}

export interface GeneratedRoom {
  name: string;
  polygon: Point[];
  color: string;
}

export interface GeneratedDoor {
  // Inwendige muur (index in walls) waarop de deur komt, plus offset vanaf start (m).
  wallIndex: number;
  offset: number;
  width: number;
}

export interface GeneratedLayout {
  walls: GeneratedWall[];
  rooms: GeneratedRoom[];
  doors: GeneratedDoor[];
}

// ── Presets ──────────────────────────────────────────────────────────────────

export const FLOORPLAN_PRESETS: FloorplanPreset[] = [
  {
    label: "Studio",
    description: "Woon-/slaapkamer · keuken · badkamer · hal",
    rooms: [
      { name: "Woon-/slaapkamer", weight: 6 },
      { name: "Keuken", weight: 2.5 },
      { name: "Hal", weight: 1.5 },
      { name: "Badkamer", weight: 1.5 },
    ],
  },
  {
    label: "Appartement",
    description: "Woonkamer · keuken · 2 slaapkamers · badkamer",
    rooms: [
      { name: "Woonkamer", weight: 4 },
      { name: "Keuken", weight: 2 },
      { name: "Hal", weight: 1.5 },
      { name: "Toilet", weight: 0.5 },
      { name: "Slaapkamer 1", weight: 2.5 },
      { name: "Slaapkamer 2", weight: 2 },
      { name: "Badkamer", weight: 1.5 },
    ],
  },
  {
    label: "Gezinswoning",
    description: "Woonkamer · keuken · 3 slaapkamers · badkamer · trap",
    rooms: [
      { name: "Woonkamer", weight: 5 },
      { name: "Keuken", weight: 2.5 },
      { name: "Hal", weight: 1.5 },
      { name: "Trap", weight: 1.5 },
      { name: "Toilet", weight: 0.5 },
      { name: "Slaapkamer 1 (master)", weight: 3 },
      { name: "Slaapkamer 2", weight: 2 },
      { name: "Slaapkamer 3", weight: 2 },
      { name: "Badkamer", weight: 1.5 },
    ],
  },
  {
    label: "Ruime woning",
    description: "Woon/eet · keuken · 4 slaapkamers · 2 badkamers · trap",
    rooms: [
      { name: "Woonkamer", weight: 5 },
      { name: "Eetkamer", weight: 3 },
      { name: "Keuken", weight: 3 },
      { name: "Hal", weight: 2 },
      { name: "Trap", weight: 1.5 },
      { name: "Toilet", weight: 0.5 },
      { name: "Slaapkamer 1 (master)", weight: 3.5 },
      { name: "Slaapkamer 2", weight: 2.5 },
      { name: "Slaapkamer 3", weight: 2.5 },
      { name: "Slaapkamer 4", weight: 2 },
      { name: "Badkamer 1", weight: 2 },
      { name: "Badkamer 2", weight: 1.5 },
    ],
  },
];

// ── Kamercategorie + kleur ───────────────────────────────────────────────────

type RoomCat = "living" | "sleeping" | "wet" | "hall" | "other";

const ROOM_COLOR: Record<RoomCat, string> = {
  living: "#fef3c7",   // warm geel — woon/eet/keuken
  sleeping: "#dbeafe", // lichtblauw — slaapkamers
  wet: "#ccfbf1",      // teal — badkamer/toilet
  hall: "#f3f4f6",     // lichtgrijs — hal/gang
  other: "#f5f3ff",    // paars — overig
};

function categorize(name: string): RoomCat {
  const n = name.toLowerCase();
  if (/woonkamer|eetkamer|keuken|woon.slaap|studio/.test(n)) return "living";
  if (/slaapkamer|master|slk/.test(n)) return "sleeping";
  if (/badkamer|douche|bad\b|toilet|wc\b|sanitair/.test(n)) return "wet";
  if (/hal\b|gang|entree|trap|bijkeuken|opberg|utility/.test(n)) return "hall";
  return "other";
}

// ── Geometrie-helpers ────────────────────────────────────────────────────────

function rectToPolygon(r: LayoutRect): Point[] {
  return [
    { x: r.x0, y: r.y0 },
    { x: r.x1, y: r.y0 },
    { x: r.x1, y: r.y1 },
    { x: r.x0, y: r.y1 },
  ];
}

function totalW(rooms: RoomSpec[]): number {
  return rooms.reduce((s, r) => s + r.weight, 0);
}

// ── Recursieve splitsing (aspect-ratio-bewust) ────────────────────────────────
//
// Kiest de splitrichting op basis van:
//  1. De langste as (standaard)
//  2. Maar als dat zou leiden tot een kamer smaller dan MIN_DIM, probeer de andere as
//  3. Als beide falen, forceer de standaardrichting toch

const MIN_DIM = 1.8; // m — kleinste toegestane kamerafmeting

function splitZone(
  rect: LayoutRect,
  rooms: RoomSpec[],
  walls: GeneratedWall[],
  genRooms: GeneratedRoom[],
) {
  if (rooms.length === 0) return;

  if (rooms.length === 1) {
    genRooms.push({
      name: rooms[0].name,
      polygon: rectToPolygon(rect),
      color: ROOM_COLOR[categorize(rooms[0].name)],
    });
    return;
  }

  const W = rect.x1 - rect.x0;
  const H = rect.y1 - rect.y0;
  const tw = totalW(rooms);

  // Zoek de meest gebalanceerde split (dichtstbij 50/50).
  let splitIdx = 1;
  let bestBal = Infinity;
  let cum = 0;
  for (let i = 0; i < rooms.length - 1; i++) {
    cum += rooms[i].weight;
    const bal = Math.abs(cum / tw - 0.5);
    if (bal < bestBal) {
      bestBal = bal;
      splitIdx = i + 1;
    }
  }

  const fw = rooms.slice(0, splitIdx).reduce((s, r) => s + r.weight, 0);
  const ratio = fw / tw;

  // Probeer horizontale splitsing (langs Y) als H >= W.
  function tryHorizontal(): boolean {
    const sy = rect.y0 + H * ratio;
    if (sy - rect.y0 < MIN_DIM || rect.y1 - sy < MIN_DIM) return false;
    walls.push({ start: { x: rect.x0, y: sy }, end: { x: rect.x1, y: sy }, isPerimeter: false });
    splitZone({ ...rect, y1: sy }, rooms.slice(0, splitIdx), walls, genRooms);
    splitZone({ ...rect, y0: sy }, rooms.slice(splitIdx), walls, genRooms);
    return true;
  }

  function tryVertical(): boolean {
    const sx = rect.x0 + W * ratio;
    if (sx - rect.x0 < MIN_DIM || rect.x1 - sx < MIN_DIM) return false;
    walls.push({ start: { x: sx, y: rect.y0 }, end: { x: sx, y: rect.y1 }, isPerimeter: false });
    splitZone({ ...rect, x1: sx }, rooms.slice(0, splitIdx), walls, genRooms);
    splitZone({ ...rect, x0: sx }, rooms.slice(splitIdx), walls, genRooms);
    return true;
  }

  if (H >= W) {
    if (tryHorizontal()) return;
    if (tryVertical()) return;
  } else {
    if (tryVertical()) return;
    if (tryHorizontal()) return;
  }

  // Noodgeval: forceer langs langste as, ook als kamer te smal wordt.
  if (H >= W) {
    const sy = rect.y0 + H * ratio;
    walls.push({ start: { x: rect.x0, y: sy }, end: { x: rect.x1, y: sy }, isPerimeter: false });
    splitZone({ ...rect, y1: sy }, rooms.slice(0, splitIdx), walls, genRooms);
    splitZone({ ...rect, y0: sy }, rooms.slice(splitIdx), walls, genRooms);
  } else {
    const sx = rect.x0 + W * ratio;
    walls.push({ start: { x: sx, y: rect.y0 }, end: { x: sx, y: rect.y1 }, isPerimeter: false });
    splitZone({ ...rect, x1: sx }, rooms.slice(0, splitIdx), walls, genRooms);
    splitZone({ ...rect, x0: sx }, rooms.slice(splitIdx), walls, genRooms);
  }
}

// ── Deur-generatie ───────────────────────────────────────────────────────────
//
// Plaats één deur per inwendige muur op 60% van de muurbreedte (niet precies midden
// zodat hij beter bereikbaar is vanuit de hal).

const DOOR_WIDTH = 0.9;

function placeDoors(walls: GeneratedWall[]): GeneratedDoor[] {
  const doors: GeneratedDoor[] = [];
  walls.forEach((w, i) => {
    if (w.isPerimeter) return;
    const len = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
    if (len < DOOR_WIDTH + 0.2) return; // muur te kort voor deur
    // Deur op 40% van de muurbreedte (licht excentrisch).
    const offset = Math.max(DOOR_WIDTH / 2 + 0.1, len * 0.4);
    doors.push({ wallIndex: i, offset, width: DOOR_WIDTH });
  });
  return doors;
}

// ── Hoofdfunctie ─────────────────────────────────────────────────────────────
//
// Zone-indeling voor een NL woning:
//
//  Portrait (H ≥ 0.7 W):
//  ┌──────────────────┐  y0       ← voorzijde / straat
//  │   WOONZONE        │          ← woonkamer + keuken ± eetkamer
//  ├──────────────────┤  z1
//  │   CIRCULATIE      │          ← hal + toilet
//  ├──────────────────┤  z2
//  │   PRIVÉ ZONE      │          ← slaapkamers + badkamer
//  └──────────────────┘  y1       ← achterzijde / tuin
//
//  Landscape (W > 1.4 H):
//  ┌──────┬──────┬──────┐
//  │ WOON │ HAL  │ PRIV │
//  │ ZONE │      │ ÉZN  │
//  └──────┴──────┴──────┘

export function generateFloorplan(
  boundary: LayoutRect,
  rooms: RoomSpec[],
  options: FloorplanOptions = { openLiving: false },
): GeneratedLayout {
  if (rooms.length === 0) return { walls: [], rooms: [], doors: [] };

  const walls: GeneratedWall[] = [];
  const genRooms: GeneratedRoom[] = [];

  // Buitenmuren.
  const { x0, y0, x1, y1 } = boundary;
  walls.push(
    { start: { x: x0, y: y0 }, end: { x: x1, y: y0 }, isPerimeter: true },
    { start: { x: x1, y: y0 }, end: { x: x1, y: y1 }, isPerimeter: true },
    { start: { x: x1, y: y1 }, end: { x: x0, y: y1 }, isPerimeter: true },
    { start: { x: x0, y: y1 }, end: { x: x0, y: y0 }, isPerimeter: true },
  );

  // Open keuken/woonkamer: combineer alle living-kamers tot één ruimte.
  let effectiveRooms = rooms;
  if (options.openLiving) {
    const livingRooms = rooms.filter(r => categorize(r.name) === "living");
    const otherRooms  = rooms.filter(r => categorize(r.name) !== "living");
    if (livingRooms.length > 1) {
      const combinedWeight = livingRooms.reduce((s, r) => s + r.weight, 0);
      effectiveRooms = [{ name: "Woon-/eetruimte", weight: combinedWeight }, ...otherRooms];
    }
  }

  // Categoriseer.
  const living   = effectiveRooms.filter(r => ["living", "other"].includes(categorize(r.name)));
  const wet      = effectiveRooms.filter(r => categorize(r.name) === "wet");
  const sleeping = effectiveRooms.filter(r => categorize(r.name) === "sleeping");
  const hall     = effectiveRooms.filter(r => categorize(r.name) === "hall");

  const W = x1 - x0;
  const H = y1 - y0;

  // Als er geen zinvolle zonering is, val terug op verbeterde BSP.
  const hasMultipleZones = living.length > 0 && (sleeping.length > 0 || wet.length > 0);
  if (!hasMultipleZones) {
    splitZone(boundary, effectiveRooms, walls, genRooms);
    return { walls, rooms: genRooms, doors: placeDoors(walls) };
  }

  // Zones gewichten.
  const lwLiving   = totalW(living)   || 4;
  const lwHall     = totalW(hall)     || 1.5;
  const lwPrivate  = totalW(sleeping) + totalW(wet) || 3;
  const lwTotal    = lwLiving + lwHall + lwPrivate;

  const portrait = H >= W * 0.7;

  if (portrait) {
    // ── Horizontale zones ────────────────────────────────────────────────────
    const z1 = y0 + H * (lwLiving / lwTotal);
    const z2 = y0 + H * ((lwLiving + lwHall) / lwTotal);

    // Zoneafscheidingswanden.
    walls.push(
      { start: { x: x0, y: z1 }, end: { x: x1, y: z1 }, isPerimeter: false },
      { start: { x: x0, y: z2 }, end: { x: x1, y: z2 }, isPerimeter: false },
    );

    // Woonzone.
    splitZone({ x0, y0, x1, y1: z1 }, living, walls, genRooms);

    // Circulatiezone: hal + toilet (als aanwezig) naast elkaar.
    const circRect: LayoutRect = { x0, y0: z1, x1, y1: z2 };
    const circRooms = [...hall];
    // Kleine natte ruimten (toilet) in circulatiezone plaatsen als er ook slaapkamers zijn.
    const toilets = wet.filter(r => /toilet|wc\b/.test(r.name.toLowerCase()));
    const bigWet  = wet.filter(r => !/toilet|wc\b/.test(r.name.toLowerCase()));
    if (toilets.length > 0 && sleeping.length > 0) {
      circRooms.push(...toilets);
    }
    if (circRooms.length > 0) {
      splitZone(circRect, circRooms, walls, genRooms);
    } else {
      genRooms.push({ name: "Hal", polygon: rectToPolygon(circRect), color: ROOM_COLOR.hall });
    }

    // Privézone: slaapkamers + grote natte ruimten.
    const privateRooms = [...sleeping, ...bigWet];
    // Toilet ook hier als er geen slaapkamers zijn.
    if (sleeping.length === 0) privateRooms.push(...toilets);
    if (privateRooms.length > 0) {
      splitZone({ x0, y0: z2, x1, y1 }, privateRooms, walls, genRooms);
    }
  } else {
    // ── Verticale zones ──────────────────────────────────────────────────────
    const z1 = x0 + W * (lwLiving / lwTotal);
    const z2 = x0 + W * ((lwLiving + lwHall) / lwTotal);

    walls.push(
      { start: { x: z1, y: y0 }, end: { x: z1, y: y1 }, isPerimeter: false },
      { start: { x: z2, y: y0 }, end: { x: z2, y: y1 }, isPerimeter: false },
    );

    splitZone({ x0, y0, x1: z1, y1 }, living, walls, genRooms);

    const circRect: LayoutRect = { x0: z1, y0, x1: z2, y1 };
    const toilets = wet.filter(r => /toilet|wc\b/.test(r.name.toLowerCase()));
    const circRooms = [...hall, ...(sleeping.length > 0 ? toilets : [])];
    if (circRooms.length > 0) {
      splitZone(circRect, circRooms, walls, genRooms);
    } else {
      genRooms.push({ name: "Hal", polygon: rectToPolygon(circRect), color: ROOM_COLOR.hall });
    }

    const bigWet = wet.filter(r => !/toilet|wc\b/.test(r.name.toLowerCase()));
    const privateRooms = [...sleeping, ...bigWet, ...(sleeping.length === 0 ? toilets : [])];
    if (privateRooms.length > 0) {
      splitZone({ x0: z2, y0, x1, y1 }, privateRooms, walls, genRooms);
    }
  }

  return { walls, rooms: genRooms, doors: placeDoors(walls) };
}
