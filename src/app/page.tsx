"use client";

// Dashboard: overzicht van het project, de fasering en de kosten.

import Link from "next/link";
import { Suspense } from "react";
import { LayoutTemplate, Box, Receipt, ListChecks, FileText, ArrowRight, TrendingUp } from "lucide-react";
import { useProject, usePhases, useExpenses, useBudget } from "@/lib/hooks";
import { analyzePhases, phaseProgress } from "@/lib/phases";
import { formatEuro } from "@/lib/format";

export default function Home() {
  return (
    <div className="blueprint-bg h-full overflow-y-auto">
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

function DashboardContent() {
  const project = useProject();
  const phases = usePhases(project?.id) ?? [];
  const expenses = useExpenses(project?.id) ?? [];
  const budget = useBudget(project?.id) ?? [];

  const analysis = analyzePhases(phases);
  const progress = phaseProgress(phases);
  const nextPhase = analysis.find((a) => a.ready)?.phase;
  const spent = expenses.reduce((s, e) => s + e.amount, 0);
  const budgeted = budget.reduce((s, b) => s + b.amount, 0);
  const budgetRatio = budgeted > 0 ? spent / budgeted : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 pb-24">

      {/* Project hero — editorial header */}
      <section
        className="relative overflow-hidden rounded-xl border border-line bg-paper-raised p-6 shadow-sm"
        style={{ background: "linear-gradient(135deg, #fbfaf6 0%, #f5f0e2 100%)" }}
      >
        {/* Decoratieve achtergrondletter */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-4 -top-6 select-none text-[120px] font-black leading-none text-accent/5"
        >
          R
        </div>

        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-accent">
            Renovatie · digital twin
          </span>

          <h1 className="mt-2 text-3xl font-black leading-tight tracking-tight text-ink-900">
            {project?.name ?? "Bouwproject"}
          </h1>

          {project?.description && (
            <p className="mt-1.5 text-sm text-ink-500 leading-relaxed">
              {project.description}
            </p>
          )}

          {/* Voortgangsbalk */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs font-medium text-ink-500">Fasevoortgang</span>
              <span className="tabular text-sm font-bold text-ink-900">
                {Math.round(progress * 100)}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-paper-sunken">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${Math.max(2, progress * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Snelle acties — icoon-grid */}
      <section aria-label="Snelle acties">
        <h2 className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-widest text-ink-400">
          Ga naar
        </h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          <QuickLink href="/plattegrond" label="Plattegrond" icon={LayoutTemplate} />
          <QuickLink href="/3d" label="3D" icon={Box} />
          <QuickLink href="/kosten" label="Kosten" icon={Receipt} />
          <QuickLink href="/fases" label="Fases" icon={ListChecks} />
          <QuickLink href="/werkblad" label="Werkblad" icon={FileText} />
        </div>
      </section>

      {/* Volgende stap */}
      {nextPhase && (
        <Link
          href="/fases"
          className="group flex items-start gap-4 rounded-xl border border-accent/25 bg-accent-soft px-5 py-4 transition-all hover:border-accent/50 hover:shadow-sm"
        >
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <TrendingUp size={16} strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-accent">
              Nu aan de beurt
            </div>
            <div className="mt-0.5 truncate text-base font-semibold text-ink-900">
              {nextPhase.name}
            </div>
            {nextPhase.note && (
              <p className="mt-0.5 text-xs text-ink-500 line-clamp-1">{nextPhase.note}</p>
            )}
          </div>
          <ArrowRight
            size={18}
            className="mt-1 shrink-0 text-accent transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      )}

      {/* Kosten stats */}
      <section aria-label="Kosten" className="grid grid-cols-2 gap-3">
        <StatCard
          label="Uitgegeven"
          value={formatEuro(spent)}
          accent
          sub={budgetRatio != null ? `${Math.round(budgetRatio * 100)}% van budget` : undefined}
        />
        <StatCard
          label="Begroot"
          value={budgeted > 0 ? formatEuro(budgeted) : "—"}
          sub={budgeted > 0 ? `${expenses.length} kosten` : "Nog geen budget"}
        />
      </section>

      {/* Faselijst */}
      <section className="overflow-hidden rounded-xl border border-line bg-paper-raised shadow-sm">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-ink-500">
            Fasering
          </h2>
          <Link
            href="/fases"
            className="text-[11px] font-semibold text-accent hover:underline"
          >
            Alles zien
          </Link>
        </div>
        {analysis.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-ink-400">
            Nog geen fases aangemaakt
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {analysis.slice(0, 6).map(({ phase, blocked }) => (
              <li key={phase.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-offset-1"
                  style={{
                    background: phase.color ?? "#78716c",
                  }}
                />
                <span className="flex-1 text-sm font-medium text-ink-900 truncate">
                  {phase.name}
                </span>
                <StatusBadge status={phase.status} blocked={blocked} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// --- Sub-components ---

function QuickLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center gap-2 rounded-xl border border-line bg-paper-raised py-4 text-[11px] font-semibold text-ink-500 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:text-accent hover:shadow-sm active:translate-y-0"
    >
      <Icon size={22} strokeWidth={1.7} className="transition-colors" />
      {label}
    </Link>
  );
}

function StatCard({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent?: boolean;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper-raised p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
        {label}
      </div>
      <div
        className={`tabular mt-1.5 text-2xl font-black leading-none ${accent ? "text-accent" : "text-ink-900"}`}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[11px] text-ink-400">{sub}</div>
      )}
    </div>
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
    return (
      <span className="shrink-0 rounded-full bg-ok/10 px-2.5 py-0.5 text-[10px] font-bold text-ok">
        Klaar
      </span>
    );
  }
  if (status === "in-progress") {
    return (
      <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-bold text-accent">
        Bezig
      </span>
    );
  }
  if (blocked) {
    return (
      <span className="shrink-0 rounded-full bg-paper-sunken px-2.5 py-0.5 text-[10px] font-medium text-ink-300">
        Geblokkeerd
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-blueprint/10 px-2.5 py-0.5 text-[10px] font-bold text-blueprint">
      Kan starten
    </span>
  );
}

// --- Skeleton loader ---

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4">
      <div className="h-40 animate-pulse rounded-xl bg-paper-sunken" />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-paper-sunken" />
        ))}
      </div>
      <div className="h-14 animate-pulse rounded-xl bg-paper-sunken" />
      <div className="grid grid-cols-2 gap-3">
        <div className="h-20 animate-pulse rounded-xl bg-paper-sunken" />
        <div className="h-20 animate-pulse rounded-xl bg-paper-sunken" />
      </div>
      <div className="h-48 animate-pulse rounded-xl bg-paper-sunken" />
    </div>
  );
}
