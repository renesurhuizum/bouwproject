"use client";

// Fase-status als badge. Stond eerder alleen in het dashboard; de faserail
// gebruikt nu dezelfde component zodat beide niet uiteen kunnen lopen.

import clsx from "clsx";
import type { PhaseStatus } from "@/lib/domain/types";

export type PhaseState = "done" | "in-progress" | "ready" | "blocked";

export const PHASE_STATE_LABEL: Record<PhaseState, string> = {
  done: "Klaar",
  "in-progress": "Bezig",
  ready: "Kan starten",
  blocked: "Geblokkeerd",
};

const STYLES: Record<PhaseState, string> = {
  done: "bg-ok/10 text-ok",
  "in-progress": "bg-accent/10 text-accent-ink",
  ready: "bg-blueprint/10 text-blueprint",
  blocked: "bg-paper-sunken text-ink-500",
};

/** Vertaalt de opgeslagen status + blokkade naar één zichtbare toestand. */
export function phaseState(status: PhaseStatus, blocked: boolean): PhaseState {
  if (status === "done") return "done";
  if (status === "in-progress") return "in-progress";
  return blocked ? "blocked" : "ready";
}

export function StatusBadge({ state, className }: { state: PhaseState; className?: string }) {
  return (
    <span
      className={clsx(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
        STYLES[state],
        className,
      )}
    >
      {PHASE_STATE_LABEL[state]}
    </span>
  );
}
