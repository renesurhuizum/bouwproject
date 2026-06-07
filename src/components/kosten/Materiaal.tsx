"use client";

// Materiaallijst (BOM): nodig → besteld → geleverd, met automatische schatting
// uit de plattegrond (muur- en vloeroppervlak).

import { useMemo, useState } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { useProject, useMaterials } from "@/lib/hooks";
import { create, update, remove } from "@/lib/db/repo";
import { getDB } from "@/lib/db/db";
import type { MaterialItem, MaterialStatus } from "@/lib/domain/types";
import {
  MATERIAL_UNITS,
  MATERIAL_STATUS_LABEL,
  MATERIAL_STATUS_COLOR,
} from "@/lib/domain/constants";
import { formatEuro } from "@/lib/format";
import { dist, polygonArea } from "@/lib/geometry";

const STATUSES: MaterialStatus[] = ["needed", "ordered", "delivered"];
const GIPS_AREA = 1.2 * 2.6; // m² per plaat

export function Materiaal() {
  const project = useProject();
  const materials = useMaterials(project?.id) ?? [];
  const [open, setOpen] = useState(false);

  const totalCost = useMemo(
    () => materials.reduce((s, m) => s + (m.unitPrice ?? 0) * m.quantity, 0),
    [materials],
  );

  async function estimateFromPlan() {
    if (!project) return;
    const db = getDB();
    const levels = (await db.levels.where("projectId").equals(project.id).toArray()).filter(
      (l) => !l.deleted,
    );
    const levelIds = new Set(levels.map((l) => l.id));
    const walls = (await db.walls.toArray()).filter((w) => !w.deleted && levelIds.has(w.levelId));
    const rooms = (await db.rooms.toArray()).filter((r) => !r.deleted && levelIds.has(r.levelId));
    const newWalls = walls.filter((w) => w.status === "new");

    const wallArea = newWalls.reduce((s, w) => s + dist(w.start, w.end) * w.height, 0);
    const wallLen = newWalls.reduce((s, w) => s + dist(w.start, w.end), 0);
    const floorArea = rooms.reduce((s, r) => s + polygonArea(r.polygon), 0);

    const have = new Set(materials.map((m) => m.name.toLowerCase()));
    const add: { name: string; quantity: number; unit: string }[] = [];
    if (wallArea > 0) {
      add.push({ name: "Gipsplaat 120×260", quantity: Math.ceil((wallArea * 2) / GIPS_AREA), unit: "st" });
      add.push({ name: "Isolatie (wand)", quantity: Math.ceil(wallArea), unit: "m²" });
      add.push({ name: "Metalstud profiel", quantity: Math.ceil(wallLen * 2.5), unit: "m" });
      add.push({ name: "Montageschroeven (doos)", quantity: Math.max(1, Math.ceil(wallArea / 25)), unit: "st" });
    }
    if (floorArea > 0) {
      add.push({ name: "Dekvloer", quantity: Math.ceil(floorArea), unit: "m²" });
    }
    for (const s of add) {
      if (have.has(s.name.toLowerCase())) continue;
      await create<MaterialItem>("materials", {
        projectId: project.id,
        name: s.name,
        quantity: s.quantity,
        unit: s.unit,
        status: "needed",
      });
    }
  }

  function nextStatus(s: MaterialStatus): MaterialStatus {
    return s === "needed" ? "ordered" : s === "ordered" ? "delivered" : "needed";
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center justify-center gap-2 rounded-card bg-ink-900 py-3 text-sm font-medium text-paper-raised"
        >
          <Plus size={18} /> Materiaal toevoegen
        </button>
        <button
          onClick={estimateFromPlan}
          className="flex items-center justify-center gap-2 rounded-card border border-accent/40 bg-accent-soft px-3 py-3 text-sm font-medium text-accent"
        >
          <Wand2 size={18} /> Schat uit plattegrond
        </button>
      </div>

      {open && project && <MaterialForm projectId={project.id} onDone={() => setOpen(false)} />}

      {materials.length > 0 && (
        <div className="flex items-center justify-between rounded-card border border-line bg-paper-raised px-4 py-3">
          <span className="text-sm text-ink-500">Geschatte materiaalkosten</span>
          <span className="tabular text-lg font-bold text-ink-900">{formatEuro(totalCost)}</span>
        </div>
      )}

      <section className="rounded-card border border-line bg-paper-raised">
        {materials.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-300">
            Nog geen materiaal. Voeg toe of laat het schatten uit je plattegrond.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {materials.map((m) => (
              <li key={m.id} className="flex items-center gap-3 p-3">
                <button
                  onClick={() => update("materials", m.id, { status: nextStatus(m.status) })}
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                  style={{ background: MATERIAL_STATUS_COLOR[m.status] }}
                >
                  {MATERIAL_STATUS_LABEL[m.status]}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-900">{m.name}</div>
                  <div className="tabular text-[11px] text-ink-500">
                    {m.quantity} {m.unit}
                    {m.unitPrice ? ` · ${formatEuro(m.unitPrice, true)}/st` : ""}
                  </div>
                </div>
                {m.unitPrice ? (
                  <span className="tabular text-sm font-semibold text-ink-900">
                    {formatEuro(m.unitPrice * m.quantity)}
                  </span>
                ) : null}
                <button
                  onClick={() => remove("materials", m.id)}
                  className="text-ink-300 hover:text-danger"
                  aria-label="Verwijderen"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MaterialForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<string>(MATERIAL_UNITS[0]);
  const [price, setPrice] = useState("");

  async function save() {
    const qty = parseFloat(quantity.replace(",", "."));
    if (!name.trim() || isNaN(qty)) return;
    const up = parseFloat(price.replace(",", "."));
    await create<MaterialItem>("materials", {
      projectId,
      name: name.trim(),
      quantity: qty,
      unit,
      unitPrice: isNaN(up) ? undefined : up,
      status: "needed",
    });
    onDone();
  }

  return (
    <section className="space-y-2.5 rounded-card border border-accent/30 bg-paper-raised p-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Naam (bv. kalkzandsteen lijmblok)"
        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300"
      />
      <div className="flex gap-2">
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          inputMode="decimal"
          placeholder="Aantal"
          className="tabular w-24 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-900"
        />
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-900"
        >
          {MATERIAL_UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500">€</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="prijs/st (optioneel)"
            className="tabular w-full rounded-lg border border-line bg-paper py-2 pl-7 pr-3 text-sm text-ink-900 placeholder:text-ink-300"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={onDone}
          className="flex-1 rounded-lg bg-paper-sunken py-2 text-sm font-medium text-ink-700"
        >
          Annuleren
        </button>
        <button
          onClick={save}
          className="flex-[2] rounded-lg bg-accent py-2 text-sm font-medium text-white"
        >
          Opslaan
        </button>
      </div>
    </section>
  );
}
