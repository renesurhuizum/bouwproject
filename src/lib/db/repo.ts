// CRUD-helpers bovenop Dexie. Stempelen automatisch `updatedAt` en gebruiken
// soft-delete (deleted: true) zodat sync later weet wat verwijderd is.

import { v4 as uuid } from "uuid";
import type { Table as DexieTable } from "dexie";
import { getDB } from "./db";
import type { Entity } from "../domain/types";

export type TableName =
  | "projects"
  | "levels"
  | "walls"
  | "openings"
  | "rooms"
  | "electrical"
  | "plumbing"
  | "hvac"
  | "phases"
  | "tasks"
  | "budget"
  | "expenses"
  | "materials"
  | "photos"
  | "furniture"
  | "stairs"
  | "columns"
  | "beams";

// Eén generieke tabel-handle; we casten naar Entity zodat dynamische tabelkeuze
// typeveilig blijft zonder per-tabel overloads.
function table(name: TableName): DexieTable<Entity, string> {
  return getDB()[name] as unknown as DexieTable<Entity, string>;
}

export function newId(): string {
  return uuid();
}

// Maak een entiteit aan: vult id + updatedAt aan.
export async function create<T extends Entity>(
  name: TableName,
  data: Omit<T, "id" | "updatedAt"> & { id?: string },
): Promise<T> {
  const entity = {
    ...data,
    id: data.id ?? uuid(),
    updatedAt: Date.now(),
  } as T;
  await table(name).put(entity);
  return entity;
}

// Werk velden bij; ververst updatedAt. Patch mag de velden van de gekozen
// entiteit bevatten (dynamische tabelkeuze, dus losjes getypeerd).
export async function update<T extends Entity = Entity>(
  name: TableName,
  id: string,
  patch: Partial<T> | Record<string, unknown>,
): Promise<void> {
  await table(name).update(id, { ...patch, updatedAt: Date.now() } as Partial<Entity>);
}

// Soft-delete.
export async function remove(name: TableName, id: string): Promise<void> {
  await table(name).update(id, { deleted: true, updatedAt: Date.now() });
}

// Hard-delete (alleen voor opruimen/lokaal).
export async function hardRemove(name: TableName, id: string): Promise<void> {
  await table(name).delete(id);
}
