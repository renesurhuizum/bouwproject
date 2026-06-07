// Automatische indeling-generator (rule-based, offline).
// Verdeelt een rechthoek via guillotine-slicing in kamers, met de voordeur-zijde
// en lichte tekst-wensen als sturing. Levert meerdere varianten als suggestie.

import type { Point } from "./domain/types";

export type DoorSide = "voor" | "achter" | "links" | "rechts";

export interface LayoutPrefs {
  width: number; // m (links-rechts)
  depth: number; // m (voor-achter)
  doorSide: DoorSide;
  bedrooms: number;
  wishes: string; // vrije tekst
}

interface RoomSpec {
  name: string;
  func: string;
  weight: number; // relatieve oppervlakte
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GenRoom {
  name: string;
  func: string;
  rect: Rect;
}

export interface Segment {
  a: Point;
  b: Point;
}

export interface Layout {
  rooms: GenRoom[];
  cuts: Segment[]; // interne scheidingswanden
  outer: Rect;
}

// Lichte tekst-analyse voor extra ruimtes en aantal slaapkamers.
export function parseWishes(text: string): { bedrooms?: number; extras: RoomSpec[] } {
  const t = text.toLowerCase();
  const extras: RoomSpec[] = [];
  const m = t.match(/(\d+)\s*slaap/);
  const bedrooms = m ? Math.min(5, Math.max(1, parseInt(m[1], 10))) : undefined;

  const add = (kw: string, name: string, func: string, weight: number) => {
    if (t.includes(kw)) extras.push({ name, func, weight });
  };
  add("kantoor", "Kantoor", "werkkamer", 10);
  add("werkkamer", "Werkkamer", "werkkamer", 10);
  add("bijkeuken", "Bijkeuken", "bijkeuken", 8);
  add("wasruimte", "Wasruimte", "wasruimte", 6);
  add("berging", "Berging", "berging", 7);
  add("garage", "Garage", "garage", 18);
  add("speelkamer", "Speelkamer", "speelkamer", 12);
  return { bedrooms, extras };
}

function buildProgram(prefs: LayoutPrefs): RoomSpec[] {
  const parsed = parseWishes(prefs.wishes);
  const beds = parsed.bedrooms ?? prefs.bedrooms;

  const program: RoomSpec[] = [
    { name: "Hal", func: "hal", weight: 8 },
    { name: "Woonkamer", func: "woonkamer", weight: 30 },
    { name: "Keuken", func: "keuken", weight: 14 },
  ];
  for (let i = 1; i <= beds; i++) {
    program.push({
      name: beds === 1 ? "Slaapkamer" : `Slaapkamer ${i}`,
      func: "slaapkamer",
      weight: i === 1 ? 16 : 11,
    });
  }
  program.push({ name: "Badkamer", func: "badkamer", weight: 8 });
  program.push({ name: "Toilet", func: "toilet", weight: 3 });
  program.push(...parsed.extras);
  return program;
}

const sum = (arr: RoomSpec[]) => arr.reduce((s, r) => s + r.weight, 0);

function slice(rect: Rect, specs: RoomSpec[], cuts: Segment[]): GenRoom[] {
  if (specs.length === 1) {
    return [{ name: specs[0].name, func: specs[0].func, rect }];
  }
  const total = sum(specs);
  const half = total / 2;
  // k = aantal kamers in groep A; altijd 1..length-1 zodat B niet leeg is.
  let k = 1;
  let acc = specs[0].weight;
  while (k < specs.length - 1 && acc + specs[k].weight <= half) {
    acc += specs[k].weight;
    k++;
  }
  const A = specs.slice(0, k);
  const B = specs.slice(k);
  const frac = sum(A) / total;

  if (rect.w >= rect.h) {
    const cutX = rect.x + rect.w * frac;
    cuts.push({ a: { x: cutX, y: rect.y }, b: { x: cutX, y: rect.y + rect.h } });
    const rA = { x: rect.x, y: rect.y, w: rect.w * frac, h: rect.h };
    const rB = { x: cutX, y: rect.y, w: rect.w * (1 - frac), h: rect.h };
    return [...slice(rA, A, cuts), ...slice(rB, B, cuts)];
  } else {
    const cutY = rect.y + rect.h * frac;
    cuts.push({ a: { x: rect.x, y: cutY }, b: { x: rect.x + rect.w, y: cutY } });
    const rA = { x: rect.x, y: rect.y, w: rect.w, h: rect.h * frac };
    const rB = { x: rect.x, y: cutY, w: rect.w, h: rect.h * (1 - frac) };
    return [...slice(rA, A, cuts), ...slice(rB, B, cuts)];
  }
}

// Spiegel zodat de "hal-hoek" (canoniek linksboven) naar de voordeur-zijde gaat.
function orientForDoor(layout: Layout, side: DoorSide): Layout {
  const { width, height } = { width: layout.outer.w, height: layout.outer.h };
  const mirrorX = side === "rechts";
  const mirrorY = side === "voor";
  if (!mirrorX && !mirrorY) return layout;

  const fx = (x: number) => (mirrorX ? width - x : x);
  const fy = (y: number) => (mirrorY ? height - y : y);
  const fp = (p: Point): Point => ({ x: fx(p.x), y: fy(p.y) });

  return {
    outer: layout.outer,
    rooms: layout.rooms.map((r) => ({
      ...r,
      rect: {
        x: mirrorX ? width - (r.rect.x + r.rect.w) : r.rect.x,
        y: mirrorY ? height - (r.rect.y + r.rect.h) : r.rect.y,
        w: r.rect.w,
        h: r.rect.h,
      },
    })),
    cuts: layout.cuts.map((c) => ({ a: fp(c.a), b: fp(c.b) })),
  };
}

// Drie varianten door de volgorde van publieke ruimtes te wisselen.
export function generateLayouts(prefs: LayoutPrefs): Layout[] {
  const base = buildProgram(prefs);
  const hal = base[0];
  const rest = base.slice(1);
  const woon = rest.find((r) => r.func === "woonkamer")!;
  const keuken = rest.find((r) => r.func === "keuken")!;
  const overige = rest.filter((r) => r.func !== "woonkamer" && r.func !== "keuken");

  const orders: RoomSpec[][] = [
    [hal, woon, keuken, ...overige],
    [hal, keuken, woon, ...overige],
    [hal, woon, ...overige.slice(0, 1), keuken, ...overige.slice(1)],
  ];

  return orders.map((specs) => {
    const outer = { x: 0, y: 0, w: prefs.width, h: prefs.depth };
    const cuts: Segment[] = [];
    const rooms = slice({ ...outer }, specs, cuts);
    return orientForDoor({ rooms, cuts, outer }, prefs.doorSide);
  });
}

// Buitenmuren als 4 segmenten.
export function outerWalls(outer: Rect): Segment[] {
  const { x, y, w, h } = outer;
  return [
    { a: { x, y }, b: { x: x + w, y } },
    { a: { x: x + w, y }, b: { x: x + w, y: y + h } },
    { a: { x: x + w, y: y + h }, b: { x, y: y + h } },
    { a: { x, y: y + h }, b: { x, y } },
  ];
}

export function rectPolygon(r: Rect): Point[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}
