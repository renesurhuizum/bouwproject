"use client";

// Modelcontrole: botsingen (clash detection) + regelgeving (NEN 1010,
// Bouwbesluit/BBL) over ALLE verdiepingen tegelijk, gegroepeerd en filterbaar.
// Tik op een melding om het element op de plattegrond te openen.

import { useDeferredValue, useMemo, useState } from "react";
import { TriangleAlert, Info, ShieldCheck, MapPin, Download } from "lucide-react";
import type { ProjectModel } from "@/lib/model";
import { detectClashes, type ClashCategory } from "@/lib/clashDetection";
import { validateElectrical, validateRooms, validateRoomServices, validateWalls } from "@/lib/validation";
import { useShowOnPlan } from "./useShowOnPlan";

type Cat = ClashCategory | "regelgeving";

interface Item {
  severity: "error" | "warn" | "info";
  category: Cat;
  message: string;
  levelId: string;
  levelName: string;
  entityIds: string[];
}

const CAT_LABEL: Record<Cat, string> = {
  structuur: "Constructie",
  leidingen: "Leidingen",
  elektra: "Elektra",
  kozijnen: "Kozijnen",
  regelgeving: "Regelgeving",
};

const SEV_ORDER = { error: 0, warn: 1, info: 2 } as const;

export function collectIssues(model: ProjectModel): Item[] {
  const items: Item[] = detectClashes(model).map((c) => ({ ...c }));
  for (const lm of model.levels) {
    const base = { levelId: lm.level.id, levelName: lm.level.name, category: "regelgeving" as const };
    for (const v of [
      ...validateWalls(lm.walls),
      ...validateElectrical(lm.electrical),
      ...validateRooms(lm.rooms, [lm.level]),
      ...validateRoomServices(lm.rooms, lm.plumbing, lm.electrical, lm.hvac),
    ]) {
      items.push({ ...base, severity: v.severity, message: v.message, entityIds: v.entityId ? [v.entityId] : [] });
    }
  }
  return items.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
}

export function Controle({ model }: { model: ProjectModel }) {
  const deferred = useDeferredValue(model);
  const items = useMemo(() => collectIssues(deferred), [deferred]);
  const [cat, setCat] = useState<Cat | "alle">("alle");
  const [showInfo, setShowInfo] = useState(false);
  const showOnPlan = useShowOnPlan(model);

  const counts = useMemo(() => {
    const c: Record<string, number> = { alle: 0 };
    for (const it of items) {
      if (!showInfo && it.severity === "info") continue;
      c.alle++;
      c[it.category] = (c[it.category] ?? 0) + 1;
    }
    return c;
  }, [items, showInfo]);

  const visible = items.filter((i) => (showInfo || i.severity !== "info") && (cat === "alle" || i.category === cat));
  const errors = items.filter((i) => i.severity === "error").length;
  const warns = items.filter((i) => i.severity === "warn").length;
  const infos = items.filter((i) => i.severity === "info").length;

  function exportCsv() {
    const rows = [["Ernst", "Categorie", "Verdieping", "Melding"], ...items.map((i) => [i.severity, CAT_LABEL[i.category], i.levelName, i.message])];
    const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `modelcontrole-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-3">
      <section className="grid grid-cols-3 gap-2">
        <Stat label="Fouten" value={errors} tone="danger" hint="Moet opgelost vóór uitvoering" />
        <Stat label="Waarschuwingen" value={warns} tone="warn" hint="Controleren / overleggen" />
        <Stat label="Tips" value={infos} tone="blueprint" hint="Aandachtspunten" />
      </section>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-line bg-paper-raised p-6 text-center">
          <ShieldCheck className="text-ok" size={28} />
          <p className="text-sm font-medium text-ink-900">Geen botsingen of aandachtspunten gevonden</p>
          <p className="text-xs text-ink-500">De controle draait automatisch mee bij elke wijziging in het model.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {(["alle", "structuur", "leidingen", "elektra", "kozijnen", "regelgeving"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setCat(k)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${cat === k ? "bg-ink-900 text-paper-raised" : "bg-paper-sunken text-ink-700"}`}
              >
                {k === "alle" ? "Alles" : CAT_LABEL[k]} <span className="tabular opacity-70">{counts[k] ?? 0}</span>
              </button>
            ))}
            <label className="ml-auto flex items-center gap-1.5 text-xs text-ink-500">
              <input type="checkbox" checked={showInfo} onChange={(e) => setShowInfo(e.target.checked)} className="accent-accent" />
              Tips tonen
            </label>
          </div>

          <ul className="space-y-1.5">
            {visible.map((it, idx) => (
              <li key={idx} className="flex items-start gap-2 rounded-lg border border-line bg-paper-raised px-3 py-2">
                {it.severity === "info" ? (
                  <Info size={15} className="mt-0.5 shrink-0 text-blueprint" />
                ) : (
                  <TriangleAlert size={15} className={`mt-0.5 shrink-0 ${it.severity === "error" ? "text-danger" : "text-warn"}`} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug text-ink-900">{it.message}</p>
                  <p className="mt-0.5 text-[11px] text-ink-500">
                    {CAT_LABEL[it.category]} · {it.levelName}
                  </p>
                </div>
                <button
                  onClick={() => showOnPlan(it.entityIds, it.levelId)}
                  className="flex shrink-0 items-center gap-1 rounded-md bg-paper-sunken px-2 py-1 text-[11px] font-medium text-ink-700"
                  title="Toon op plattegrond"
                >
                  <MapPin size={12} /> Plan
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="px-1 text-xs text-ink-500">Niets in deze categorie.</li>}
          </ul>

          <button onClick={exportCsv} className="flex items-center gap-1.5 text-xs font-medium text-blueprint">
            <Download size={14} /> Controlerapport als CSV (voor aannemer/installateur)
          </button>
        </>
      )}

      <p className="px-1 text-[11px] leading-relaxed text-ink-500">
        De controle vergelijkt leidingen met balken, kolommen en dragende muren (op hoogte waar die
        is ingevuld), elektra met kozijnen en natte zones (NEN 1010), opleggingen van stalen
        balken en of dragende muren boven elkaar staan. Het is een hulpmiddel — constructieve
        beslissingen altijd laten toetsen door een constructeur.
      </p>
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: number; tone: "danger" | "warn" | "blueprint"; hint: string }) {
  const color = value === 0 ? "text-ok" : tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-blueprint";
  return (
    <div className="rounded-card border border-line bg-paper-raised p-3">
      <div className={`tabular text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs font-medium text-ink-900">{label}</div>
      <div className="text-[10px] leading-tight text-ink-500">{hint}</div>
    </div>
  );
}
