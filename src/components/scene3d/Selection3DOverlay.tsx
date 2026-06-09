"use client";

import { X, RotateCw, Trash2 } from "lucide-react";
import { use3DEdit } from "./use3DEdit";
import { update, remove } from "@/lib/db/repo";
import { getDB } from "@/lib/db/db";

export function Selection3DOverlay() {
  const { selectedItem, clearSelection } = use3DEdit();
  if (!selectedItem) return null;

  const left = Math.min(selectedItem.screenX + 12, window.innerWidth - 200);
  const top = Math.max(selectedItem.screenY - 60, 8);

  return (
    <div
      className="pointer-events-auto absolute z-20 rounded-xl border border-line bg-paper-raised/95 p-3 shadow-xl backdrop-blur"
      style={{ left, top, minWidth: 160 }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-ink-700">{selectedItem.label}</span>
        <button onClick={clearSelection} className="text-ink-400 hover:text-ink-700">
          <X size={12} />
        </button>
      </div>
      <div className="flex gap-1.5">
        {selectedItem.kind === "furniture" && (
          <button
            onClick={async () => {
              const item = await getDB().furniture.get(selectedItem.id);
              if (item) await update("furniture", selectedItem.id, { rotation: (item.rotation + 90) % 360 });
            }}
            className="flex items-center gap-1 rounded-lg bg-paper-sunken px-2 py-1 text-[11px] text-ink-600 hover:bg-paper-raised"
          >
            <RotateCw size={11} /> 90°
          </button>
        )}
        <button
          onClick={async () => {
            await remove(selectedItem.kind === "furniture" ? "furniture" : "electrical", selectedItem.id);
            clearSelection();
          }}
          className="flex items-center gap-1 rounded-lg bg-danger/10 px-2 py-1 text-[11px] text-danger hover:bg-danger/20"
        >
          <Trash2 size={11} /> Wis
        </button>
      </div>
    </div>
  );
}
