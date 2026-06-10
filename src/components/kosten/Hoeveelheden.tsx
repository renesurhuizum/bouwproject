"use client";

// Hoeveelheidsstaat: automatische materiaal-uittreksel uit de plattegrond.
// Berekent vloer-, wand-, plafond- en afwerkoppervlakken per verdieping
// en kan items direct doorzetten naar de materiaallijst.

import { useMemo, useState } from "react";
import { ArrowRight, Download } from "lucide-react";
import { useProject, useLevels, useWalls, useRooms, useOpenings, useMaterials } from "@/lib/hooks";
import { useEditor } from "@/lib/store/editor";
import { computeQuantities, type QuantityItem } from "@/lib/quantityTakeoff";
import { create } from "@/lib/db/repo";
import type { MaterialItem } from "@/lib/domain/types";

const CATEGORY_LABEL: Record<QuantityItem["category"], string> = {
  walls: "Wanden",
  floors: "Vloeren & plafonds",
  openings: "Deuren & ramen",
  finishes: "Afwerking",
};

const CATEGORY_ORDER: QuantityItem["category"][] = ["walls", "floors", "openings", "finishes"];

export function Hoeveelheden() {
  const project = useProject();
  const levels = useLevels(project?.id) ?? [];
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const level = levels.find((l) => l.id === activeLevelId) ?? levels[0] ?? null;

  const walls = useWalls(level?.id) ?? [];
  const rooms = useRooms(level?.id) ?? [];
  const openings = useOpenings(level?.id) ?? [];
  const materials = useMaterials(project?.id) ?? [];

  const items = useMemo(() => {
    if (!level) return [];
    return computeQuantities(walls, rooms, openings, level);
  }, [walls, rooms, openings, level]);

  const [added, setAdded] = useState<Set<string>>(new Set());

  async function addToMaterials(item: QuantityItem) {
    if (!project) return;
    await create<MaterialItem>("materials", {
      projectId: project.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      status: "needed",
    });
    setAdded((prev) => new Set(prev).add(item.name));
  }

  async function addAll() {
    if (!project) return;
    const have = new Set(materials.map((m) => m.name.toLowerCase()));
    for (const item of items) {
      if (have.has(item.name.toLowerCase())) continue;
      await create<MaterialItem>("materials", {
        projectId: project.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        status: "needed",
      });
    }
    setAdded(new Set(items.map((i) => i.name)));
  }

  function exportCsv() {
    const rows = [
      ["Categorie", "Omschrijving", "Hoeveelheid", "Eenheid", "Detail"],
      ...items.map((i) => [
        CATEGORY_LABEL[i.category],
        i.name,
        String(i.quantity),
        i.unit,
        i.detail ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hoeveelheden-${level?.name ?? "plan"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!level) {
    return (
      <p className="py-8 text-center text-sm text-ink-400">
        Geen verdieping gevonden. Maak eerst een plattegrond.
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-ink-400">
        Nog niets om te berekenen. Teken muren en ruimtes in de plattegrond.
      </p>
    );
  }

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    list: items.filter((i) => i.category === cat),
  })).filter((g) => g.list.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-ink-500">
          Automatisch berekend uit <span className="font-medium">{level.name}</span>
        </p>
        <div className="flex gap-2">
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-paper-raised px-3 py-1.5 text-xs font-medium text-ink-700"
          >
            <Download size={14} /> CSV
          </button>
          <button
            onClick={addAll}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white"
          >
            <ArrowRight size={14} /> Alles naar materiaal
          </button>
        </div>
      </div>

      {grouped.map((g) => (
        <section key={g.cat} className="rounded-card border border-line bg-paper-raised">
          <header className="border-b border-line px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
            {CATEGORY_LABEL[g.cat]}
          </header>
          <ul className="divide-y divide-line">
            {g.list.map((item, idx) => (
              <li key={`${item.name}-${idx}`} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-900">{item.name}</div>
                  {item.detail && <div className="text-[11px] text-ink-400">{item.detail}</div>}
                </div>
                <span className="tabular shrink-0 text-sm font-semibold text-ink-900">
                  {item.quantity} {item.unit}
                </span>
                <button
                  onClick={() => addToMaterials(item)}
                  disabled={added.has(item.name)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-medium ${
                    added.has(item.name)
                      ? "bg-paper-sunken text-ok"
                      : "bg-paper-sunken text-ink-700 hover:bg-accent-soft hover:text-accent"
                  }`}
                >
                  {added.has(item.name) ? "Toegevoegd" : "→ Materiaal"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
