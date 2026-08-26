"use client";

// Reactieve datahooks bovenop Dexie (live queries). Alles client-side.

import { useDeferredValue, useMemo, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDB } from "./db/db";
import type { Furniture, HvacItem, Staircase, Column, Beam, Roof, Dormer, SectionLine } from "./domain/types";
import { useEditor, type Selection } from "./store/editor";
import { computeTakeoff } from "./takeoff/engine";
import {
  validateElectrical,
  validateLintels,
  validatePipeFall,
  validateRooms,
  validateRoomServices,
  validateWalls,
  type ValidationIssue,
} from "./validation";

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

// Alle ruimtes van het project (over alle verdiepingen) — voor taak↔ruimte-koppeling.
export function useProjectRooms(projectId?: string | null) {
  return useLiveQuery(
    async () => {
      if (!projectId) return [];
      const db = getDB();
      const levels = notDeleted(await db.levels.where("projectId").equals(projectId).toArray());
      const levelIds = new Set(levels.map((l) => l.id));
      const all = notDeleted(await db.rooms.toArray());
      return all.filter((r) => levelIds.has(r.levelId));
    },
    [projectId],
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

// Eindgroepen (meterkast) van het project.
export function useCircuits(projectId?: string | null) {
  return useLiveQuery(
    async () => {
      if (!projectId) return [];
      const rows = notDeleted(
        await getDB().circuits.where("projectId").equals(projectId).toArray(),
      );
      return rows.sort((a, b) =>
        a.number.localeCompare(b.number, "nl", { numeric: true }),
      );
    },
    [projectId],
    [],
  );
}

// Alle elektra van het project (over alle verdiepingen) — nodig omdat een groep
// verdiepingen kan overspannen.
export function useAllElectrical(levelIds: string[]) {
  const key = levelIds.join(",");
  return useLiveQuery(
    async () => {
      if (levelIds.length === 0) return [];
      return notDeleted(await getDB().electrical.where("levelId").anyOf(levelIds).toArray());
    },
    [key],
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

export function useHvac(levelId: string | null) {
  return useLiveQuery(
    async () => {
      if (!levelId) return [];
      const rows = await getDB().hvac.where("levelId").equals(levelId).toArray();
      return rows.filter((h) => !h.deleted);
    },
    [levelId],
    [] as HvacItem[],
  );
}

export function useStairs(levelId?: string | null) {
  return useLiveQuery(
    async () => {
      if (!levelId) return [];
      return notDeleted(await getDB().stairs.where("levelId").equals(levelId).toArray());
    },
    [levelId],
    [] as Staircase[],
  );
}

export function useColumns(levelId?: string | null) {
  return useLiveQuery(
    async () => {
      if (!levelId) return [];
      return notDeleted(await getDB().columns.where("levelId").equals(levelId).toArray());
    },
    [levelId],
    [] as Column[],
  );
}

export function useBeams(levelId?: string | null) {
  return useLiveQuery(
    async () => {
      if (!levelId) return [];
      return notDeleted(await getDB().beams.where("levelId").equals(levelId).toArray());
    },
    [levelId],
    [] as Beam[],
  );
}

export function useRoofs(levelId?: string | null) {
  return useLiveQuery(
    async () => {
      if (!levelId) return [];
      return notDeleted(await getDB().roofs.where("levelId").equals(levelId).toArray());
    },
    [levelId],
    [] as Roof[],
  );
}

export function useSections(levelId?: string | null) {
  return useLiveQuery(
    async () => {
      if (!levelId) return [];
      return notDeleted(await getDB().sections.where("levelId").equals(levelId).toArray());
    },
    [levelId],
    [] as SectionLine[],
  );
}

export function useDormers(roofIds: string[]) {
  const key = roofIds.join(",");
  return useLiveQuery(
    async () => {
      if (roofIds.length === 0) return [];
      const all = notDeleted(await getDB().dormers.toArray());
      const set = new Set(roofIds);
      return all.filter((d) => set.has(d.roofId));
    },
    [key],
    [] as Dormer[],
  );
}

// ── Weergave ─────────────────────────────────────────────────────────────────

/**
 * True vanaf de lg-breakpoint (1024px). Alleen gebruiken waar het *gedrag*
 * verschilt — een gedockt paneel versus een bottom-sheet. Puur visuele
 * verschillen horen via Tailwind-breakpoints, niet hierlangs, zodat er geen
 * hydration-mismatch of layout-sprong ontstaat.
 */
export function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => desktopQuery?.matches ?? false,
    // Server/eerste render: mobiel-first, zoals de app altijd al was.
    () => false,
  );
}

const desktopQuery =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(min-width: 1024px)")
    : null;

function subscribeDesktop(onChange: () => void) {
  desktopQuery?.addEventListener("change", onChange);
  return () => desktopQuery?.removeEventListener("change", onChange);
}

// ── Afgeleide werkruimte-data ────────────────────────────────────────────────
// Deze hooks bundelen wat eerder in losse schermen werd herhaald, zodat de
// inspector, de statusbalk en het kostenscherm gegarandeerd hetzelfde tonen.

/** De verdieping waar de editor op staat, met terugval op de eerste. */
export function useActiveLevel() {
  const project = useProject();
  const levels = useLevels(project?.id) ?? [];
  const activeLevelId = useEditor((s) => s.activeLevelId);
  return levels.find((l) => l.id === activeLevelId) ?? levels[0] ?? null;
}

/**
 * Inkoopstaat + kosten van de actieve verdieping, via dezelfde engine als het
 * kostenscherm — één berekening, zodat de werkruimte en /kosten nooit
 * verschillende bedragen tonen.
 */
export function useTakeoff() {
  const project = useProject();
  const level = useActiveLevel();
  const walls = useWalls(level?.id) ?? [];
  const rooms = useRooms(level?.id) ?? [];
  const openings = useOpenings(level?.id) ?? [];
  const plumbing = usePlumbing(level?.id) ?? [];
  const beams = useBeams(level?.id) ?? [];
  const levelIds = useMemo(() => (level ? [level.id] : []), [level]);
  const electrical = useAllElectrical(levelIds) ?? [];
  const circuits = useCircuits(project?.id) ?? [];

  // Deferred, net als de compliance-controle: tijdens slepen mag de raming een
  // tel achterlopen zolang het canvas maar vloeiend blijft.
  const dWalls = useDeferredValue(walls);
  const dRooms = useDeferredValue(rooms);
  const dOpenings = useDeferredValue(openings);
  const dPlumbing = useDeferredValue(plumbing);
  const dElectrical = useDeferredValue(electrical);
  const dBeams = useDeferredValue(beams);

  const lines = useMemo(() => {
    if (!level) return [];
    return computeTakeoff({
      levels: [level],
      walls: dWalls,
      rooms: dRooms,
      openings: dOpenings,
      plumbing: dPlumbing,
      electrical: dElectrical,
      circuits,
      beams: dBeams,
    });
  }, [level, dWalls, dRooms, dOpenings, dPlumbing, dElectrical, circuits, dBeams]);

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + (l.totalPrice ?? 0), 0),
    [lines],
  );

  /** Posten zonder richtprijs — expliciet tonen, anders lijkt het totaal compleet. */
  const unpriced = useMemo(() => lines.filter((l) => l.totalPrice == null).length, [lines]);

  return { level, lines, total, unpriced };
}

/** Alle NEN/Bouwbesluit-meldingen van de actieve verdieping. */
export function useIssues() {
  const level = useActiveLevel();
  const rooms = useRooms(level?.id) ?? [];
  const electrical = useElectrical(level?.id) ?? [];
  const walls = useWalls(level?.id) ?? [];
  const openings = useOpenings(level?.id) ?? [];
  const plumbing = usePlumbing(level?.id) ?? [];
  const hvac = useHvac(level?.id ?? null) ?? [];

  const dOpenings = useDeferredValue(openings);
  const dWalls = useDeferredValue(walls);
  const dElectrical = useDeferredValue(electrical);
  const dRooms = useDeferredValue(rooms);
  const dPlumbing = useDeferredValue(plumbing);
  const dHvac = useDeferredValue(hvac);

  const issues = useMemo<ValidationIssue[]>(() => {
    if (!level) return [];
    return [
      ...validateWalls(dWalls),
      ...validateElectrical(dElectrical),
      ...validateRooms(dRooms, [level]),
      ...validateRoomServices(dRooms, dPlumbing, dElectrical, dHvac),
      ...validatePipeFall(dPlumbing),
      ...validateLintels(dWalls, dOpenings),
    ];
  }, [dWalls, dOpenings, dElectrical, dRooms, dPlumbing, dHvac, level]);

  /**
   * Zoekt op bij welk soort element een melding hoort. ValidationIssue kent
   * alleen een entityId, dus het type leiden we af uit de al geladen lijsten —
   * dat is goedkoper dan alle tabellen bevragen.
   */
  const resolveSelection = useMemo(() => {
    const index = new Map<string, Selection>();
    for (const w of dWalls) index.set(w.id, { kind: "wall", id: w.id });
    for (const r of dRooms) index.set(r.id, { kind: "room", id: r.id });
    for (const e of dElectrical) index.set(e.id, { kind: "electrical", id: e.id });
    for (const p of dPlumbing) index.set(p.id, { kind: "plumbing", id: p.id });
    for (const h of dHvac) index.set(h.id, { kind: "hvac", id: h.id });
    return (entityId?: string) => (entityId ? index.get(entityId) ?? null : null);
  }, [dWalls, dRooms, dElectrical, dPlumbing, dHvac]);

  const counts = useMemo(
    () => ({
      error: issues.filter((i) => i.severity === "error").length,
      warn: issues.filter((i) => i.severity === "warn").length,
      info: issues.filter((i) => i.severity === "info").length,
    }),
    [issues],
  );

  return { issues, counts, resolveSelection };
}
