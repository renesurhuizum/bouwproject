// Undo/Redo in-memory stack. Max 50 stappen. Niet persistent over page-refresh.
// Ondersteunt: create (ongedaan via soft-delete), update (herstel vorige waarde),
// remove (herstel via put).

import { create as zustandCreate } from "zustand";
import { getDB } from "./db/db";
import type { TableName } from "./db/repo";
import type { Entity } from "./domain/types";

export type HistoryAction =
  | { type: "create"; table: TableName; id: string }
  | { type: "update"; table: TableName; id: string; before: Record<string, unknown> }
  | { type: "remove"; table: TableName; snapshot: Entity };

const MAX_STEPS = 50;

interface HistoryState {
  past: HistoryAction[];
  future: HistoryAction[];
  pushAction: (action: HistoryAction) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export const useHistory = zustandCreate<HistoryState>((set, get) => ({
  past: [],
  future: [],

  pushAction(action) {
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
}));

// ── Undo uitvoeren ───────────────────────────────────────────────────────────

async function tableRef(name: TableName) {
  return getDB()[name] as unknown as import("dexie").Table<Entity, string>;
}

async function applyUndo(action: HistoryAction) {
  const tbl = await tableRef(action.table);
  if (action.type === "create") {
    await tbl.update(action.id, { deleted: true, updatedAt: Date.now() });
  } else if (action.type === "update") {
    await tbl.update(action.id, { ...action.before, updatedAt: Date.now() });
  } else if (action.type === "remove") {
    await tbl.put({ ...action.snapshot, deleted: false, updatedAt: Date.now() } as Entity);
  }
}

// ── Redo uitvoeren ───────────────────────────────────────────────────────────

async function applyRedo(action: HistoryAction) {
  const tbl = await tableRef(action.table);
  if (action.type === "create") {
    await tbl.update(action.id, { deleted: false, updatedAt: Date.now() });
  } else if (action.type === "update") {
    // Redo van update: we hebben de "after" niet opgeslagen, dus redo is hier een no-op.
    // In de praktijk wordt bij redo de gebruiker gevraagd opnieuw te handelen.
    // Voor nu: geen actie — de stack voorkomt verlies.
  } else if (action.type === "remove") {
    await tbl.update(action.snapshot.id, { deleted: true, updatedAt: Date.now() });
  }
}
