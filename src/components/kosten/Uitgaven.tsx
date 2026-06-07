"use client";

// Uitgaven boeken en bekijken, per categorie.

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useProject, useExpenses, usePhases } from "@/lib/hooks";
import { create, remove } from "@/lib/db/repo";
import type { Expense } from "@/lib/domain/types";
import { KOSTEN_CATEGORIEEN } from "@/lib/domain/constants";
import { formatEuro, formatDate } from "@/lib/format";

export function Uitgaven() {
  const project = useProject();
  const expenses = useExpenses(project?.id) ?? [];
  const phases = usePhases(project?.id) ?? [];
  const [open, setOpen] = useState(false);

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-card border border-line bg-paper-raised px-4 py-3">
        <span className="text-sm text-ink-500">Totaal uitgegeven</span>
        <span className="tabular text-xl font-bold text-accent">{formatEuro(total)}</span>
      </div>

      {open ? (
        <ExpenseForm
          projectId={project?.id ?? ""}
          phases={phases.map((p) => ({ id: p.id, name: p.name }))}
          onDone={() => setOpen(false)}
        />
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-card bg-ink-900 py-3 text-sm font-medium text-paper-raised"
        >
          <Plus size={18} /> Uitgave toevoegen
        </button>
      )}

      {byCategory.length > 0 && (
        <section className="rounded-card border border-line bg-paper-raised p-3">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-ink-500">
            Per categorie
          </h2>
          <div className="space-y-2">
            {byCategory.map(([cat, amount]) => (
              <div key={cat}>
                <div className="mb-0.5 flex justify-between text-xs">
                  <span className="text-ink-700">{cat}</span>
                  <span className="tabular text-ink-900">{formatEuro(amount)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-paper-sunken">
                  <div
                    className="h-full rounded-full bg-blueprint"
                    style={{ width: `${total > 0 ? (amount / total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-card border border-line bg-paper-raised">
        {expenses.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-300">
            Nog geen uitgaven. Voeg je eerste boeking toe.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-900">{e.description}</div>
                  <div className="text-[11px] text-ink-500">
                    {e.category}
                    {e.vendor ? ` · ${e.vendor}` : ""} · {formatDate(e.date)}
                  </div>
                </div>
                <span className="tabular text-sm font-semibold text-ink-900">
                  {formatEuro(e.amount, true)}
                </span>
                <button
                  onClick={() => remove("expenses", e.id)}
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

function ExpenseForm({
  projectId,
  phases,
  onDone,
}: {
  projectId: string;
  phases: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(KOSTEN_CATEGORIEEN[0]);
  const [vendor, setVendor] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [phaseId, setPhaseId] = useState("");

  async function save() {
    const value = parseFloat(amount.replace(",", "."));
    if (!description.trim() || isNaN(value) || !projectId) return;
    await create<Expense>("expenses", {
      projectId,
      description: description.trim(),
      amount: value,
      category,
      vendor: vendor.trim() || undefined,
      date,
      phaseId: phaseId || undefined,
    });
    onDone();
  }

  return (
    <section className="space-y-2.5 rounded-card border border-accent/30 bg-paper-raised p-4">
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Omschrijving (bv. cement 10 zakken)"
        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300"
      />
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500">€</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            className="tabular w-full rounded-lg border border-line bg-paper py-2 pl-7 pr-3 text-sm text-ink-900 placeholder:text-ink-300"
          />
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="tabular rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-900"
        />
      </div>
      <div className="flex gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-900"
        >
          {KOSTEN_CATEGORIEEN.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={phaseId}
          onChange={(e) => setPhaseId(e.target.value)}
          className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-900"
        >
          <option value="">Geen fase</option>
          {phases.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <input
        value={vendor}
        onChange={(e) => setVendor(e.target.value)}
        placeholder="Leverancier (optioneel)"
        className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300"
      />
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
