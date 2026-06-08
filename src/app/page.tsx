"use client";

// Dashboard: overzicht van het project, de fasering en de kosten.

import Link from "next/link";
import { PencilRuler, Box, ListChecks, ArrowRight, Printer } from "lucide-react";
import { useProject, usePhases, useExpenses, useBudget } from "@/lib/hooks";
import { analyzePhases, phaseProgress } from "@/lib/phases";
import { formatEuro } from "@/lib/format";

export default function Home() {
  const project = useProject();
  const phases = usePhases(project?.id) ?? [];
  const expenses = useExpenses(project?.id) ?? [];
  const budget = useBudget(project?.id) ?? [];

  const analysis = analyzePhases(phases);
  const progress = phaseProgress(phases);
  const nextPhase = analysis.find((a) => a.ready)?.phase;
  const spent = expenses.reduce((s, e) => s + e.amount, 0);
  const budgeted = budget.reduce((s, b) => s + b.amount, 0);

  return (
    <div className="blueprint-bg h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-4 p-4 pb-8">
        {/* Hero */}
        <section className="rounded-card border border-line bg-paper-raised p-5">
          <div className="text-[11px] uppercase tracking-[0.2em] text-accent">
            Renovatie · digital twin
          </div>
          <h1 className="mt-1 text-2xl font-bold leading-tight text-ink-900">
            {project?.name ?? "Bouwproject"}
          </h1>
          {project?.description && (
            <p className="mt-1 text-sm text-ink-500">{project.description}</p>
          )}

          {/* Voortgangsbalk */}
          <div className="mt-4">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs text-ink-500">Voortgang fasering</span>
              <span className="tabular text-sm font-semibold text-ink-900">
                {Math.round(progress * 100)}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-paper-sunken">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${Math.max(2, progress * 100)}%` }}
              />
            </div>
          </div>
        </section>

        {/* Volgende stap */}
        {nextPhase && (
          <Link
            href="/fases"
            className="block rounded-card border border-accent/30 bg-accent-soft p-4"
          >
            <div className="text-[11px] uppercase tracking-wider text-accent">
              Nu aan de beurt
            </div>
            <div className="mt-0.5 flex items-center justify-between">
              <div className="text-lg font-semibold text-ink-900">{nextPhase.name}</div>
              <ArrowRight className="text-accent" size={20} />
            </div>
            {nextPhase.note && (
              <p className="mt-1 text-xs text-ink-700">{nextPhase.note}</p>
            )}
          </Link>
        )}

        {/* Kosten */}
        <section className="grid grid-cols-2 gap-3">
          <Stat label="Uitgegeven" value={formatEuro(spent)} accent />
          <Stat
            label="Begroot"
            value={budgeted > 0 ? formatEuro(budgeted) : "—"}
          />
        </section>

        {/* Snelle acties */}
        <section className="grid grid-cols-3 gap-3">
          <QuickLink href="/plattegrond" label="Plattegrond" icon={PencilRuler} />
          <QuickLink href="/3d" label="3D" icon={Box} />
          <QuickLink href="/fases" label="Fases" icon={ListChecks} />
        </section>

        <Link
          href="/werkblad"
          className="flex items-center justify-center gap-2 rounded-card border border-line bg-paper-raised py-3 text-sm font-medium text-ink-700 transition-colors hover:border-accent hover:text-accent"
        >
          <Printer size={18} /> Werkblad / PDF voor de bouwplaats
        </Link>

        {/* Fasenlijst kort */}
        <section className="rounded-card border border-line bg-paper-raised p-2">
          <h2 className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-ink-500">
            Fasering
          </h2>
          <ul className="divide-y divide-line">
            {analysis.map(({ phase, blocked }) => (
              <li key={phase.id} className="flex items-center gap-3 px-2 py-2.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: phase.color ?? "#78716c" }}
                />
                <span className="flex-1 text-sm text-ink-900">{phase.name}</span>
                <StatusBadge status={phase.status} blocked={blocked} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-card border border-line bg-paper-raised p-4">
      <div className="text-xs text-ink-500">{label}</div>
      <div className={`tabular mt-1 text-xl font-bold ${accent ? "text-accent" : "text-ink-900"}`}>
        {value}
      </div>
    </div>
  );
}

function QuickLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-card border border-line bg-paper-raised py-4 text-xs font-medium text-ink-700 transition-colors hover:border-accent hover:text-accent"
    >
      <Icon size={22} />
      {label}
    </Link>
  );
}

function StatusBadge({
  status,
  blocked,
}: {
  status: "todo" | "in-progress" | "done";
  blocked: boolean;
}) {
  if (status === "done") {
    return <span className="rounded-full bg-ok/10 px-2 py-0.5 text-[10px] font-medium text-ok">Klaar</span>;
  }
  if (status === "in-progress") {
    return (
      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
        Bezig
      </span>
    );
  }
  if (blocked) {
    return (
      <span className="rounded-full bg-paper-sunken px-2 py-0.5 text-[10px] font-medium text-ink-300">
        Geblokkeerd
      </span>
    );
  }
  return (
    <span className="rounded-full bg-blueprint/10 px-2 py-0.5 text-[10px] font-medium text-blueprint">
      Kan starten
    </span>
  );
}
