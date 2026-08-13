// IndexedDB via Dexie. Offline-first: dit is de bron van waarheid op het apparaat.
// Indexen op `updatedAt` en `deleted` maken latere cloud-sync (last-write-wins)
// eenvoudig.

import Dexie, { type Table } from "dexie";
import { CIRCUIT_PALETTE } from "../domain/constants";
import type {
  Project,
  Level,
  Wall,
  Opening,
  Room,
  ElectricalItem,
  ElectricalCircuit,
  PlumbingItem,
  HvacItem,
  Phase,
  TaskItem,
  BudgetLine,
  Expense,
  MaterialItem,
  Photo,
  Furniture,
  Staircase,
  Column,
  Beam,
  Roof,
  Dormer,
  SectionLine,
} from "../domain/types";

export class BouwDB extends Dexie {
  projects!: Table<Project, string>;
  levels!: Table<Level, string>;
  walls!: Table<Wall, string>;
  openings!: Table<Opening, string>;
  rooms!: Table<Room, string>;
  electrical!: Table<ElectricalItem, string>;
  circuits!: Table<ElectricalCircuit, string>;
  plumbing!: Table<PlumbingItem, string>;
  hvac!: Table<HvacItem, string>;
  phases!: Table<Phase, string>;
  tasks!: Table<TaskItem, string>;
  budget!: Table<BudgetLine, string>;
  expenses!: Table<Expense, string>;
  materials!: Table<MaterialItem, string>;
  photos!: Table<Photo, string>;
  furniture!: Table<Furniture, string>;
  stairs!: Table<Staircase, string>;
  columns!: Table<Column, string>;
  beams!: Table<Beam, string>;
  roofs!: Table<Roof, string>;
  dormers!: Table<Dormer, string>;
  sections!: Table<SectionLine, string>;

  constructor() {
    super("bouwproject");
    this.version(2).stores({
      projects: "id, updatedAt, deleted",
      levels: "id, projectId, order, updatedAt, deleted",
      walls: "id, levelId, updatedAt, deleted",
      openings: "id, wallId, updatedAt, deleted",
      rooms: "id, levelId, updatedAt, deleted",
      electrical: "id, levelId, type, updatedAt, deleted",
      plumbing: "id, levelId, type, updatedAt, deleted",
      hvac: "id, levelId, type, updatedAt, deleted",
      phases: "id, projectId, order, updatedAt, deleted",
      tasks: "id, projectId, phaseId, updatedAt, deleted",
      budget: "id, projectId, phaseId, updatedAt, deleted",
      expenses: "id, projectId, phaseId, date, updatedAt, deleted",
      materials: "id, projectId, status, updatedAt, deleted",
      photos: "id, projectId, updatedAt, deleted",
      furniture: "id, levelId, updatedAt, deleted",
    });
    // v3: bouwkundige elementen (trappen, kolommen, stalen balken).
    this.version(3).stores({
      stairs: "id, levelId, updatedAt, deleted",
      columns: "id, levelId, updatedAt, deleted",
      beams: "id, levelId, updatedAt, deleted",
    });
    // v4: dak + dakkapellen.
    this.version(4).stores({
      roofs: "id, levelId, updatedAt, deleted",
      dormers: "id, roofId, updatedAt, deleted",
    });
    // v5: doorsnedelijnen.
    this.version(5).stores({
      sections: "id, levelId, updatedAt, deleted",
    });
    // v6: eindgroepen (meterkast). Bestaande items droegen alleen een vrij
    // tekstveld `group`; die tekst wordt omgezet naar echte groepen zodat er
    // kabelspecificaties en -lengtes aan te hangen zijn.
    this.version(6)
      .stores({ circuits: "id, projectId, updatedAt, deleted" })
      .upgrade(async (tx) => {
        const project = await tx.table("projects").toCollection().first();
        if (!project) return;
        const items = await tx.table("electrical").toArray();
        const names = [
          ...new Set(
            items
              .filter((i) => !i.deleted && typeof i.group === "string" && i.group.trim())
              .map((i) => (i.group as string).trim()),
          ),
        ].sort();
        const idByName = new Map<string, string>();
        for (const [i, name] of names.entries()) {
          const id = crypto.randomUUID();
          idByName.set(name, id);
          await tx.table("circuits").add({
            id,
            projectId: project.id,
            number: name,
            name: `Groep ${name}`,
            breaker: "B16",
            cableSpec: "3×2,5 mm²",
            color: CIRCUIT_PALETTE[i % CIRCUIT_PALETTE.length],
            routeAt: "ceiling",
            updatedAt: Date.now(),
          });
        }
        for (const item of items) {
          const name = typeof item.group === "string" ? item.group.trim() : "";
          const circuitId = idByName.get(name);
          if (circuitId) {
            await tx.table("electrical").update(item.id, { circuitId });
          }
        }
      });
    // v7: foto's zijn altijd al aan een ruimte gehangen, maar `roomId` stond
    // niet in de index — het selecteren van een ruimte liep daardoor stuk op
    // "KeyPath roomId on object store photos is not indexed".
    this.version(7).stores({
      photos: "id, projectId, roomId, updatedAt, deleted",
    });
  }
}

// Singleton, alleen in de browser.
let _db: BouwDB | null = null;
export function getDB(): BouwDB {
  if (typeof window === "undefined") {
    throw new Error("getDB() mag alleen in de browser worden aangeroepen");
  }
  if (!_db) _db = new BouwDB();
  return _db;
}

// Gooit de database weg en begint schoon. Alleen bedoeld voor tests — in de app
// is de lokale database de bron van waarheid en mag niets hem zomaar wissen.
export async function resetDB(): Promise<void> {
  if (_db) {
    _db.close();
    await _db.delete();
    _db = null;
  }
  getDB();
}
