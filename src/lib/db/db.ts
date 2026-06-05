// IndexedDB via Dexie. Offline-first: dit is de bron van waarheid op het apparaat.
// Indexen op `updatedAt` en `deleted` maken latere cloud-sync (last-write-wins)
// eenvoudig.

import Dexie, { type Table } from "dexie";
import type {
  Project,
  Level,
  Wall,
  Opening,
  Room,
  ElectricalItem,
  PlumbingItem,
  HvacItem,
  Phase,
  TaskItem,
  BudgetLine,
  Expense,
  MaterialItem,
  Photo,
} from "../domain/types";

export class BouwDB extends Dexie {
  projects!: Table<Project, string>;
  levels!: Table<Level, string>;
  walls!: Table<Wall, string>;
  openings!: Table<Opening, string>;
  rooms!: Table<Room, string>;
  electrical!: Table<ElectricalItem, string>;
  plumbing!: Table<PlumbingItem, string>;
  hvac!: Table<HvacItem, string>;
  phases!: Table<Phase, string>;
  tasks!: Table<TaskItem, string>;
  budget!: Table<BudgetLine, string>;
  expenses!: Table<Expense, string>;
  materials!: Table<MaterialItem, string>;
  photos!: Table<Photo, string>;

  constructor() {
    super("bouwproject");
    this.version(1).stores({
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
