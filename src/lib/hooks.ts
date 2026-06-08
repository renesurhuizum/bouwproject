"use client";

// Reactieve datahooks bovenop Dexie (live queries). Alles client-side.

import { useLiveQuery } from "dexie-react-hooks";
import { getDB } from "./db/db";
import type { Furniture } from "./domain/types";

function notDeleted<T extends { deleted?: boolean }>(rows: T[] | undefined): T[] {
  return (rows ?? []).filter((r) => !r.deleted);
}

export function useProject() {
  return useLiveQuery(async () =>
    (await getDB().projects.toArray()).find((p) => !p.deleted) ?? null,
  );
}

export function useLevels(projectId?: string | null) {
  return useLiveQuery(
    async () => {
      if (!projectId) return [];
      const rows = await getDB().levels.where("projectId").equals(projectId).sortBy("order");
      return notDeleted(rows);
    },
    [projectId],
    [],
  );
}

export function useWalls(levelId?: string | null) {
  return useLiveQuery(
    async () => {
      if (!levelId) return [];
      return notDeleted(await getDB().walls.where("levelId").equals(levelId).toArray());
    },
    [levelId],
    [],
  );
}

export function useOpenings(levelId?: string | null) {
  return useLiveQuery(
    async () => {
      if (!levelId) return [];
      const db = getDB();
      const walls = notDeleted(await db.walls.where("levelId").equals(levelId).toArray());
      const wallIds = new Set(walls.map((w) => w.id));
      const all = notDeleted(await db.openings.toArray());
      return all.filter((o) => wallIds.has(o.wallId));
    },
    [levelId],
    [],
  );
}

export function useRooms(levelId?: string | null) {
  return useLiveQuery(
    async () => {
      if (!levelId) return [];
      return notDeleted(await getDB().rooms.where("levelId").equals(levelId).toArray());
    },
    [levelId],
    [],
  );
}

export function useElectrical(levelId?: string | null) {
  return useLiveQuery(
    async () => {
      if (!levelId) return [];
      return notDeleted(await getDB().electrical.where("levelId").equals(levelId).toArray());
    },
    [levelId],
    [],
  );
}

export function usePlumbing(levelId?: string | null) {
  return useLiveQuery(
    async () => {
      if (!levelId) return [];
      return notDeleted(await getDB().plumbing.where("levelId").equals(levelId).toArray());
    },
    [levelId],
    [],
  );
}

export function usePhases(projectId?: string | null) {
  return useLiveQuery(
    async () => {
      if (!projectId) return [];
      const rows = await getDB().phases.where("projectId").equals(projectId).sortBy("order");
      return notDeleted(rows);
    },
    [projectId],
    [],
  );
}

export function useTasks(projectId?: string | null) {
  return useLiveQuery(
    async () => {
      if (!projectId) return [];
      return notDeleted(await getDB().tasks.where("projectId").equals(projectId).toArray());
    },
    [projectId],
    [],
  );
}

export function useExpenses(projectId?: string | null) {
  return useLiveQuery(
    async () => {
      if (!projectId) return [];
      const rows = await getDB().expenses.where("projectId").equals(projectId).reverse().sortBy("date");
      return notDeleted(rows);
    },
    [projectId],
    [],
  );
}

export function useBudget(projectId?: string | null) {
  return useLiveQuery(
    async () => {
      if (!projectId) return [];
      return notDeleted(await getDB().budget.where("projectId").equals(projectId).toArray());
    },
    [projectId],
    [],
  );
}

export function useMaterials(projectId?: string | null) {
  return useLiveQuery(
    async () => {
      if (!projectId) return [];
      return notDeleted(await getDB().materials.where("projectId").equals(projectId).toArray());
    },
    [projectId],
    [],
  );
}

export function useFurniture(levelId: string | null) {
  return useLiveQuery(
    async () => {
      if (!levelId) return [];
      const rows = await getDB().furniture.where("levelId").equals(levelId).toArray();
      return rows.filter((f) => !f.deleted);
    },
    [levelId],
    [] as Furniture[],
  );
}
