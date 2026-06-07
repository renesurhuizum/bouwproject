"use client";

// Begroting per fase: begroot vs werkelijk uitgegeven.

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useProject, useBudget, useExpenses, usePhases } from "@/lib/hooks";
import { create, remove } from "@/lib/db/repo";
import type { BudgetLine } from "@/lib/domain/types";
import { KOSTEN_CATEGORIEEN } from "@/lib/domain/constants";
import { formatEuro } from "@/lib/format";

export function Begroting() {
  const project = useProject();
  const budget = useBudget(project?.id) ?? [];
  const expenses = useExpenses(project?.id) ?? [];
  const phases = usePhases(project?.id) ?? [];
  const [open, setOpen] = useState(false);

  const totals = useMemo(() => {
    const begroot = budget.reduce((s, b) => s + b.amount, 0);
    const besteed = expenses.reduce((s, e) => s + e.amount, 0);
    return { begroot, besteed };
  }, [budget, expenses]);

  // Per fase optellen.
  const perPhase = useMemo(() => {
    return phases.map((p) => {
      const begroot = budget.filter((b) => b.phaseId === p.id).reduce((s, b) => s + b.amount, 0);
      const besteed = expenses.filter((e) => e.phaseId === p.id).reduce((s, e) => s + e.amount, 0);
      return { phase: p, begroot, besteed };
    });
  }, [phases, budget, expenses]);

  return (
    <div className="space-y-4">
      {/* Totalen */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Begroot" value={formatEuro(totals.begroot)} />
        <Stat label="Besteed" value={formatEuro(totals.besteed)} accent />
        <Stat
          label="Resterend"
          value={formatEuro(totals.begroot - totals.besteed)}
          good={totals.begroot - totals.besteed >= 0}
        />
      </div>

      {open ? (
        <BudgetForm
          projectId={project?.id ?? ""}
          phases={phases.map((p) => ({ id: p.id, name: p.name }))}
          onDone={() => setOpen(false)}
        />
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-card bg-ink-900 py-3 text-sm font-medium text-paper-raised"
        >
          <Plus size={18} /> Begrotingsregel toevoegen
        </button>
      )}

      {/* Per fase */}
      <section className="space-y-2">
        {perPhase
          .filter((r) => r.begroot > 0 || r.besteed > 0)
          .map(({ phase, begroot, besteed }) => {
            const pct = begroot > 0 ? Math.min(100, (besteed / begroot) * 100) : besteed > 0 ? 100 : 0;
            const over = besteed > begroot && begroot > 0;
            return (
              <div key={phase.id} className="rounded-card border border-line bg-paper-raised p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: phase.color ?? "#78716c" }}
                  />
                  <span className="flex-1 text-sm font-medium text-ink-900">{phase.name}</span>
                  <span className="tabular text-xs text-ink-500">
                    {formatEuro(besteed)} / {formatEuro(begroot)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-paper-sunken">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: over ? "#dc2626" : "#16a34a" }}
                  />
                </div>
                {/* Begrotingsregels van deze fase */}
                <div className="mt-2 space-y-1">
                  {budget
                    .filter((b) => b.phaseId === phase.id)
                    .map((b) => (
                      <div key={b.id} className="flex items-center gap-2 text-xs">
                        <span className="flex-1 text-ink-500">{b.category}</span>
                        <span className="tabular text-ink-900">{formatEuro(b.amount)}</span>
                        <button
                          onClick={() => remove("budget", b.id)}
                          className="text-ink-300 hover:text-danger"
                          aria-label="Verwijderen"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            );
          })}
        {perPhase.every((r) => r.begroot === 0 && r.besteed === 0) && (
          <p className="rounded-card border border-line bg-paper-raised p-6 text-center text-sm text-ink-300">
            Nog geen begroting. Voeg een regel toe en koppel hem aan een fase.
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  good,
}: {
  label: string;
  value: string;
  accent?: boolean;
  good?: boolean;
}) {
  const color = accent ? "text-accent" : good === false ? "text-danger" : "text-ink-900";
  return (
    <div className="rounded-card border border-line bg-paper-raised p-3">
      <div className="text-[11px] text-ink-500">{label}</div>
      <div className={`tabular mt-0.5 text-base font-bold ${color}`}>{value}</div>
    </div>
  );
}

function BudgetForm({
  projectId,
  phases,
  onDone,
}: {
  projectId: string;
  phases: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [phaseId, setPhaseId] = useState("");
  const [category, setCategory] = useState<string>(KOSTEN_CATEGORIEEN[0]);
  const [amount, setAmount] = useState("");

  async function save() {
    const value = parseFloat(amount.replace(",", "."));
    if (isNaN(value) || !projectId) return;
    await create<BudgetLine>("budget", {
      projectId,
      phaseId: phaseId || undefined,
      category,
      amount: value,
    });
    onDone();
  }

  return (
    <section className="space-y-2.5 rounded-card border border-accent/30 bg-paper-raised p-4">
      <div className="flex gap-2">
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
      </div>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500">€</span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="begroot bedrag"
          className="tabular w-full rounded-lg border border-line bg-paper py-2 pl-7 pr-3 text-sm text-ink-900 placeholder:text-ink-300"
        />
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
