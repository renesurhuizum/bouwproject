// Schrijft een IFC-importresultaat weg in de lokale database.
// Bouwlagen worden op peil gekoppeld aan bestaande verdiepingen (±30 cm);
// ontbrekende lagen worden aangemaakt.

import type { BouwDB } from "../db/db";
import type { Beam, Column, Level, Opening, Room, Wall, WallStatus } from "../domain/types";
import { newId } from "../db/repo";
import type { ImportResult } from "./importIfc";

export interface ApplyOptions {
  projectId: string;
  /** Status voor muren waarvan het IFC-bestand geen status meegeeft. */
  defaultStatus: WallStatus;
  /** Bestaande muren/kozijnen/ruimtes/kolommen/balken op de doel-lagen eerst verwijderen. */
  replaceExisting: boolean;
}

export interface LevelMapping {
  importIndex: number;
  existing?: Level;
  newName: string;
}

export function mapLevels(result: ImportResult, existing: Level[]): LevelMapping[] {
  const used = new Set<string>();
  return result.levels.map((il, i) => {
    const match = existing
      .filter((l) => !used.has(l.id))
      .map((l) => ({ l, d: Math.abs(l.elevation - il.elevation) }))
      .filter((x) => x.d <= 0.3)
      .sort((a, b) => a.d - b.d)[0]?.l;
    if (match) used.add(match.id);
    return { importIndex: i, existing: match, newName: il.name };
  });
}

export async function applyImport(db: BouwDB, result: ImportResult, existing: Level[], opts: ApplyOptions) {
  const now = Date.now();
  const mapping = mapLevels(result, existing);
  const counts = { levels: 0, walls: 0, openings: 0, rooms: 0, columns: 0, beams: 0, removed: 0 };
  let nextOrder = Math.max(0, ...existing.map((l) => l.order)) + 1;

  await db.transaction("rw", [db.levels, db.walls, db.openings, db.rooms, db.columns, db.beams], async () => {
    for (const m of mapping) {
      const il = result.levels[m.importIndex];
      let levelId = m.existing?.id;
      if (!levelId) {
        levelId = newId();
        await db.levels.add({
          id: levelId,
          updatedAt: now,
          projectId: opts.projectId,
          name: il.name,
          elevation: il.elevation,
          height: il.height,
          order: nextOrder++,
        });
        counts.levels++;
      } else if (opts.replaceExisting) {
        // Soft-delete zodat sync/undo later weet wat er weg is.
        const oldWalls = (await db.walls.where("levelId").equals(levelId).toArray()).filter((w) => !w.deleted);
        const oldWallIds = new Set(oldWalls.map((w) => w.id));
        const del = { deleted: true, updatedAt: now };
        for (const w of oldWalls) await db.walls.update(w.id, del);
        for (const o of await db.openings.toArray()) if (oldWallIds.has(o.wallId) && !o.deleted) await db.openings.update(o.id, del);
        for (const t of [db.rooms, db.columns, db.beams] as const) {
          const rows = (await (t as typeof db.rooms).where("levelId").equals(levelId).toArray()).filter((r) => !r.deleted);
          for (const r of rows) await (t as typeof db.rooms).update(r.id, del);
          counts.removed += rows.length;
        }
        counts.removed += oldWalls.length;
      }

      const wallIdByIfc = new Map<number, string>();
      const walls: Wall[] = il.walls.map((w) => {
        const id = newId();
        wallIdByIfc.set(w.ifcId, id);
        return {
          id,
          updatedAt: now,
          levelId: levelId!,
          start: w.start,
          end: w.end,
          thickness: w.thickness,
          height: w.height,
          material: w.material,
          loadBearing: w.loadBearing,
          status: w.status ?? opts.defaultStatus,
          ...(w.isExternal != null ? { isExternal: w.isExternal } : {}),
        };
      });
      const openings: Opening[] = il.openings
        .filter((o) => wallIdByIfc.has(o.wallIfcId))
        .map((o) => ({
          id: newId(),
          updatedAt: now,
          wallId: wallIdByIfc.get(o.wallIfcId)!,
          type: o.type,
          width: o.width,
          height: o.height,
          sillHeight: o.sillHeight,
          offset: o.offset,
        }));
      const rooms: Room[] = il.rooms.map((r) => ({
        id: newId(),
        updatedAt: now,
        levelId: levelId!,
        name: r.name,
        func: r.func,
        polygon: r.polygon,
      }));
      const columns: Column[] = il.columns.map((c) => ({
        id: newId(),
        updatedAt: now,
        levelId: levelId!,
        position: c.position,
        shape: c.shape,
        size: c.size,
        height: c.height,
        material: "concrete",
        loadBearing: true,
      }));
      const beams: Beam[] = il.beams.map((b) => ({
        id: newId(),
        updatedAt: now,
        levelId: levelId!,
        start: b.start,
        end: b.end,
        profile: b.profile,
        height: b.height,
        ...(b.width ? { width: b.width } : {}),
      }));
      await db.walls.bulkAdd(walls);
      await db.openings.bulkAdd(openings);
      await db.rooms.bulkAdd(rooms);
      await db.columns.bulkAdd(columns);
      await db.beams.bulkAdd(beams);
      counts.walls += walls.length;
      counts.openings += openings.length;
      counts.rooms += rooms.length;
      counts.columns += columns.length;
      counts.beams += beams.length;
    }
  });
  return counts;
}
