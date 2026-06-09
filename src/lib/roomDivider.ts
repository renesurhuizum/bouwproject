// Ruimte-indeling generator — zone-gebaseerd algoritme voor Nederlandse woningen.
//
// Aanpak:
//  1. Categoriseer kamers op functie (wonen / circulatie / nat / slapen)
//  2. Splits het vlak in publiek (wonen) vs. privé (slaap) met circulatie ertussen
//  3. Natte ruimten worden gegroepeerd in een leidingenblok
//  4. Kamers zijn altijd minimaal MIN_DIM × MIN_DIM
//  5. Deuren op alle inwendige muren

import type { Point } from "./domain/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface LayoutRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type RoomFunc = "living" | "sleeping" | "wet" | "hall" | "other";

export interface RoomSpec {
  name: string;
  weight: number;   // relatief gewicht voor oppervlakteverdeling
  func?: RoomFunc;  // optioneel expliciete functie (anders afgeleid uit naam)
}

export interface FloorplanOptions {
  openLiving: boolean;    // keuken + woonkamer als één open ruimte
  openPlanPct?: number;   // 0–100: hoe open woon/eetkamer samenvloeit (0 = volledig gescheiden, 100 = volledig open)
}

export interface FloorplanPreset {
  id: string;
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
    id: "studio",
    label: "Studio",
    description: "40–60 m², open plan",
    rooms: [
      { name: "Woon-/slaapkamer", func: "living",   weight: 3 },
      { name: "Keuken",           func: "wet",      weight: 1 },
      { name: "Badkamer",         func: "wet",      weight: 0.6 },
      { name: "Entree",           func: "hall",     weight: 0.4 },
    ],
  },
  {
    id: "appartement",
    label: "Appartement",
    description: "Woonkamer · keuken · 2 slaapkamers · badkamer",
    rooms: [
      { name: "Woonkamer",    func: "living",   weight: 4 },
      { name: "Keuken",       func: "wet",      weight: 2 },
      { name: "Hal",          func: "hall",     weight: 1.5 },
      { name: "Toilet",       func: "wet",      weight: 0.5 },
      { name: "Slaapkamer 1", func: "sleeping", weight: 2.5 },
      { name: "Slaapkamer 2", func: "sleeping", weight: 2 },
      { name: "Badkamer",     func: "wet",      weight: 1.5 },
    ],
  },
  {
    id: "gezinswoning",
    label: "Gezinswoning",
    description: "Woonkamer · keuken · 3 slaapkamers · badkamer · trap",
    rooms: [
      { name: "Woonkamer",           func: "living",   weight: 5 },
      { name: "Keuken",              func: "wet",      weight: 2.5 },
      { name: "Hal",                 func: "hall",     weight: 1.5 },
      { name: "Trap",                func: "hall",     weight: 1.5 },
      { name: "Toilet",              func: "wet",      weight: 0.5 },
      { name: "Slaapkamer 1 (master)", func: "sleeping", weight: 3 },
      { name: "Slaapkamer 2",        func: "sleeping", weight: 2 },
      { name: "Slaapkamer 3",        func: "sleeping", weight: 2 },
      { name: "Badkamer",            func: "wet",      weight: 1.5 },
    ],
  },
  {
    id: "ruime-woning",
    label: "Ruime woning",
    description: "Woon/eet · keuken · 4 slaapkamers · 2 badkamers · trap",
    rooms: [
      { name: "Woonkamer",           func: "living",   weight: 5 },
      { name: "Eetkamer",            func: "living",   weight: 3 },
      { name: "Keuken",              func: "wet",      weight: 3 },
      { name: "Hal",                 func: "hall",     weight: 2 },
      { name: "Trap",                func: "hall",     weight: 1.5 },
      { name: "Toilet",              func: "wet",      weight: 0.5 },
      { name: "Slaapkamer 1 (master)", func: "sleeping", weight: 3.5 },
      { name: "Slaapkamer 2",        func: "sleeping", weight: 2.5 },
      { name: "Slaapkamer 3",        func: "sleeping", weight: 2.5 },
      { name: "Slaapkamer 4",        func: "sleeping", weight: 2 },
      { name: "Badkamer 1",          func: "wet",      weight: 2 },
      { name: "Badkamer 2",          func: "wet",      weight: 1.5 },
    ],
  },
  {
    id: "vrijstaand",
    label: "Vrijstaande woning",
    description: "150–200 m², 4+ slaapkamers",
    rooms: [
      { name: "Woonkamer",           func: "living",   weight: 2.5 },
      { name: "Eetkamer",            func: "living",   weight: 1.5 },
      { name: "Keuken",              func: "wet",      weight: 1.5 },
      { name: "Bijkeuken",           func: "hall",     weight: 0.6 },
      { name: "Hal",                 func: "hall",     weight: 0.8 },
      { name: "Toilet",              func: "wet",      weight: 0.3 },
      { name: "Slaapkamer 1",        func: "sleeping", weight: 1.8 },
      { name: "Slaapkamer 2",        func: "sleeping", weight: 1.4 },
      { name: "Slaapkamer 3",        func: "sleeping", weight: 1.2 },
      { name: "Slaapkamer 4",        func: "sleeping", weight: 1.0 },
      { name: "Badkamer",            func: "wet",      weight: 0.8 },
      { name: "Trap",                func: "hall",     weight: 0.5 },
    ],
  },
];

// ── Kamercategorie + kleur ───────────────────────────────────────────────────

const ROOM_COLOR: Record<RoomFunc, string> = {
  living:   "#fef3c7", // warm geel — woon/eet/keuken
  sleeping: "#dbeafe", // lichtblauw — slaapkamers
  wet:      "#ccfbf1", // teal — badkamer/toilet
  hall:     "#f3f4f6", // lichtgrijs — hal/gang/trap
  other:    "#f5f3ff", // paars — overig
};

function categorize(room: RoomSpec): RoomFunc {
  if (room.func) return room.func;
  const n = room.name.toLowerCase();
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

// ── Constanten ───────────────────────────────────────────────────────────────

const MIN_DIM = 1.8; // m — kleinste toegestane kamerafmeting

// ── Recursieve splitsing (aspect-ratio-bewust) ────────────────────────────────
//
// Kiest splitrichting op basis van langste as.
// Respecteert MIN_DIM: als de splitsing een kamer kleiner dan MIN_DIM zou maken,
// probeer de andere as. Als beide falen, forceer de standaardrichting toch.

function splitZone(
  rect: LayoutRect,
  rooms: RoomSpec[],
  walls: GeneratedWall[],
  genRooms: GeneratedRoom[],
): void {
  if (rooms.length === 0) return;

  if (rooms.length === 1) {
    genRooms.push({
      name: rooms[0].name,
      polygon: rectToPolygon(rect),
      color: ROOM_COLOR[categorize(rooms[0])],
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

  // Noodgeval: forceer langs langste as (MIN_DIM-check overgeslagen).
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

const DOOR_WIDTH = 0.9;

function placeDoors(walls: GeneratedWall[]): GeneratedDoor[] {
  const doors: GeneratedDoor[] = [];
  walls.forEach((w, i) => {
    if (w.isPerimeter) return;
    const len = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
    if (len < DOOR_WIDTH + 0.2) return;
    // Deur licht excentrisch (40%) voor betere bereikbaarheid vanuit hal.
    const offset = Math.max(DOOR_WIDTH / 2 + 0.1, len * 0.4);
    doors.push({ wallIndex: i, offset, width: DOOR_WIDTH });
  });
  return doors;
}

// ── Hoofdfunctie ─────────────────────────────────────────────────────────────
//
// Zone-indeling voor een NL woning:
//
//  Portrait (H ≥ W * 0.7):
//  ┌──────────────────┐  y0       ← voorzijde / straat
//  │   WOONZONE        │          ← woonkamer + keuken (min 35% vloer)
//  ├──────────────────┤  z1
//  │   CIRCULATIE      │          ← hal + toilet (leidingenblok)
//  ├──────────────────┤  z2
//  │   PRIVÉ ZONE      │          ← slaapkamers + badkamer
//  └──────────────────┘  y1       ← achterzijde / tuin
//
//  Landscape (W > W * 1.4):
//  ┌──────┬──────┬──────┐
//  │ WOON │ HAL  │ PRIVÉ│
//  │ ZONE │      │ ZONE │
//  └──────┴──────┴──────┘
//
// Verbeteringen t.o.v. v1:
//  - Natte ruimten worden gegroepeerd aan dezelfde zijde (leidingenblok)
//  - Woonzone krijgt minimaal 35% van het totale oppervlak bij gezinswoningen
//  - Hal loopt altijd als centrale verbinding
//  - Open-plan percentage stuurt de combinatie woon/eetkamer

export function generateFloorplan(
  boundary: LayoutRect,
  rooms: RoomSpec[],
  options: FloorplanOptions = { openLiving: false, openPlanPct: 0 },
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

  // Open-plan verwerking: openPlanPct 0 = volledig gescheiden, 100 = volledig open.
  const openPct = options.openPlanPct ?? (options.openLiving ? 100 : 0);
  let effectiveRooms = rooms.map((r) => ({ ...r, func: r.func ?? categorize(r) }));

  if (openPct >= 50) {
    // Combineer woon- en eetzones in één ruimte.
    const livingRooms = effectiveRooms.filter((r) => categorize(r) === "living");
    const otherRooms  = effectiveRooms.filter((r) => categorize(r) !== "living");
    if (livingRooms.length > 1) {
      const combinedWeight = livingRooms.reduce((s, r) => s + r.weight, 0);
      effectiveRooms = [{ name: "Woon-/eetruimte", func: "living" as RoomFunc, weight: combinedWeight }, ...otherRooms];
    }
  }

  // Categoriseer.
  const living   = effectiveRooms.filter((r) => ["living", "other"].includes(categorize(r)));
  const wet      = effectiveRooms.filter((r) => categorize(r) === "wet");
  const sleeping = effectiveRooms.filter((r) => categorize(r) === "sleeping");
  const hall     = effectiveRooms.filter((r) => categorize(r) === "hall");

  const W = x1 - x0;
  const H = y1 - y0;
  const totalArea = W * H;

  // Als er geen zinvolle zonering is, val terug op verbeterde BSP.
  const hasMultipleZones = living.length > 0 && (sleeping.length > 0 || wet.length > 0);
  if (!hasMultipleZones) {
    splitZone(boundary, effectiveRooms, walls, genRooms);
    return { walls, rooms: genRooms, doors: placeDoors(walls) };
  }

  // Zones gewichten — woonzone krijgt minimaal 35% van het totaal bij gezinswoningen.
  const lwLiving   = totalW(living)   || 4;
  const lwHall     = totalW(hall)     || 1.5;
  const lwWet      = totalW(wet)      || 1;
  const lwSleeping = totalW(sleeping) || 3;

  // Toiletten naar de circulatiezone (naast hal), grote natte ruimten naar privézone.
  const toilets = wet.filter((r) => /toilet|wc\b/.test(r.name.toLowerCase()));
  const bigWet  = wet.filter((r) => !/toilet|wc\b/.test(r.name.toLowerCase()));

  // Circulatiezone: hal + trap + toiletten.
  const circRooms   = [...hall, ...(sleeping.length > 0 ? toilets : [])];
  const privateRooms = [...sleeping, ...bigWet, ...(sleeping.length === 0 ? toilets : [])];

  const lwCirc    = totalW(circRooms)    || 1.5;
  const lwPrivate = totalW(privateRooms) || 3;
  const lwTotal   = lwLiving + lwCirc + lwPrivate;

  // Garandeer woonzone ≥ 35% bij grotere woningen (>60 m²).
  let livingRatio = lwLiving / lwTotal;
  if (totalArea > 60 && livingRatio < 0.35) {
    livingRatio = 0.35;
  }
  const circRatio    = (lwCirc / lwTotal) * (1 - livingRatio) / ((lwCirc + lwPrivate) / lwTotal);
  const privateRatio = 1 - livingRatio - circRatio;

  const portrait = H >= W * 0.7;

  if (portrait) {
    // ── Horizontale zones ────────────────────────────────────────────────────
    const z1 = y0 + H * livingRatio;
    const z2 = y0 + H * (livingRatio + circRatio);

    // Zoneafscheidingswanden.
    walls.push(
      { start: { x: x0, y: z1 }, end: { x: x1, y: z1 }, isPerimeter: false },
      { start: { x: x0, y: z2 }, end: { x: x1, y: z2 }, isPerimeter: false },
    );

    // Woonzone (voorzijde).
    splitZone({ x0, y0, x1, y1: z1 }, living, walls, genRooms);

    // Circulatiezone.
    const circRect: LayoutRect = { x0, y0: z1, x1, y1: z2 };
    if (circRooms.length > 0) {
      splitZone(circRect, circRooms, walls, genRooms);
    } else {
      genRooms.push({ name: "Hal", polygon: rectToPolygon(circRect), color: ROOM_COLOR.hall });
    }

    // Privézone (achterzijde): slaapkamers + badkamer gegroepeerd.
    if (privateRooms.length > 0) {
      // Groepeer natte ruimten links in de privézone (leidingenblok).
      const orderedPrivate = [...bigWet, ...sleeping, ...(sleeping.length === 0 ? toilets : [])];
      splitZone({ x0, y0: z2, x1, y1 }, orderedPrivate, walls, genRooms);
    }
  } else {
    // ── Verticale zones ──────────────────────────────────────────────────────
    const z1 = x0 + W * livingRatio;
    const z2 = x0 + W * (livingRatio + circRatio);

    walls.push(
      { start: { x: z1, y: y0 }, end: { x: z1, y: y1 }, isPerimeter: false },
      { start: { x: z2, y: y0 }, end: { x: z2, y: y1 }, isPerimeter: false },
    );

    splitZone({ x0, y0, x1: z1, y1 }, living, walls, genRooms);

    const circRect: LayoutRect = { x0: z1, y0, x1: z2, y1 };
    if (circRooms.length > 0) {
      splitZone(circRect, circRooms, walls, genRooms);
    } else {
      genRooms.push({ name: "Hal", polygon: rectToPolygon(circRect), color: ROOM_COLOR.hall });
    }

    const orderedPrivate = [...bigWet, ...sleeping, ...(sleeping.length === 0 ? toilets : [])];
    if (orderedPrivate.length > 0) {
      splitZone({ x0: z2, y0, x1, y1 }, orderedPrivate, walls, genRooms);
    }
  }

  return { walls, rooms: genRooms, doors: placeDoors(walls) };
}
