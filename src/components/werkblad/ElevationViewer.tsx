"use client";

// Ruimte- en wandkiezer + het aanzicht van de gekozen muur. Uit de pagina
// /aanzichten gelicht zodat de werkruimte dezelfde weergave kan tonen zonder
// dat er twee versies uiteen gaan lopen.

import { useState } from "react";
import clsx from "clsx";
import {
  useRooms,
  useWalls,
  useElectrical,
  usePlumbing,
  useHvac,
  useOpenings,
  useActiveLevel,
} from "@/lib/hooks";
import { WallElevation } from "@/components/werkblad/WallElevation";
import { roomWalls } from "@/lib/roomWalls";
import { dist } from "@/lib/geometry";
import type { Wall } from "@/lib/domain/types";

export function wallLabel(w: Wall, idx: number) {
  const len = dist(w.start, w.end);
  return `Muur ${idx + 1} (${(len * 100).toFixed(0)} cm)`;
}

export function ElevationViewer({ className }: { className?: string }) {
  const level = useActiveLevel();
  const rooms = useRooms(level?.id) ?? [];
  const walls = useWalls(level?.id) ?? [];
  const openings = useOpenings(level?.id) ?? [];
  const electrical = useElectrical(level?.id) ?? [];
  const plumbing = usePlumbing(level?.id) ?? [];
  const hvac = useHvac(level?.id ?? null) ?? [];

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedWallIdx, setSelectedWallIdx] = useState(0);

  const activeRoom = rooms.find((r) => r.id === selectedRoomId) ?? rooms[0] ?? null;
  const activeRoomWalls = activeRoom ? roomWalls(activeRoom.polygon, walls) : [];
  const activeWall = activeRoomWalls[selectedWallIdx] ?? activeRoomWalls[0] ?? null;

  if (!level) {
    return (
      <p className="flex h-full items-center justify-center text-sm text-ink-500">
        Geen verdieping gevonden. Maak eerst een plattegrond.
      </p>
    );
  }

  return (
    <div className={clsx("mx-auto max-w-3xl space-y-4 p-4", className)}>
      <div className="no-print flex flex-wrap items-center gap-3">
        <div>
          <label htmlFor="aanzicht-ruimte" className="mr-2 text-xs text-ink-500">
            Ruimte
          </label>
          <select
            id="aanzicht-ruimte"
            value={activeRoom?.id ?? ""}
            onChange={(e) => {
              setSelectedRoomId(e.target.value);
              setSelectedWallIdx(0);
            }}
            className="h-[var(--control-h-sm)] rounded-control border border-line bg-paper px-2 text-sm text-ink-900"
          >
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        {activeRoomWalls.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {activeRoomWalls.map((w, i) => (
              <button
                key={w.id}
                onClick={() => setSelectedWallIdx(i)}
                className={clsx(
                  "h-[var(--control-h-sm)] rounded-control px-2.5 text-xs font-semibold transition-colors",
                  i === selectedWallIdx
                    ? "bg-ink-900 text-paper-raised"
                    : "bg-paper-sunken text-ink-700 hover:text-ink-900",
                )}
              >
                {wallLabel(w, i)}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeWall ? (
        <section className="break-inside-avoid rounded-card border border-line bg-white p-4">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="truncate text-sm font-semibold text-ink-900">
              {activeRoom?.name} — {wallLabel(activeWall, selectedWallIdx)}
            </h2>
            <span className="shrink-0 text-xs text-ink-500">{level.name}</span>
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
        <p className="py-8 text-center text-sm text-ink-500">
          Kies een ruimte met muren om de aanzichten te zien.
        </p>
      )}
    </div>
  );
}
