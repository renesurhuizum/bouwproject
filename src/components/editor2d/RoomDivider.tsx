"use client";

// Ruimte-verdeler paneel: kies een preset of stel kamers in, teken een rechthoek
// op de plattegrond, en genereer automatisch muren + ruimtepolygonen.

import { useState } from "react";
import { LayoutDashboard, Plus, Minus, Wand2, X } from "lucide-react";
import { create } from "@/lib/db/repo";
import { useEditor } from "@/lib/store/editor";
import { generateFloorplan, FLOORPLAN_PRESETS, type RoomSpec, type LayoutRect } from "@/lib/roomDivider";
import type { FloorplanOptions } from "@/lib/roomDivider";
import type { Wall, Room, Opening } from "@/lib/domain/types";

interface Props {
  divideRect: LayoutRect | null;
  onClear: () => void;
}

export function RoomDivider({ divideRect, onClear }: Props) {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const wallDefaults = useEditor((s) => s.wallDefaults);

  const [presetIdx, setPresetIdx] = useState(2); // Gezinswoning als default
  const [rooms, setRooms] = useState<RoomSpec[]>(() => FLOORPLAN_PRESETS[2].rooms);
  const [generating, setGenerating] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [openLiving, setOpenLiving] = useState(false);

  if (tool !== "divide") return null;

  function selectPreset(idx: number) {
    setPresetIdx(idx);
    setRooms(FLOORPLAN_PRESETS[idx].rooms);
    setShowCustom(false);
  }

  function updateWeight(i: number, delta: number) {
    setRooms((prev) =>
      prev.map((r, idx) =>
        idx === i ? { ...r, weight: Math.max(0.5, +(r.weight + delta).toFixed(1)) } : r,
      ),
    );
  }

  function addRoom(name = "Nieuwe kamer") {
    setRooms((prev) => [...prev, { name, weight: 2 }]);
  }

  function removeRoom(i: number) {
    setRooms((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateName(i: number, name: string) {
    setRooms((prev) => prev.map((r, idx) => (idx === i ? { ...r, name } : r)));
  }

  async function generate() {
    if (!divideRect || !activeLevelId || rooms.length === 0) return;
    setGenerating(true);
    try {
      const opts: FloorplanOptions = { openLiving };
      const layout = generateFloorplan(divideRect, rooms, opts);

      // Muren aanmaken — bewaar de DB-IDs voor deurplaatsing.
      const wallIds: string[] = [];
      for (const w of layout.walls) {
        const created = await create<Wall>("walls", {
          levelId: activeLevelId,
          start: w.start,
          end: w.end,
          thickness: w.isPerimeter ? wallDefaults.thickness : Math.min(0.1, wallDefaults.thickness),
          height: wallDefaults.height,
          material: wallDefaults.material,
          loadBearing: false,
          status: wallDefaults.status,
        });
        wallIds.push(created.id);
      }

      // Ruimtes aanmaken met kleur uit het algoritme.
      for (const r of layout.rooms) {
        await create<Room>("rooms", {
          levelId: activeLevelId,
          name: r.name,
          polygon: r.polygon,
          color: r.color,
        });
      }

      // Deuren aanmaken op inwendige muren.
      for (const door of layout.doors) {
        const wallId = wallIds[door.wallIndex];
        if (!wallId) continue;
        await create<Opening>("openings", {
          wallId,
          type: "door",
          width: door.width,
          height: 2.1,
          sillHeight: 0,
          offset: door.offset,
        });
      }

      onClear();
      setTool("select");
    } finally {
      setGenerating(false);
    }
  }

  const rectInfo = divideRect
    ? `${((divideRect.x1 - divideRect.x0) * 100).toFixed(0)} × ${((divideRect.y1 - divideRect.y0) * 100).toFixed(0)} cm`
    : null;

  const totalWeight = rooms.reduce((s, r) => s + r.weight, 0);

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-[76px] z-10 px-3">
      <div className="mx-auto max-w-sm rounded-xl border border-line bg-paper-raised/97 shadow-xl backdrop-blur">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
          <div className="flex items-center gap-2">
            <LayoutDashboard size={15} className="text-accent" />
            <span className="text-sm font-semibold text-ink-900">Ruimte-verdeler</span>
          </div>
          <button
            onClick={() => { onClear(); setTool("select"); }}
            className="rounded-lg p-1 text-ink-500 hover:bg-paper-sunken"
            aria-label="Sluiten"
          >
            <X size={15} />
          </button>
        </div>

        <div className="p-3 space-y-3">
          {/* Presets */}
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-ink-500 uppercase tracking-wide">Woningtype</p>
            <div className="grid grid-cols-2 gap-1.5">
              {FLOORPLAN_PRESETS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => selectPreset(i)}
                  className={`rounded-lg px-2 py-1.5 text-left text-[11px] leading-tight transition-colors ${
                    presetIdx === i && !showCustom
                      ? "bg-accent text-white"
                      : "bg-paper-sunken text-ink-700"
                  }`}
                >
                  <span className="block font-semibold">{p.label}</span>
                  <span className="block opacity-75">{p.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Kamers aanpassen */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[11px] font-medium text-ink-500 uppercase tracking-wide">Kamers ({rooms.length})</p>
              <button
                onClick={() => { setShowCustom(true); addRoom(); }}
                className="flex items-center gap-0.5 rounded-md bg-paper-sunken px-1.5 py-0.5 text-[10px] text-ink-700"
              >
                <Plus size={10} /> Toevoegen
              </button>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto pr-0.5">
              {rooms.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    value={r.name}
                    onChange={(e) => updateName(i, e.target.value)}
                    className="min-w-0 flex-1 rounded-md border border-line bg-paper px-2 py-0.5 text-[11px] text-ink-900"
                  />
                  <span className="w-12 text-center text-[10px] text-ink-400">
                    {Math.round((r.weight / totalWeight) * 100)}%
                  </span>
                  <div className="flex items-center rounded-md bg-paper-sunken">
                    <button onClick={() => updateWeight(i, -0.5)} className="px-1.5 py-1 text-ink-500">
                      <Minus size={10} />
                    </button>
                    <span className="w-7 text-center text-[10px] font-medium text-ink-700">{r.weight}</span>
                    <button onClick={() => updateWeight(i, +0.5)} className="px-1.5 py-1 text-ink-500">
                      <Plus size={10} />
                    </button>
                  </div>
                  <button onClick={() => removeRoom(i)} className="text-ink-300 hover:text-danger">
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Open keuken/woonkamer */}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={openLiving}
              onChange={(e) => setOpenLiving(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-line accent-accent"
            />
            <span className="text-[11px] text-ink-700">Open keuken/woonkamer</span>
          </label>

          {/* Begrenzing */}
          <div className="rounded-lg border border-dashed border-line p-2.5 text-center">
            {divideRect ? (
              <div>
                <p className="text-xs font-medium text-ink-900">{rectInfo}</p>
                <p className="text-[10px] text-ink-400">Begrenzing getekend</p>
                <button onClick={onClear} className="mt-1 text-[10px] text-ink-400 underline">
                  Opnieuw tekenen
                </button>
              </div>
            ) : (
              <div>
                <p className="text-xs font-medium text-ink-900">Teken een rechthoek</p>
                <p className="text-[10px] text-ink-400">Sleep op de plattegrond om de begrenzing te bepalen</p>
              </div>
            )}
          </div>

          {/* Genereer knop */}
          <button
            onClick={() => void generate()}
            disabled={!divideRect || generating || rooms.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Wand2 size={15} />
            {generating ? "Genereren…" : "Genereer indeling"}
          </button>
        </div>
      </div>
    </div>
  );
}
