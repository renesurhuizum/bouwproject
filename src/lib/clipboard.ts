// Kopiëren / plakken van geselecteerde entiteiten.
// copySelection() bouwt een serialiseerbaar klembord uit de geladen entiteiten;
// pasteClipboard() maakt nieuwe entiteiten aan met een offset. Gekoppelde
// openingen worden bij plakken opnieuw aan de gekopieerde muur verbonden.

import { create } from "./db/repo";
import type { Clipboard, ClipItem, Selection, SelKind } from "./store/editor";
import type {
  Point,
  Wall,
  Room,
  Opening,
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

export interface ClipboardData {
  walls: Wall[];
  rooms: Room[];
  openings: Opening[];
  electrical: ElectricalItem[];
  plumbing: PlumbingItem[];
  hvac: HvacItem[];
  furniture: Furniture[];
  stairs: Staircase[];
  columns: Column[];
  beams: Beam[];
  roofs: Roof[];
  dormers: Dormer[];
  sections: SectionLine[];
}

const find = <T extends { id: string }>(arr: T[], id: string) =>
  arr.find((x) => x.id === id);

// Bouw een klembord uit de huidige selectie + geladen entiteiten.
// Openingen van gekopieerde muren worden automatisch meegenomen.
export function copySelection(sels: Selection[], data: ClipboardData): Clipboard {
  const items: ClipItem[] = [];
  const copiedWallIds = new Set<string>();

  for (const s of sels) {
    switch (s.kind) {
      case "wall": {
        const w = find(data.walls, s.id);
        if (!w) break;
        copiedWallIds.add(w.id);
        items.push({
          kind: "wall",
          srcId: w.id,
          data: {
            start: w.start,
            end: w.end,
            thickness: w.thickness,
            height: w.height,
            material: w.material,
            loadBearing: w.loadBearing,
            status: w.status,
          },
        });
        break;
      }
      case "room": {
        const r = find(data.rooms, s.id);
        if (!r) break;
        items.push({
          kind: "room",
          srcId: r.id,
          data: {
            name: r.name,
            func: r.func,
            polygon: r.polygon,
            color: r.color,
            wallColor: r.wallColor,
            floorMaterial: r.floorMaterial,
          },
        });
        break;
      }
      case "electrical": {
        const el = find(data.electrical, s.id);
        if (!el) break;
        items.push({
          kind: "electrical",
          srcId: el.id,
          data: {
            type: el.type,
            position: el.position,
            heightZ: el.heightZ,
            group: el.group,
            label: el.label,
            note: el.note,
          },
        });
        break;
      }
      case "plumbing": {
        const p = find(data.plumbing, s.id);
        if (!p) break;
        items.push({
          kind: "plumbing",
          srcId: p.id,
          data: {
            type: p.type,
            fixture: p.fixture,
            position: p.position,
            path: p.path,
            diameter: p.diameter,
            heightZ: p.heightZ,
            note: p.note,
          },
        });
        break;
      }
      case "hvac": {
        const h = find(data.hvac, s.id);
        if (!h) break;
        items.push({
          kind: "hvac",
          srcId: h.id,
          data: {
            type: h.type,
            position: h.position,
            path: h.path,
            heightZ: h.heightZ,
            note: h.note,
          },
        });
        break;
      }
      case "furniture": {
        const f = find(data.furniture, s.id);
        if (!f) break;
        items.push({
          kind: "furniture",
          srcId: f.id,
          data: {
            kind: f.kind,
            position: f.position,
            rotation: f.rotation,
            width: f.width,
            depth: f.depth,
            color: f.color,
          },
        });
        break;
      }
      case "staircase": {
        const st = find(data.stairs, s.id);
        if (!st) break;
        items.push({
          kind: "staircase",
          srcId: st.id,
          data: {
            kind: st.kind,
            position: st.position,
            width: st.width,
            run: st.run,
            steps: st.steps,
            rotation: st.rotation,
            direction: st.direction,
          },
        });
        break;
      }
      case "column": {
        const col = find(data.columns, s.id);
        if (!col) break;
        items.push({
          kind: "column",
          srcId: col.id,
          data: {
            position: col.position,
            shape: col.shape,
            size: col.size,
            height: col.height,
            material: col.material,
            loadBearing: col.loadBearing,
          },
        });
        break;
      }
      case "beam": {
        const bm = find(data.beams, s.id);
        if (!bm) break;
        items.push({
          kind: "beam",
          srcId: bm.id,
          data: {
            start: bm.start,
            end: bm.end,
            profile: bm.profile,
            height: bm.height,
            width: bm.width,
          },
        });
        break;
      }
      case "dormer": {
        const dm = find(data.dormers, s.id);
        if (!dm) break;
        items.push({
          kind: "dormer",
          srcId: dm.id,
          data: {
            roofId: dm.roofId,
            type: dm.type,
            position: dm.position,
            width: dm.width,
            height: dm.height,
          },
        });
        break;
      }
      case "section": {
        const sec = find(data.sections, s.id);
        if (!sec) break;
        items.push({
          kind: "section",
          srcId: sec.id,
          data: { start: sec.start, end: sec.end, label: sec.label },
        });
        break;
      }
      case "roof":
        // Daken zijn verdieping-gebonden; niet via klembord dupliceren.
        break;
      case "opening":
        // Openingen worden via hun muur meegekopieerd (zie hieronder).
        break;
    }
  }

  // Neem openingen mee die bij een gekopieerde muur horen.
  if (copiedWallIds.size > 0) {
    for (const op of data.openings) {
      if (op.deleted || !copiedWallIds.has(op.wallId)) continue;
      items.push({
        kind: "opening",
        srcId: op.id,
        data: {
          wallId: op.wallId,
          type: op.type,
          width: op.width,
          height: op.height,
          sillHeight: op.sillHeight,
          offset: op.offset,
        },
      });
    }
  }

  return { items };
}

const off = (p: Point, d: Point): Point => ({ x: p.x + d.x, y: p.y + d.y });
const offPts = (pts: Point[], d: Point): Point[] => pts.map((p) => off(p, d));

// Plak het klembord op de gegeven verdieping met een offset. Geeft de
// nieuwe selecties terug (om meteen te selecteren / undo te registreren).
export async function pasteClipboard(
  clip: Clipboard,
  offset: Point,
  levelId: string,
): Promise<{ selections: Selection[]; created: { table: string; id: string }[] }> {
  const selections: Selection[] = [];
  const created: { table: string; id: string }[] = [];
  const wallIdMap = new Map<string, string>(); // oude → nieuwe muur-id

  // Eerst muren (zodat openingen straks herverbonden kunnen worden).
  for (const it of clip.items) {
    if (it.kind !== "wall") continue;
    const d = it.data as unknown as Omit<Wall, "id" | "updatedAt" | "levelId">;
    const w = await create<Wall>("walls", {
      levelId,
      start: off(d.start, offset),
      end: off(d.end, offset),
      thickness: d.thickness,
      height: d.height,
      material: d.material,
      loadBearing: d.loadBearing,
      status: d.status,
    });
    wallIdMap.set(it.srcId, w.id);
    selections.push({ kind: "wall", id: w.id });
    created.push({ table: "walls", id: w.id });
  }

  for (const it of clip.items) {
    switch (it.kind) {
      case "wall":
        break; // al gedaan
      case "opening": {
        const d = it.data as { wallId: string } & Omit<Opening, "id" | "updatedAt" | "wallId">;
        const newWallId = wallIdMap.get(d.wallId);
        if (!newWallId) break; // muur niet meegekopieerd → opening overslaan
        const op = await create<Opening>("openings", {
          wallId: newWallId,
          type: d.type,
          width: d.width,
          height: d.height,
          sillHeight: d.sillHeight,
          offset: d.offset,
        });
        created.push({ table: "openings", id: op.id });
        break;
      }
      case "room": {
        const d = it.data as unknown as Omit<Room, "id" | "updatedAt" | "levelId">;
        const r = await create<Room>("rooms", {
          levelId,
          name: d.name,
          func: d.func,
          polygon: offPts(d.polygon, offset),
          color: d.color,
          wallColor: d.wallColor,
          floorMaterial: d.floorMaterial,
        });
        selections.push({ kind: "room", id: r.id });
        created.push({ table: "rooms", id: r.id });
        break;
      }
      case "electrical": {
        const d = it.data as unknown as Omit<ElectricalItem, "id" | "updatedAt" | "levelId">;
        const el = await create<ElectricalItem>("electrical", {
          levelId,
          type: d.type,
          position: off(d.position, offset),
          heightZ: d.heightZ,
          group: d.group,
          label: d.label,
          note: d.note,
        });
        selections.push({ kind: "electrical", id: el.id });
        created.push({ table: "electrical", id: el.id });
        break;
      }
      case "plumbing": {
        const d = it.data as unknown as Omit<PlumbingItem, "id" | "updatedAt" | "levelId">;
        const p = await create<PlumbingItem>("plumbing", {
          levelId,
          type: d.type,
          fixture: d.fixture,
          position: d.position ? off(d.position, offset) : undefined,
          path: d.path ? offPts(d.path, offset) : undefined,
          diameter: d.diameter,
          heightZ: d.heightZ,
          note: d.note,
        });
        selections.push({ kind: "plumbing", id: p.id });
        created.push({ table: "plumbing", id: p.id });
        break;
      }
      case "hvac": {
        const d = it.data as unknown as Omit<HvacItem, "id" | "updatedAt" | "levelId">;
        const h = await create<HvacItem>("hvac", {
          levelId,
          type: d.type,
          position: d.position ? off(d.position, offset) : undefined,
          path: d.path ? offPts(d.path, offset) : undefined,
          heightZ: d.heightZ,
          note: d.note,
        });
        selections.push({ kind: "hvac", id: h.id });
        created.push({ table: "hvac", id: h.id });
        break;
      }
      case "furniture": {
        const d = it.data as unknown as Omit<Furniture, "id" | "updatedAt" | "levelId">;
        const f = await create<Furniture>("furniture", {
          levelId,
          kind: d.kind,
          position: off(d.position, offset),
          rotation: d.rotation,
          width: d.width,
          depth: d.depth,
          color: d.color,
        });
        selections.push({ kind: "furniture", id: f.id });
        created.push({ table: "furniture", id: f.id });
        break;
      }
      case "staircase": {
        const d = it.data as unknown as Omit<Staircase, "id" | "updatedAt" | "levelId">;
        const st = await create<Staircase>("stairs", {
          levelId,
          kind: d.kind,
          position: off(d.position, offset),
          width: d.width,
          run: d.run,
          steps: d.steps,
          rotation: d.rotation,
          direction: d.direction,
        });
        selections.push({ kind: "staircase", id: st.id });
        created.push({ table: "stairs", id: st.id });
        break;
      }
      case "column": {
        const d = it.data as unknown as Omit<Column, "id" | "updatedAt" | "levelId">;
        const col = await create<Column>("columns", {
          levelId,
          position: off(d.position, offset),
          shape: d.shape,
          size: d.size,
          height: d.height,
          material: d.material,
          loadBearing: d.loadBearing,
        });
        selections.push({ kind: "column", id: col.id });
        created.push({ table: "columns", id: col.id });
        break;
      }
      case "beam": {
        const d = it.data as unknown as Omit<Beam, "id" | "updatedAt" | "levelId">;
        const bm = await create<Beam>("beams", {
          levelId,
          start: off(d.start, offset),
          end: off(d.end, offset),
          profile: d.profile,
          height: d.height,
          width: d.width,
        });
        selections.push({ kind: "beam", id: bm.id });
        created.push({ table: "beams", id: bm.id });
        break;
      }
      case "dormer": {
        const d = it.data as { roofId: string } & Omit<Dormer, "id" | "updatedAt" | "roofId">;
        const dm = await create<Dormer>("dormers", {
          roofId: d.roofId,
          type: d.type,
          position: off(d.position, offset),
          width: d.width,
          height: d.height,
        });
        selections.push({ kind: "dormer", id: dm.id });
        created.push({ table: "dormers", id: dm.id });
        break;
      }
      case "section": {
        const d = it.data as unknown as Omit<SectionLine, "id" | "updatedAt" | "levelId">;
        const sec = await create<SectionLine>("sections", {
          levelId,
          start: off(d.start, offset),
          end: off(d.end, offset),
          label: d.label,
        });
        selections.push({ kind: "section", id: sec.id });
        created.push({ table: "sections", id: sec.id });
        break;
      }
      case "roof":
        break; // niet dupliceerbaar via klembord
    }
  }

  return { selections, created };
}

// Soort → tabelnaam (voor multi-delete e.d.).
export const TABLE_FOR_KIND: Record<SelKind, string> = {
  wall: "walls",
  opening: "openings",
  electrical: "electrical",
  room: "rooms",
  plumbing: "plumbing",
  hvac: "hvac",
  furniture: "furniture",
  staircase: "stairs",
  column: "columns",
  beam: "beams",
  roof: "roofs",
  dormer: "dormers",
  section: "sections",
};
