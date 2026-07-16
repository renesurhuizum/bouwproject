"use client";

// Uitgaven boeken en bekijken, per categorie.

import { useRef, useState } from "react";
import { Plus, Trash2, Camera } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDB } from "@/lib/db/db";
import { useProject, useExpenses, usePhases, useBudget } from "@/lib/hooks";
import { create, remove, update } from "@/lib/db/repo";
import type { Expense, Photo } from "@/lib/domain/types";
import { KOSTEN_CATEGORIEEN } from "@/lib/domain/constants";
import { formatEuro, formatDate } from "@/lib/format";
import { PhotoThumb, Lightbox } from "@/components/PhotoSection";

export function Uitgaven() {
  const project = useProject();
  const expenses = useExpenses(project?.id) ?? [];
  const phases = usePhases(project?.id) ?? [];
  const budget = useBudget(project?.id) ?? [];
  const [open, setOpen] = useState(false);

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const budgeted = budget.reduce((s, b) => s + b.amount, 0);
  const overBudget = budgeted > 0 && total > budgeted;
  const phaseName = new Map(phases.map((p) => [p.id, p.name]));

  // Geen handmatige useMemo: React Compiler memoïseert dit zelf en struikelde
  // over de instabiele referentie uit de live query.
  const map = new Map<string, number>();
  for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
  const byCategory = [...map.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div
        className={`flex items-center justify-between rounded-card border px-4 py-3 ${
          overBudget ? "border-danger/40 bg-danger/5" : "border-line bg-paper-raised"
        }`}
      >
        <span className="text-sm text-ink-500">Totaal uitgegeven</span>
        <div className="text-right">
          <span className={`tabular text-xl font-bold ${overBudget ? "text-danger" : "text-accent"}`}>
            {formatEuro(total)}
          </span>
          {budgeted > 0 && (
            <div className={`text-[11px] ${overBudget ? "font-medium text-danger" : "text-ink-400"}`}>
              {overBudget
                ? `${formatEuro(total - budgeted)} boven de begroting (${formatEuro(budgeted)})`
                : `van ${formatEuro(budgeted)} begroot`}
            </div>
          )}
        </div>
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
                  <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-500">
                    <span>
                      {e.category}
                      {e.vendor ? ` · ${e.vendor}` : ""} · {formatDate(e.date)}
                    </span>
                    {e.phaseId && phaseName.get(e.phaseId) && (
                      <span className="rounded-full bg-paper-sunken px-1.5 py-0.5 text-[10px] text-ink-500">
                        {phaseName.get(e.phaseId)}
                      </span>
                    )}
                  </div>
                </div>
                <ReceiptCell expense={e} projectId={project?.id ?? ""} />
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

// Bonnetje bij een uitgave: camera-knop → foto in de photos-tabel + koppeling
// via expense.photoId; thumbnail op de rij met lightbox en verwijderen.
function ReceiptCell({ expense, projectId }: { expense: Expense; projectId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [showLightbox, setShowLightbox] = useState(false);

  const photo = useLiveQuery(
    async () => (expense.photoId ? await getDB().photos.get(expense.photoId) : null),
    [expense.photoId],
  );
  const hasPhoto = photo && !photo.deleted && photo.blob;

  async function addReceipt(file: File) {
    if (!projectId) return;
    const p = await create<Photo>("photos", {
      projectId,
      blob: file,
      caption: `Bon: ${expense.description}`,
      takenAt: new Date().toISOString().slice(0, 10),
    });
    await update("expenses", expense.id, { photoId: p.id });
  }

  return (
    <>
      {hasPhoto ? (
        <PhotoThumb photo={photo} onClick={() => setShowLightbox(true)} className="h-9 w-9 shrink-0" />
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="shrink-0 rounded-lg p-1.5 text-ink-300 hover:bg-paper-sunken hover:text-ink-700"
          title="Bonnetje toevoegen (foto)"
          aria-label="Bonnetje toevoegen"
        >
          <Camera size={15} />
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void addReceipt(f);
          e.target.value = "";
        }}
      />
      {showLightbox && hasPhoto && (
        <Lightbox
          photo={photo}
          onClose={() => setShowLightbox(false)}
          onDelete={() => {
            void remove("photos", photo.id);
            void update("expenses", expense.id, { photoId: undefined });
            setShowLightbox(false);
          }}
        />
      )}
    </>
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
