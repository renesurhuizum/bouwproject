// Fasering-engine: bepaalt op basis van afhankelijkheden welke fase mag starten,
// wat geblokkeerd is en waarom. Dit zijn de "handvaten" voor de juiste volgorde.

import type { Phase } from "./domain/types";

export interface PhaseStatusInfo {
  phase: Phase;
  blocked: boolean;
  blockedBy: Phase[]; // nog niet afgeronde voorwaarden
  ready: boolean; // mag nu starten (voorwaarden klaar, zelf nog niet done)
}

export function analyzePhases(phases: Phase[]): PhaseStatusInfo[] {
  const byId = new Map(phases.map((p) => [p.id, p]));

  return phases
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((phase) => {
      const blockedBy = phase.dependsOn
        .map((id) => byId.get(id))
        .filter((p): p is Phase => Boolean(p) && p!.status !== "done");

      const blocked = blockedBy.length > 0;
      const ready = !blocked && phase.status !== "done";

      return { phase, blocked, blockedBy, ready };
    });
}

// Eenvoudige voortgang: aandeel afgeronde fases.
export function phaseProgress(phases: Phase[]): number {
  if (phases.length === 0) return 0;
  const done = phases.filter((p) => p.status === "done").length;
  return done / phases.length;
}
