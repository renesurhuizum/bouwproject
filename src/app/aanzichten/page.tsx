"use client";

// Wandaanzichten: per ruimte een elevatie-tekening van elke muurzijde.
// Met exacte positie van stopcontacten, schakelaars, leidingen en hoogte-maatlijnen.

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Printer, Frame, Scissors } from "lucide-react";
import {
  useProject,
  useLevels,
  useRooms,
  useWalls,
  useElectrical,
  usePlumbing,
  useHvac,
  useOpenings,
  useSections,
} from "@/lib/hooks";
import { useEditor } from "@/lib/store/editor";
import { getDB } from "@/lib/db/db";
import { WallElevation } from "@/components/werkblad/WallElevation";
import { CrossSection, type SectionLevelData } from "@/components/werkblad/CrossSection";
import { roomWalls } from "@/lib/roomWalls";
import { dist } from "@/lib/geometry";
import type { Wall } from "@/lib/domain/types";

export default function AanzichtenPage() {
  const project = useProject();
  const levels = useLevels(project?.id) ?? [];
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const level = levels.find((l) => l.id === activeLevelId) ?? levels[0];

  const rooms = useRooms(level?.id) ?? [];
  const walls = useWalls(level?.id) ?? [];
  const openings = useOpenings(level?.id) ?? [];
  const electrical = useElectrical(level?.id) ?? [];
  const plumbing = usePlumbing(level?.id) ?? [];
  const hvac = useHvac(level?.id) ?? [];

  const sections = useSections(level?.id) ?? [];

  const [tab, setTab] = useState<"aanzichten" | "doorsneden">("aanzichten");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedWallIdx, setSelectedWallIdx] = useState(0);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);

  // Alle verdiepingen met hun geometrie, voor de doorsnede-berekening.
  const sectionData = useLiveQuery(
    async () => {
      if (!project?.id) return [];
      const db = getDB();
      const lvls = (await db.levels.where("projectId").equals(project.id).sortBy("elevation")).filter((l) => !l.deleted);
      const out: SectionLevelData[] = [];
      for (const lv of lvls) {
        const w = (await db.walls.where("levelId").equals(lv.id).toArray()).filter((x) => !x.deleted);
        const wallIds = new Set(w.map((x) => x.id));
        const ops = (await db.openings.toArray()).filter((o) => !o.deleted && wallIds.has(o.wallId));
        const rms = (await db.rooms.where("levelId").equals(lv.id).toArray()).filter((x) => !x.deleted);
        const rfs = (await db.roofs.where("levelId").equals(lv.id).toArray()).filter((x) => !x.deleted);
        out.push({ level: lv, walls: w, openings: ops, rooms: rms, roofs: rfs });
      }
      return out;
    },
    [project?.id],
    [] as SectionLevelData[],
  );

  const activeSection = sections.find((s) => s.id === selectedSectionId) ?? sections[0] ?? null;

  const activeRoom = rooms.find((r) => r.id === selectedRoomId) ?? rooms[0] ?? null;
  const activeRoomWalls = activeRoom ? roomWalls(activeRoom.polygon, walls) : [];

  const activeWall = activeRoomWalls[selectedWallIdx] ?? activeRoomWalls[0] ?? null;

  function wallLabel(w: Wall, idx: number) {
    const len = dist(w.start, w.end);
    return `Muur ${idx + 1} (${(len * 100).toFixed(0)} cm)`;
  }

  if (!level) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-400">
        Geen verdieping gevonden. Maak eerst een plattegrond.
      </div>
    );
  }

  return (
    <div className="print-area h-full overflow-y-auto bg-paper">
      {/* Actiebalk */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-paper-raised px-4 py-2">
        <h1 className="text-base font-bold text-ink-900">Aanzichten</h1>
        <div className="flex gap-1 rounded-full bg-paper-sunken p-1">
          <button
            onClick={() => setTab("aanzichten")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === "aanzichten" ? "bg-ink-900 text-paper-raised" : "text-ink-500"
            }`}
          >
            <Frame size={14} /> Wanden
          </button>
          <button
            onClick={() => setTab("doorsneden")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === "doorsneden" ? "bg-ink-900 text-paper-raised" : "text-ink-500"
            }`}
          >
            <Scissors size={14} /> Doorsneden
          </button>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          <Printer size={16} /> Print
        </button>
      </div>

      <div className="mx-auto max-w-3xl space-y-4 p-4 pb-10">
        {tab === "aanzichten" && (
        <>
        {/* Ruimte- en wandkiezer */}
        <div className="no-print flex flex-wrap items-center gap-3">
          <div>
            <label className="mr-2 text-xs text-ink-500">Ruimte</label>
            <select
              value={activeRoom?.id ?? ""}
              onChange={(e) => { setSelectedRoomId(e.target.value); setSelectedWallIdx(0); }}
              className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink-900"
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          {activeRoomWalls.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {activeRoomWalls.map((w, i) => (
                <button
                  key={w.id}
                  onClick={() => setSelectedWallIdx(i)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    i === selectedWallIdx
                      ? "bg-accent text-white"
                      : "bg-paper-sunken text-ink-700"
                  }`}
                >
                  {wallLabel(w, i)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Aanzicht van geselecteerde muur */}
        {activeWall ? (
          <section className="break-inside-avoid rounded-xl border border-line bg-white p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-ink-900">
                {activeRoom?.name} — {wallLabel(activeWall, selectedWallIdx)}
              </h2>
              <span className="text-xs text-ink-400">{level.name}</span>
            </div>
            <WallElevation
              wall={activeWall}
              openings={openings}
              electrical={electrical}
              plumbing={plumbing}
              hvac={hvac}
              wallName={`${activeRoom?.name ?? ""} — ${wallLabel(activeWall, selectedWallIdx)}`}
            />
          </section>
        ) : (
          <p className="py-8 text-center text-sm text-ink-400">
            Kies een ruimte met muren om de aanzichten te zien.
          </p>
        )}

        {/* Print-modus: alle aanzichten van alle ruimtes */}
        <div className="print-only space-y-6">
          {rooms.map((room) => {
            const rWalls = roomWalls(room.polygon, walls);
            return rWalls.map((w, i) => (
              <section key={`${room.id}-${w.id}`} className="break-inside-avoid">
                <h2 className="mb-2 text-sm font-bold text-ink-900">
                  {room.name} — Muur {i + 1}
                </h2>
                <WallElevation
                  wall={w}
                  openings={openings}
                  electrical={electrical}
                  plumbing={plumbing}
                  hvac={hvac}
                  wallName={`${room.name} — Muur ${i + 1}`}
                />
              </section>
            ));
          })}
        </div>
        </>
        )}

        {tab === "doorsneden" && (
          <div className="space-y-4">
            {sections.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-400">
                Nog geen doorsnedelijnen. Teken er een met het Doorsnede-gereedschap (✂) in de plattegrond.
              </p>
            ) : (
              <>
                <div className="no-print flex flex-wrap gap-1">
                  {sections.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSectionId(s.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                        activeSection?.id === s.id ? "bg-accent text-white" : "bg-paper-sunken text-ink-700"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                {activeSection && (
                  <section className="break-inside-avoid rounded-xl border border-line bg-white p-4">
                    <CrossSection section={activeSection} data={sectionData ?? []} />
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
