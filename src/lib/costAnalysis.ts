// Kostenanalyse: begroot vs. besteed per fase, met signalering en een
// eenvoudige eindprognose. Pure functies — geen UI, geen database.

import type { BudgetLine, Expense, Phase } from "./domain/types";

export type CostSignal = "ok" | "bijna" | "over";

/** Vanaf dit aandeel van het budget geldt het signaal "bijna". */
export const BIJNA_DREMPEL = 0.8;

export interface PhaseCost {
  phase: Phase;
  begroot: number;
  besteed: number;
  /** begroot − besteed; negatief = overschrijding. */
  verschil: number;
  /** Besteed als percentage van begroot (0 zonder budget; kan boven 100). */
  pct: number;
  signal: CostSignal;
}

export interface CostForecast {
  begroot: number;
  besteed: number;
  /** Verwachte eindstand: afgeronde fases op werkelijk besteed, overige op
   *  max(begroot, besteed) — uitgeven onder budget vóór afronding telt niet
   *  als besparing. */
  prognose: number;
  /** begroot − prognose; negatief = verwachte overschrijding. */
  verschil: number;
}

function sumByPhase(rows: { phaseId?: string; amount: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const key = r.phaseId ?? "";
    m.set(key, (m.get(key) ?? 0) + r.amount);
  }
  return m;
}

export function phaseSignal(
  begroot: number,
  besteed: number,
  status?: Phase["status"],
): CostSignal {
  if (besteed > begroot) return "over";
  // Een afgeronde fase binnen budget is per definitie oké — "bijna op" is
  // alleen een waarschuwing zolang er nog uitgegeven kan worden.
  if (status === "done") return "ok";
  if (begroot > 0 && besteed >= begroot * BIJNA_DREMPEL) return "bijna";
  return "ok";
}

export function analyzePhaseCosts(
  phases: Phase[],
  budget: BudgetLine[],
  expenses: Expense[],
): PhaseCost[] {
  const budgetByPhase = sumByPhase(budget);
  const spentByPhase = sumByPhase(expenses);

  return phases
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((phase) => {
      const begroot = budgetByPhase.get(phase.id) ?? 0;
      const besteed = spentByPhase.get(phase.id) ?? 0;
      return {
        phase,
        begroot,
        besteed,
        verschil: begroot - besteed,
        pct: begroot > 0 ? (besteed / begroot) * 100 : besteed > 0 ? 100 : 0,
        signal: phaseSignal(begroot, besteed, phase.status),
      };
    });
}

export function forecastProjectCosts(
  phases: Phase[],
  budget: BudgetLine[],
  expenses: Expense[],
): CostForecast {
  const budgetByPhase = sumByPhase(budget);
  const spentByPhase = sumByPhase(expenses);

  const begroot = budget.reduce((s, b) => s + b.amount, 0);
  const besteed = expenses.reduce((s, e) => s + e.amount, 0);

  let prognose = 0;
  for (const phase of phases) {
    const b = budgetByPhase.get(phase.id) ?? 0;
    const s = spentByPhase.get(phase.id) ?? 0;
    prognose += phase.status === "done" ? s : Math.max(b, s);
  }
  // Regels/uitgaven zonder fase: status onbekend → max(begroot, besteed).
  prognose += Math.max(budgetByPhase.get("") ?? 0, spentByPhase.get("") ?? 0);

  return { begroot, besteed, prognose, verschil: begroot - prognose };
}
