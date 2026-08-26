"use client";

// Hoeveelheidsstaat: van de getekende plattegrond naar een inkooplijst.
//
// Toont per regel wat er gemeten is, wat er met snijverlies bij komt en wat je
// uiteindelijk in hele verpakkingen afrekent — dat laatste is het getal waarmee
// je naar de bouwmarkt gaat.

import { useMemo, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import {
  useProject,
  useLevels,
  useWalls,
  useRooms,
  useOpenings,
  useMaterials,
  usePlumbing,
  useBeams,
  useCircuits,
  useAllElectrical,
  usePhases,
} from "@/lib/hooks";
import { useEditor } from "@/lib/store/editor";
import { computeTakeoff, type TakeoffLine } from "@/lib/takeoff/engine";
import { syncTakeoffToBom } from "@/lib/takeoff/bomSync";
import { formatEuro } from "@/lib/format";

export function Hoeveelheden() {
  const project = useProject();
  const levels = useLevels(project?.id) ?? [];
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const level = levels.find((l) => l.id === activeLevelId) ?? levels[0] ?? null;

  // "Deze verdieping" of het hele project — je koopt per project in, maar je
  // werkt per verdieping.
  const [scope, setScope] = useState<"level" | "project">("project");
  const levelIds = useMemo(() => levels.map((l) => l.id), [levels]);
  const scopeIds = scope === "level" && level ? [level.id] : levelIds;

  const walls = useWallsFor(scopeIds);
  const rooms = useRoomsFor(scopeIds);
  const openings = useOpeningsFor(scopeIds);
  const plumbing = usePlumbingFor(scopeIds);
  const beams = useBeamsFor(scopeIds);
  const electrical = useAllElectrical(scopeIds) ?? [];
  const circuits = useCircuits(project?.id) ?? [];
  const materials = useMaterials(project?.id) ?? [];
  const phases = usePhases(project?.id) ?? [];

  const lines = useMemo(
    () =>
      computeTakeoff({
        levels: levels.filter((l) => scopeIds.includes(l.id)),
        walls, rooms, openings, plumbing, electrical, circuits, beams,
      }),
    [levels, scopeIds, walls, rooms, openings, plumbing, electrical, circuits, beams],
  );

  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const total = lines.reduce((s, l) => s + (l.totalPrice ?? 0), 0);

  async function sync() {
    if (!project?.id || syncing) return;
    setSyncing(true);
    try {
      const phaseIdByOrder = new Map(phases.map((p) => [p.order, p.id]));
      const res = await syncTakeoffToBom(project.id, lines, materials, phaseIdByOrder);
      setLastSync(
        `${res.created} nieuw · ${res.updated} bijgewerkt · ${res.removed} vervallen` +
          (res.skipped ? ` · ${res.skipped} ongemoeid gelaten` : ""),
      );
    } finally {
      setSyncing(false);
    }
  }

  function exportCsv() {
    const rows = [
      ["Categorie", "Artikel", "Gemeten", "Bruto", "Inkoop", "Eenheid", "Verpakking", "Prijs", "Detail"],
      ...lines.map((l) => [
        l.category, l.name, String(l.netQty), String(l.grossQty), String(l.buyQty),
        l.unit, l.packs ? `${l.packs} × ${l.packName ?? "pak"}` : "",
        l.totalPrice != null ? String(l.totalPrice) : "", l.detail ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hoeveelheden-${project?.name ?? "plan"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (lines.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-400">
        Nog niets om te berekenen. Teken muren en ruimtes in de plattegrond.
      </p>
    );
  }

  // Groeperen op categorie, in de volgorde waarin de bouw verloopt.
  const groups = new Map<string, TakeoffLine[]>();
  for (const line of lines) {
    const list = groups.get(line.category) ?? [];
    list.push(line);
    groups.set(line.category, list);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex gap-1 rounded-full bg-paper-sunken p-1">
          {(["project", "level"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                scope === s ? "bg-ink-900 text-paper-raised" : "text-ink-500"
              }`}
            >
              {s === "project" ? "Hele project" : level?.name ?? "Verdieping"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-paper-raised px-3 py-1.5 text-xs font-medium text-ink-700"
          >
            <Download size={14} /> CSV
          </button>
          <button
            onClick={() => void sync()}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            title="Werkt de materiaallijst bij; bestelde regels blijven ongemoeid"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Bezig…" : "Naar materiaallijst"}
          </button>
        </div>
      </div>

      {lastSync && (
        <p className="rounded-lg bg-ok/10 px-3 py-2 text-xs text-ok">{lastSync}</p>
      )}

      {[...groups.entries()].map(([category, list]) => (
        <section key={category} className="rounded-card border border-line bg-paper-raised">
          <header className="flex items-baseline justify-between border-b border-line px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              {category}
            </span>
            <span className="tabular text-xs text-ink-400">
              {formatEuro(list.reduce((s, l) => s + (l.totalPrice ?? 0), 0))}
            </span>
          </header>
          <ul className="divide-y divide-line">
            {list.map((line) => (
              <li key={line.sourceId} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-900">{line.name}</div>
                  <div className="text-[11px] text-ink-400">
                    gemeten {line.netQty} {line.unit}
                    {line.grossQty !== line.netQty && <> · met verlies {line.grossQty}</>}
                    {line.detail && <> · {line.detail}</>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tabular text-sm font-semibold text-ink-900">
                    {line.packs != null
                      ? `${line.packs} × ${line.packName ?? "pak"}`
                      : `${line.buyQty} ${line.unit}`}
                  </div>
                  {line.totalPrice != null && (
                    <div className="tabular text-[11px] text-ink-400">
                      {formatEuro(line.totalPrice)}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="flex items-baseline justify-between rounded-card border border-line bg-paper-raised px-4 py-3">
        <span className="text-sm font-semibold text-ink-900">Totaal materiaal (indicatief)</span>
        <span className="tabular text-lg font-bold text-ink-900">{formatEuro(total)}</span>
      </div>
      <p className="px-1 text-[11px] leading-snug text-ink-400">
        Prijzen zijn indicatieve richtprijzen om mee te beginnen; in de
        materiaallijst kun je ze per regel aanpassen. Arbeid zit er niet in.
      </p>
    </div>
  );
}

// ── Hulphooks: dezelfde query over meerdere verdiepingen ────────────────────

import { useLiveQuery } from "dexie-react-hooks";
import { getDB } from "@/lib/db/db";

function notDeleted<T extends { deleted?: boolean }>(rows: T[]): T[] {
  return rows.filter((r) => !r.deleted);
}

function useWallsFor(levelIds: string[]) {
  const key = levelIds.join(",");
  return useLiveQuery(
    async () => (levelIds.length ? notDeleted(await getDB().walls.where("levelId").anyOf(levelIds).toArray()) : []),
    [key],
    [],
  );
}
function useRoomsFor(levelIds: string[]) {
  const key = levelIds.join(",");
  return useLiveQuery(
    async () => (levelIds.length ? notDeleted(await getDB().rooms.where("levelId").anyOf(levelIds).toArray()) : []),
    [key],
    [],
  );
}
function useOpeningsFor(levelIds: string[]) {
  const key = levelIds.join(",");
  return useLiveQuery(
    async () => {
      if (!levelIds.length) return [];
      const walls = notDeleted(await getDB().walls.where("levelId").anyOf(levelIds).toArray());
      const wallIds = walls.map((w) => w.id);
      if (!wallIds.length) return [];
      return notDeleted(await getDB().openings.where("wallId").anyOf(wallIds).toArray());
    },
    [key],
    [],
  );
}
function usePlumbingFor(levelIds: string[]) {
  const key = levelIds.join(",");
  return useLiveQuery(
    async () => (levelIds.length ? notDeleted(await getDB().plumbing.where("levelId").anyOf(levelIds).toArray()) : []),
    [key],
    [],
  );
}
function useBeamsFor(levelIds: string[]) {
  const key = levelIds.join(",");
  return useLiveQuery(
    async () => (levelIds.length ? notDeleted(await getDB().beams.where("levelId").anyOf(levelIds).toArray()) : []),
    [key],
    [],
  );
}
