"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDB } from "@/lib/db/db";
import { create } from "@/lib/db/repo";
import { useEditor } from "@/lib/store/editor";
import { useProject } from "@/lib/hooks";
import type { Level, Wall, Room } from "@/lib/domain/types";

export function LevelSwitcher() {
  const project = useProject();
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const setActiveLevel = useEditor((s) => s.setActiveLevel);
  const [adding, setAdding] = useState(false);

  const levels = useLiveQuery(
    async () => {
      if (!project?.id) return [];
      const rows = await getDB().levels.where("projectId").equals(project.id).sortBy("order");
      return rows.filter((l) => !l.deleted);
    },
    [project?.id],
    [] as Level[],
  );

  if (!levels || levels.length === 0) return null;

  async function addLevel() {
    if (!project?.id || adding) return;
    setAdding(true);
    try {
      const maxOrder = levels.reduce((m, l) => Math.max(m, l.order), 0);
      const name = `Verdieping ${maxOrder}`;
      const elevation = levels[levels.length - 1]
        ? levels[levels.length - 1].elevation + levels[levels.length - 1].height + 0.3
        : 2.8;
      const newLevel = await create<Level>("levels", {
        projectId: project.id,
        name,
        elevation,
        height: 2.5,
        order: maxOrder + 1,
      });
      setActiveLevel(newLevel.id);
    } finally {
      setAdding(false);
    }
  }

  async function copyWallsFromGround(targetLevelId: string) {
    const groundLevel = levels.find((l) => l.order === 1);
    if (!groundLevel) return;
    const db = getDB();
    const sourceWalls = (await db.walls.where("levelId").equals(groundLevel.id).toArray()).filter(
      (w) => !w.deleted,
    );
    for (const w of sourceWalls) {
      await create<Wall>("walls", {
        levelId: targetLevelId,
        start: w.start,
        end: w.end,
        thickness: w.thickness,
        height: w.height,
        material: w.material,
        loadBearing: w.loadBearing,
        status: w.status,
      });
    }
    const sourceRooms = (await db.rooms.where("levelId").equals(groundLevel.id).toArray()).filter(
      (r) => !r.deleted,
    );
    for (const r of sourceRooms) {
      await create<Room>("rooms", {
        levelId: targetLevelId,
        name: r.name,
        func: r.func,
        polygon: r.polygon,
        color: r.color,
      });
    }
  }

  const activeIsNew =
    activeLevelId !== null && levels.find((l) => l.id === activeLevelId)?.order !== 1;

  return (
    <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-xl border border-line bg-paper-raised/95 p-1 shadow-lg backdrop-blur">
        {levels.map((level) => (
          <button
            key={level.id}
            onClick={() => setActiveLevel(level.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              level.id === activeLevelId
                ? "bg-accent text-white shadow-sm"
                : "text-ink-600 hover:bg-paper-sunken"
            }`}
          >
            {level.name}
          </button>
        ))}

        <button
          onClick={() => void addLevel()}
          disabled={adding}
          title="Verdieping toevoegen"
          className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-paper-sunken hover:text-ink-700 disabled:opacity-40"
        >
          <Plus size={14} />
        </button>
      </div>

      {activeIsNew && activeLevelId && (
        <div className="mt-1.5 flex justify-center">
          <button
            onClick={() => void copyWallsFromGround(activeLevelId)}
            className="rounded-lg border border-dashed border-line bg-paper-raised/90 px-3 py-1 text-[11px] text-ink-500 shadow backdrop-blur hover:text-ink-700"
          >
            Kopieer muren van BG
          </button>
        </div>
      )}
    </div>
  );
}
