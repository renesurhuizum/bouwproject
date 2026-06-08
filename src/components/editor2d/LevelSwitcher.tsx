"use client";

import { useRef, useState } from "react";
import { Image, Plus, Trash2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDB } from "@/lib/db/db";
import { create, update } from "@/lib/db/repo";
import { useEditor } from "@/lib/store/editor";
import { useProject } from "@/lib/hooks";
import type { Level, Wall, Room } from "@/lib/domain/types";

export function LevelSwitcher() {
  const project = useProject();
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const setActiveLevel = useEditor((s) => s.setActiveLevel);
  const [adding, setAdding] = useState(false);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const activeLevel = useLiveQuery(
    async () => (activeLevelId ? getDB().levels.get(activeLevelId) : null),
    [activeLevelId],
  );

  async function uploadBgImage(file: File) {
    if (!activeLevelId) return;
    await update("levels", activeLevelId, { bgImageBlob: file, bgImageOpacity: 0.4, bgImageScale: 0.02 });
  }

  async function removeBgImage() {
    if (!activeLevelId) return;
    await update("levels", activeLevelId, { bgImageBlob: undefined });
  }

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

        <div className="mx-0.5 h-4 w-px bg-line" />
        <button
          onClick={() => bgInputRef.current?.click()}
          title="Achtergrondafbeelding uploaden"
          className={`rounded-lg p-1.5 transition-colors hover:bg-paper-sunken ${activeLevel?.bgImageBlob ? "text-accent" : "text-ink-400 hover:text-ink-700"}`}
        >
          <Image size={14} />
        </button>
        <button
          onClick={() => void addLevel()}
          disabled={adding}
          title="Verdieping toevoegen"
          className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-paper-sunken hover:text-ink-700 disabled:opacity-40"
        >
          <Plus size={14} />
        </button>
      </div>

      <input
        ref={bgInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadBgImage(file);
          e.target.value = "";
        }}
      />

      {activeLevel?.bgImageBlob && activeLevelId && (
        <div className="mt-1.5 flex items-center justify-center gap-2 rounded-lg border border-line bg-paper-raised/90 px-3 py-1.5 shadow backdrop-blur">
          <span className="text-[10px] text-ink-500">Doorzicht</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            defaultValue={activeLevel.bgImageOpacity ?? 0.4}
            onInput={(e) =>
              void update("levels", activeLevelId, {
                bgImageOpacity: Number((e.target as HTMLInputElement).value),
              })
            }
            className="w-24"
          />
          <button
            onClick={() => void removeBgImage()}
            className="text-ink-400 hover:text-danger"
            title="Achtergrond verwijderen"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}

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
