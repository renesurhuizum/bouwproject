// Generieke bewerkingen op geselecteerde entiteiten, onafhankelijk van hun soort.
// Gebruikt door lasso-selectie, verplaatsen (nudge), spiegelen en de
// multi-select-highlight-overlay. Pure functies; geen DB-toegang.

import type {
  Point,
  Wall,
  Room,
  ElectricalItem,
  PlumbingItem,
  HvacItem,
  Furniture,
  Staircase,
  Column,
  Beam,
  Roof,
  Dormer,
  SectionLine,
} from "./domain/types";
import type { SelKind } from "./store/editor";
import type { EditorLayer } from "./domain/types";
import { bounds } from "./geometry";

export type AnyEntity =
  | Wall
  | Room
  | ElectricalItem
  | PlumbingItem
  | HvacItem
  | Furniture
  | Staircase
  | Column
  | Beam
  | Roof
  | Dormer
  | SectionLine;

// Welke editor-laag (zichtbaarheid/lock) hoort bij een selectie-soort.
export const LAYER_FOR: Record<SelKind, EditorLayer> = {
  wall: "structure",
  opening: "structure",
  room: "rooms",
  electrical: "electrical",
  plumbing: "plumbing",
  hvac: "hvac",
  furniture: "furniture",
  staircase: "construction",
  column: "construction",
  beam: "construction",
  roof: "roof",
  dormer: "roof",
  section: "structure",
};

// De relevante geometrie-punten van een entiteit (voor hit-test & bbox).
export function entityPoints(kind: SelKind, e: AnyEntity): Point[] {
  switch (kind) {
    case "wall":
      return [(e as Wall).start, (e as Wall).end];
    case "room":
      return (e as Room).polygon;
    case "furniture":
      return [(e as Furniture).position];
    case "electrical":
      return [(e as ElectricalItem).position];
    case "plumbing": {
      const p = e as PlumbingItem;
      return p.path ?? (p.position ? [p.position] : []);
    }
    case "hvac": {
      const h = e as HvacItem;
      return h.path ?? (h.position ? [h.position] : []);
    }
    case "staircase":
      return [(e as Staircase).position];
    case "column":
      return [(e as Column).position];
    case "beam":
      return [(e as Beam).start, (e as Beam).end];
    case "dormer":
      return [(e as Dormer).position];
    case "roof":
      return (e as Roof).polygon ?? [];
    case "section":
      return [(e as SectionLine).start, (e as SectionLine).end];
    default:
      return [];
  }
}

// Patch om een entiteit met (dx, dy) meter te verplaatsen.
export function translatePatch(
  kind: SelKind,
  e: AnyEntity,
  dx: number,
  dy: number,
): Record<string, unknown> {
  const t = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
  switch (kind) {
    case "wall":
      return { start: t((e as Wall).start), end: t((e as Wall).end) };
    case "room":
      return { polygon: (e as Room).polygon.map(t) };
    case "furniture":
      return { position: t((e as Furniture).position) };
    case "electrical":
      return { position: t((e as ElectricalItem).position) };
    case "plumbing": {
      const p = e as PlumbingItem;
      if (p.path) return { path: p.path.map(t) };
      return p.position ? { position: t(p.position) } : {};
    }
    case "hvac": {
      const h = e as HvacItem;
      if (h.path) return { path: h.path.map(t) };
      return h.position ? { position: t(h.position) } : {};
    }
    case "staircase":
      return { position: t((e as Staircase).position) };
    case "column":
      return { position: t((e as Column).position) };
    case "beam":
      return { start: t((e as Beam).start), end: t((e as Beam).end) };
    case "dormer":
      return { position: t((e as Dormer).position) };
    case "section":
      return { start: t((e as SectionLine).start), end: t((e as SectionLine).end) };
    default:
      return {};
  }
}

// Patch om een entiteit te spiegelen rond `pivot` langs as "h" (x) of "v" (y).
export function mirrorPatch(
  kind: SelKind,
  e: AnyEntity,
  axis: "h" | "v",
  pivot: Point,
): Record<string, unknown> {
  const m = (p: Point): Point =>
    axis === "h"
      ? { x: 2 * pivot.x - p.x, y: p.y }
      : { x: p.x, y: 2 * pivot.y - p.y };
  switch (kind) {
    case "wall":
      return { start: m((e as Wall).start), end: m((e as Wall).end) };
    case "room":
      return { polygon: (e as Room).polygon.map(m) };
    case "furniture": {
      const f = e as Furniture;
      // Positie spiegelen + rotatie meekantelen zodat het meubel klopt.
      const rot = axis === "h" ? 180 - f.rotation : -f.rotation;
      return { position: m(f.position), rotation: ((rot % 360) + 360) % 360 };
    }
    case "electrical":
      return { position: m((e as ElectricalItem).position) };
    case "plumbing": {
      const p = e as PlumbingItem;
      if (p.path) return { path: p.path.map(m) };
      return p.position ? { position: m(p.position) } : {};
    }
    case "hvac": {
      const h = e as HvacItem;
      if (h.path) return { path: h.path.map(m) };
      return h.position ? { position: m(h.position) } : {};
    }
    case "staircase": {
      const s = e as Staircase;
      const rot = axis === "h" ? 180 - s.rotation : -s.rotation;
      return { position: m(s.position), rotation: ((rot % 360) + 360) % 360 };
    }
    case "column":
      return { position: m((e as Column).position) };
    case "beam":
      return { start: m((e as Beam).start), end: m((e as Beam).end) };
    case "dormer":
      return { position: m((e as Dormer).position) };
    case "section":
      return { start: m((e as SectionLine).start), end: m((e as SectionLine).end) };
    default:
      return {};
  }
}

// Gezamenlijke bounding box (in meters) van een set entiteiten.
export function selectionBounds(
  entities: { kind: SelKind; entity: AnyEntity }[],
): { min: Point; max: Point } {
  const pts: Point[] = [];
  for (const { kind, entity } of entities) pts.push(...entityPoints(kind, entity));
  return bounds(pts);
}
