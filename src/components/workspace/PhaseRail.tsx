"use client";

// Faserail: de bouwvolgorde als begeleide stappen. Een fase aanklikken zet hem
// als huidige stap én kleurt het canvas mee, zodat "welke stap ben ik en wat
// mag nu" zichtbaar is in plaats van weggestopt op een apart scherm.

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { X, ListChecks, ArrowUpRight, Sparkles } from "lucide-react";
import { IndelingGenerator } from "@/components/indeling/IndelingGenerator";
import { useProject, usePhases } from "@/lib/hooks";
import { useEditor } from "@/lib/store/editor";
import { analyzePhases, phaseProgress } from "@/lib/phases";
import { StatusBadge, phaseState } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";

export function PhaseRail() {
  const project = useProject();
  const phases = usePhases(project?.id) ?? [];
  const railOpen = useEditor((s) => s.railOpen);
  const setRailOpen = useEditor((s) => s.setRailOpen);
  const activeStepPhaseId = useEditor((s) => s.activeStepPhaseId);
  const setActiveStepPhase = useEditor((s) => s.setActiveStepPhase);
  const phaseOverlay = useEditor((s) => s.phaseOverlay);
  const togglePhaseOverlay = useEditor((s) => s.togglePhaseOverlay);
  const [showGenerator, setShowGenerator] = useState(false);

  const analysis = analyzePhases(phases);
  const progress = phaseProgress(phases);

  function pick(id: string) {
    // Nogmaals klikken heft de stap-focus op.
    setActiveStepPhase(activeStepPhaseId === id ? null : id);
    setRailOpen(false);
  }

  return (
    <>
      {/* Mobiel: verduistering achter de uitgeschoven rail. */}
      {railOpen && (
        <button
          aria-label="Faserail sluiten"
          onClick={() => setRailOpen(false)}
          className="fixed inset-0 z-30 bg-ink-900/40 lg:hidden"
        />
      )}

      <div
        className={clsx(
          "no-print flex min-h-0 flex-col bg-paper-raised",
          // Mobiel: sheet die van links inschuift.
          "fixed inset-y-0 left-0 z-40 w-72 border-r border-line shadow-panel transition-transform duration-200",
          railOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop: gewoon de eerste kolom van de werkruimte.
          "lg:static lg:z-auto lg:w-auto lg:min-h-0 lg:flex-1 lg:translate-x-0 lg:border-r-0 lg:shadow-none lg:transition-none",
        )}
      >
        <div className="safe-top flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
          <div className="min-w-0">
            <h2 className="label-micro">Bouwvolgorde</h2>
            <div className="tabular text-xs font-bold text-ink-900">
              {Math.round(progress * 100)}% klaar
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            onClick={() => setRailOpen(false)}
            aria-label="Sluiten"
            className="lg:hidden"
          >
            <X size={16} />
          </Button>
        </div>

        <div className="h-1 shrink-0 bg-paper-sunken">
          <div
            className="h-full bg-accent transition-all duration-500"
            style={{ width: `${Math.max(1, progress * 100)}%` }}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {analysis.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-ink-500">Nog geen fases.</p>
          ) : (
            <ol>
              {analysis.map(({ phase, blocked, blockedBy }, i) => {
                const state = phaseState(phase.status, blocked);
                const active = phase.id === activeStepPhaseId;
                return (
                  <li key={phase.id}>
                    <button
                      onClick={() => pick(phase.id)}
                      aria-pressed={active}
                      className={clsx(
                        "flex w-full items-start gap-2.5 border-b border-line px-3 py-2 text-left transition-colors",
                        active ? "bg-accent-soft" : "hover:bg-paper-sunken",
                      )}
                    >
                      <span
                        aria-hidden
                        className={clsx(
                          "tabular mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                          state === "done"
                            ? "bg-ok text-white"
                            : active
                              ? "bg-accent-ink text-white"
                              : "bg-paper-sunken text-ink-500",
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-900">
                            {phase.name}
                          </span>
                          <StatusBadge state={state} />
                        </span>
                        {blocked && (
                          <span className="mt-0.5 block truncate text-[11px] text-ink-500">
                            Wacht op {blockedBy.map((b) => b.name).join(", ")}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="shrink-0 space-y-1.5 border-t border-line p-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowGenerator(true);
              setRailOpen(false);
            }}
            className="w-full border-accent/40 text-accent-ink"
            title="Genereer een voorstel-indeling voor de plattegrond"
          >
            <Sparkles size={14} aria-hidden /> Indeling genereren
          </Button>
          <Button
            size="sm"
            variant="soft"
            active={phaseOverlay}
            onClick={togglePhaseOverlay}
            className="w-full"
            title="Kleur ruimtes op werkvoortgang (taken per ruimte)"
          >
            <ListChecks size={14} aria-hidden /> Voortgang op canvas
          </Button>
          <Link
            href="/fases"
            className="flex h-[var(--control-h-sm)] items-center justify-center gap-1.5 rounded-control text-xs font-semibold text-ink-500 transition-colors hover:bg-paper-sunken hover:text-ink-900"
          >
            Fases beheren <ArrowUpRight size={13} aria-hidden />
          </Link>
        </div>
      </div>

      {showGenerator && <IndelingGenerator onClose={() => setShowGenerator(false)} />}
    </>
  );
}
