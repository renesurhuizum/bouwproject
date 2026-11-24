// Undo/Redo in-memory stack. Max 50 stappen. Niet persistent over page-refresh.
// Ondersteunt: create (ongedaan via soft-delete), update (before → after),
// remove (herstel via put) en batch (meerdere mutaties als één stap).
//
// Schrijf niet rechtstreeks via repo.ts als een actie ongedaan moet kunnen:
// gebruik src/lib/db/mutate.ts, dat deze acties automatisch vastlegt.

import { create as zustandCreate } from "zustand";
import { getDB } from "./db/db";
import type { TableName } from "./db/repo";
import type { Entity } from "./domain/types";

export type HistoryAction =
  | { type: "create"; table: TableName; id: string }
  | {
      type: "update";
      table: TableName;
      id: string;
      before: Record<string, unknown>;
      after: Record<string, unknown>;
    }
  | { type: "remove"; table: TableName; snapshot: Entity }
  | { type: "batch"; actions: HistoryAction[] };

const MAX_STEPS = 50;

interface HistoryState {
  past: HistoryAction[];
  future: HistoryAction[];
  pushAction: (action: HistoryAction) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clear: () => void;
}

export const useHistory = zustandCreate<HistoryState>((set, get) => ({
  past: [],
  future: [],

  pushAction(action) {
    // Een lege batch is geen stap — anders kost een mislukte bewerking een Ctrl+Z.
    if (action.type === "batch" && action.actions.length === 0) return;
    set((s) => ({
      past: [...s.past.slice(-(MAX_STEPS - 1)), action],
      future: [],
    }));
  },

  async undo() {
    const { past } = get();
    if (past.length === 0) return;
    const action = past[past.length - 1];
    set((s) => ({ past: s.past.slice(0, -1), future: [action, ...s.future] }));
    await applyUndo(action);
  },

  async redo() {
    const { future } = get();
    if (future.length === 0) return;
    const action = future[0];
    set((s) => ({ future: s.future.slice(1), past: [...s.past, action] }));
    await applyRedo(action);
  },

  clear() {
    set({ past: [], future: [] });
  },
}));

// ── Undo uitvoeren ───────────────────────────────────────────────────────────

function tableRef(name: TableName) {
  return getDB()[name] as unknown as import("dexie").Table<Entity, string>;
}

export async function applyUndo(action: HistoryAction): Promise<void> {
  if (action.type === "batch") {
    // Omgekeerde volgorde: de laatste mutatie moet als eerste terug.
    for (const a of [...action.actions].reverse()) await applyUndo(a);
    return;
  }
  const tbl = tableRef(action.table);
  if (action.type === "create") {
    await tbl.update(action.id, { deleted: true, updatedAt: Date.now() });
  } else if (action.type === "update") {
    await tbl.update(action.id, { ...action.before, updatedAt: Date.now() });
  } else if (action.type === "remove") {
    await tbl.put({ ...action.snapshot, deleted: false, updatedAt: Date.now() } as Entity);
  }
}

// ── Redo uitvoeren ───────────────────────────────────────────────────────────

export async function applyRedo(action: HistoryAction): Promise<void> {
  if (action.type === "batch") {
    for (const a of action.actions) await applyRedo(a);
    return;
  }
  const tbl = tableRef(action.table);
  if (action.type === "create") {
    await tbl.update(action.id, { deleted: false, updatedAt: Date.now() });
  } else if (action.type === "update") {
    await tbl.update(action.id, { ...action.after, updatedAt: Date.now() });
  } else if (action.type === "remove") {
    await tbl.update(action.snapshot.id, { deleted: true, updatedAt: Date.now() });
  }
}
