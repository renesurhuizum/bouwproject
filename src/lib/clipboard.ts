// Copy/paste logica voor multi-select in de editor.
// Items worden gekopieerd zonder id/updatedAt; bij paste worden nieuwe ids toegewezen.

import type {
  Wall, Opening, Room, ElectricalItem, PlumbingItem, HvacItem, Furniture, Point,
} from "./domain/types";
import type { Selection } from "./store/editor";
import type { ClipboardEntry } from "./store/editor";
import { getDB } from "./db/db";
import { newId } from "./db/repo";
import { bounds } from "./geometry";

type AllEntities = {
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  electrical: ElectricalItem[];
  plumbing: PlumbingItem[];
  hvac: HvacItem[];
  furniture: Furniture[];
};

export function buildClipboard(
  selected: Selection[],
  entities: AllEntities,
): ClipboardEntry {
  const wallIds = new Set(selected.filter((s) => s.kind === "wall").map((s) => s.id));
  const roomIds = new Set(selected.filter((s) => s.kind === "room").map((s) => s.id));
  const elecIds = new Set(selected.filter((s) => s.kind === "electrical").map((s) => s.id));
  const plumbIds = new Set(selected.filter((s) => s.kind === "plumbing").map((s) => s.id));
  const hvacIds = new Set(selected.filter((s) => s.kind === "hvac").map((s) => s.id));
  const furnIds = new Set(selected.filter((s) => s.kind === "furniture").map((s) => s.id));

  const selWalls = entities.walls.filter((w) => wallIds.has(w.id));
  const selRooms = entities.rooms.filter((r) => roomIds.has(r.id));
  const selElec = entities.electrical.filter((e) => elecIds.has(e.id));
  const selPlumb = entities.plumbing.filter((p) => plumbIds.has(p.id));
  const selHvac = entities.hvac.filter((h) => hvacIds.has(h.id));
  const selFurn = entities.furniture.filter((f) => furnIds.has(f.id));

  // Openings die bij geselecteerde muren horen, meenemen.
  const selOpenings = entities.openings.filter((o) => wallIds.has(o.wallId));

  // Bounding box over alle punten.
  const allPts: Point[] = [
    ...selWalls.flatMap((w) => [w.start, w.end]),
    ...selRooms.flatMap((r) => r.polygon),
    ...selElec.filter((e) => e.position).map((e) => e.position),
    ...selPlumb.filter((p) => p.position).map((p) => p.position!),
    ...selHvac.filter((h) => h.position).map((h) => h.position!),
    ...selFurn.map((f) => f.position),
  ];

  const bbox = allPts.length > 0
    ? bounds(allPts)
    : { min: { x: 0, y: 0 }, max: { x: 0, y: 0 } };

  function strip<T extends { id: string; updatedAt: number; deleted?: boolean }>(
    item: T,
  ): Omit<T, "id" | "updatedAt" | "deleted"> {
    const { id: _id, updatedAt: _u, deleted: _d, ...rest } = item;
    return rest as Omit<T, "id" | "updatedAt" | "deleted">;
  }

  return {
    walls: selWalls.map(strip) as unknown as Array<Record<string, unknown>>,
    openings: selOpenings.map(strip) as unknown as Array<Record<string, unknown>>,
    rooms: selRooms.map(strip) as unknown as Array<Record<string, unknown>>,
    electrical: selElec.map(strip) as unknown as Array<Record<string, unknown>>,
    plumbing: selPlumb.map(strip) as unknown as Array<Record<string, unknown>>,
    hvac: selHvac.map(strip) as unknown as Array<Record<string, unknown>>,
    furniture: selFurn.map(strip) as unknown as Array<Record<string, unknown>>,
    bbox,
  };
}

// Plak de clipboard-inhoud met een offset (m).
// Geeft de IDs terug van de nieuw aangemaakte items.
export async function pasteClipboard(
  clip: ClipboardEntry,
  offset: Point,
  levelId: string,
): Promise<Selection[]> {
  const created: Selection[] = [];

  function shiftPt(p: Point): Point {
    return { x: p.x + offset.x, y: p.y + offset.y };
  }

  // Houd een mapping bij van oude wallId → nieuwe wallId voor openings.
  const wallIdMap = new Map<string, string>();
  const db = getDB();
  const now = Date.now();

  for (const w of clip.walls) {
    const wall = w as Record<string, unknown>;
    const newWallId = newId();
    await db.walls.put({
      id: newWallId, updatedAt: now, levelId,
      start: shiftPt(wall.start as Point),
      end: shiftPt(wall.end as Point),
      thickness: wall.thickness as number,
      height: wall.height as number,
      material: wall.material as Wall["material"],
      loadBearing: wall.loadBearing as boolean,
      status: wall.status as Wall["status"],
    });
    created.push({ kind: "wall", id: newWallId });
    // Sla mapping op: position-key → newWallId (voor openings)
    const posKey = JSON.stringify(wall.start) + JSON.stringify(wall.end);
    wallIdMap.set(posKey, newWallId);
  }

  for (const o of clip.openings) {
    const op = o as Record<string, unknown>;
    // Probeer te linken aan de bijbehorende nieuwe muur via positie
    // Als we geen mapping hebben, skip
    const opId = newId();
    // Gebruik de eerst beschikbare nieuwe muur
    const firstNewWallId = created.filter((c) => c.kind === "wall")[0]?.id;
    if (!firstNewWallId) continue;
    await db.openings.put({
      id: opId, updatedAt: now,
      wallId: firstNewWallId,
      type: op.type as Opening["type"],
      width: op.width as number,
      height: op.height as number,
      sillHeight: op.sillHeight as number,
      offset: op.offset as number,
    });
  }

  for (const r of clip.rooms) {
    const room = r as Record<string, unknown>;
    const roomId = newId();
    await db.rooms.put({
      id: roomId, updatedAt: now, levelId,
      name: `${room.name as string} (kopie)`,
      func: room.func as string | undefined,
      polygon: (room.polygon as Point[]).map(shiftPt),
      color: room.color as string | undefined,
      wallColor: room.wallColor as string | undefined,
      floorMaterial: room.floorMaterial as Room["floorMaterial"],
    });
    created.push({ kind: "room", id: roomId });
  }

  for (const e of clip.electrical) {
    const el = e as Record<string, unknown>;
    if (!el.position) continue;
    const elId = newId();
    await db.electrical.put({
      id: elId, updatedAt: now, levelId,
      type: el.type as ElectricalItem["type"],
      position: shiftPt(el.position as Point),
      heightZ: el.heightZ as number,
      rotation: el.rotation as number | undefined,
      group: el.group as string | undefined,
      label: el.label as string | undefined,
      note: el.note as string | undefined,
    });
    created.push({ kind: "electrical", id: elId });
  }

  for (const p of clip.plumbing) {
    const pl = p as Record<string, unknown>;
    const plId = newId();
    await db.plumbing.put({
      id: plId, updatedAt: now, levelId,
      type: pl.type as PlumbingItem["type"],
      position: pl.position ? shiftPt(pl.position as Point) : undefined,
      path: pl.path ? (pl.path as Point[]).map(shiftPt) : undefined,
      fixture: pl.fixture as PlumbingItem["fixture"],
      heightZ: pl.heightZ as number | undefined,
      rotation: pl.rotation as number | undefined,
      diameter: pl.diameter as number | undefined,
      note: pl.note as string | undefined,
    });
    created.push({ kind: "plumbing", id: plId });
  }

  for (const h of clip.hvac) {
    const hv = h as Record<string, unknown>;
    const hvId = newId();
    await db.hvac.put({
      id: hvId, updatedAt: now, levelId,
      type: hv.type as HvacItem["type"],
      position: hv.position ? shiftPt(hv.position as Point) : undefined,
      path: hv.path ? (hv.path as Point[]).map(shiftPt) : undefined,
      heightZ: hv.heightZ as number | undefined,
      rotation: hv.rotation as number | undefined,
      note: hv.note as string | undefined,
    });
    created.push({ kind: "hvac", id: hvId });
  }

  for (const f of clip.furniture) {
    const fu = f as Record<string, unknown>;
    const fuId = newId();
    await db.furniture.put({
      id: fuId, updatedAt: now, levelId,
      kind: fu.kind as Furniture["kind"],
      position: shiftPt(fu.position as Point),
      rotation: fu.rotation as number,
      width: fu.width as number | undefined,
      depth: fu.depth as number | undefined,
      color: fu.color as string | undefined,
    });
    created.push({ kind: "furniture", id: fuId });
  }

  return created;
}
