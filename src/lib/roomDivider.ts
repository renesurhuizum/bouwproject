// Automatische ruimte-indeling (BSP-gebaseerd).
// Neemt een begrenzing-rechthoek + gewenste kamers → genereert muren + ruimte-polygonen.

import type { Point } from "./domain/types";

export interface LayoutRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface RoomSpec {
  name: string;
  weight: number; // relatief gewicht (oppervlak)
}

export interface FloorplanPreset {
  label: string;
  description: string;
  rooms: RoomSpec[];
}

export interface GeneratedWall {
  start: Point;
  end: Point;
}

export interface GeneratedRoom {
  name: string;
  polygon: Point[];
}

export interface GeneratedLayout {
  walls: GeneratedWall[];
  rooms: GeneratedRoom[];
}

// Nederlandse woningindeling-presets, geordend op logische volgorde (woonzone → service → slaapzone).
export const FLOORPLAN_PRESETS: FloorplanPreset[] = [
  {
    label: "Studio",
    description: "1 slaapkamer · keuken · badkamer",
    rooms: [
      { name: "Woon-/slaapkamer", weight: 5 },
      { name: "Keuken", weight: 2 },
      { name: "Hal", weight: 1 },
      { name: "Badkamer", weight: 1.5 },
    ],
  },
  {
    label: "Appartement",
    description: "2 slaapkamers · woonkamer · keuken",
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
    description: "3 slaapkamers · woon/keuken · badkamer",
    rooms: [
      { name: "Woonkamer", weight: 5 },
      { name: "Keuken", weight: 2.5 },
      { name: "Hal", weight: 1.5 },
      { name: "Toilet", weight: 0.5 },
      { name: "Slaapkamer 1", weight: 3 },
      { name: "Slaapkamer 2", weight: 2 },
      { name: "Slaapkamer 3", weight: 2 },
      { name: "Badkamer", weight: 1.5 },
    ],
  },
  {
    label: "Ruime woning",
    description: "4 slaapkamers · eetkamer · 2 badkamers",
    rooms: [
      { name: "Woonkamer", weight: 6 },
      { name: "Eetkamer", weight: 3 },
      { name: "Keuken", weight: 3 },
      { name: "Hal", weight: 2 },
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

function rectToPolygon(r: LayoutRect): Point[] {
  return [
    { x: r.x0, y: r.y0 },
    { x: r.x1, y: r.y0 },
    { x: r.x1, y: r.y1 },
    { x: r.x0, y: r.y1 },
  ];
}

// Recursive BSP: deel de rechthoek op in kamers via binaire splitsing.
// Splitsing langs de langste as, balanceer gewichten zo goed mogelijk.
function bsp(rect: LayoutRect, rooms: RoomSpec[], walls: GeneratedWall[], result: GeneratedRoom[]) {
  if (rooms.length === 0) return;

  if (rooms.length === 1) {
    result.push({ name: rooms[0].name, polygon: rectToPolygon(rect) });
    return;
  }

  const W = rect.x1 - rect.x0;
  const H = rect.y1 - rect.y0;
  const totalW = rooms.reduce((s, r) => s + r.weight, 0);

  // Zoek de optimale splitindex (dichtstbij 50/50 gewichtsverdeling).
  let splitIdx = 1;
  let bestBalance = Infinity;
  let cumW = 0;
  for (let i = 0; i < rooms.length - 1; i++) {
    cumW += rooms[i].weight;
    const balance = Math.abs(cumW / totalW - 0.5);
    if (balance < bestBalance) {
      bestBalance = balance;
      splitIdx = i + 1;
    }
  }

  const firstW = rooms.slice(0, splitIdx).reduce((s, r) => s + r.weight, 0);
  const ratio = firstW / totalW;

  if (W >= H) {
    // Verticale splitsing
    const sx = rect.x0 + W * ratio;
    walls.push({ start: { x: sx, y: rect.y0 }, end: { x: sx, y: rect.y1 } });
    bsp({ x0: rect.x0, y0: rect.y0, x1: sx, y1: rect.y1 }, rooms.slice(0, splitIdx), walls, result);
    bsp({ x0: sx, y0: rect.y0, x1: rect.x1, y1: rect.y1 }, rooms.slice(splitIdx), walls, result);
  } else {
    // Horizontale splitsing
    const sy = rect.y0 + H * ratio;
    walls.push({ start: { x: rect.x0, y: sy }, end: { x: rect.x1, y: sy } });
    bsp({ x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: sy }, rooms.slice(0, splitIdx), walls, result);
    bsp({ x0: rect.x0, y0: sy, x1: rect.x1, y1: rect.y1 }, rooms.slice(splitIdx), walls, result);
  }
}

export function generateFloorplan(boundary: LayoutRect, rooms: RoomSpec[]): GeneratedLayout {
  if (rooms.length === 0) return { walls: [], rooms: [] };

  const walls: GeneratedWall[] = [];
  const generatedRooms: GeneratedRoom[] = [];

  // Buitenmuren van de begrenzing zelf (niet als losse muren, maar als perimetermuren).
  // We voegen ze toe als 4 afzonderlijke segmenten.
  walls.push(
    { start: { x: boundary.x0, y: boundary.y0 }, end: { x: boundary.x1, y: boundary.y0 } },
    { start: { x: boundary.x1, y: boundary.y0 }, end: { x: boundary.x1, y: boundary.y1 } },
    { start: { x: boundary.x1, y: boundary.y1 }, end: { x: boundary.x0, y: boundary.y1 } },
    { start: { x: boundary.x0, y: boundary.y1 }, end: { x: boundary.x0, y: boundary.y0 } },
  );

  bsp(boundary, rooms, walls, generatedRooms);

  return { walls, rooms: generatedRooms };
}
