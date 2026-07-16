import { describe, expect, it } from "vitest";
import type { BudgetLine, Expense, Phase, PhaseStatus } from "../domain/types";
import { analyzePhaseCosts, forecastProjectCosts, phaseSignal } from "../costAnalysis";

let nextId = 0;
const id = () => `t${nextId++}`;

function mkPhase(pid: string, order: number, status: PhaseStatus = "todo"): Phase {
  return { id: pid, projectId: "p1", name: `Fase ${pid}`, order, status, dependsOn: [], updatedAt: 0 };
}

function mkBudget(amount: number, phaseId?: string): BudgetLine {
  return { id: id(), projectId: "p1", phaseId, category: "Bouwkundig", amount, updatedAt: 0 };
}

function mkExpense(amount: number, phaseId?: string): Expense {
  return {
    id: id(), projectId: "p1", phaseId, description: "x", amount,
    date: "2026-07-01", category: "Bouwkundig", updatedAt: 0,
  };
}

describe("phaseSignal", () => {
  it("geeft ok onder de drempel", () => {
    expect(phaseSignal(1000, 500)).toBe("ok");
  });

  it("geeft bijna vanaf 80% van het budget", () => {
    expect(phaseSignal(1000, 800)).toBe("bijna");
    expect(phaseSignal(1000, 799)).toBe("ok");
    expect(phaseSignal(1000, 1000)).toBe("bijna");
  });

  it("geeft over bij overschrijding", () => {
    expect(phaseSignal(1000, 1001)).toBe("over");
  });

  it("geeft over bij uitgaven zonder budget", () => {
    expect(phaseSignal(0, 1)).toBe("over");
  });

  it("geeft ok zonder budget en zonder uitgaven", () => {
    expect(phaseSignal(0, 0)).toBe("ok");
  });

  it("geeft ok voor een afgeronde fase binnen budget (geen 'bijna' meer)", () => {
    expect(phaseSignal(1000, 900, "done")).toBe("ok");
    expect(phaseSignal(1000, 900, "in-progress")).toBe("bijna");
    expect(phaseSignal(1000, 1100, "done")).toBe("over");
  });
});

describe("analyzePhaseCosts", () => {
  it("telt begroot en besteed per fase op", () => {
    const a = mkPhase("a", 1);
    const b = mkPhase("b", 2);
    const result = analyzePhaseCosts(
      [a, b],
      [mkBudget(1000, "a"), mkBudget(500, "a"), mkBudget(2000, "b")],
      [mkExpense(300, "a"), mkExpense(2500, "b")],
    );
    expect(result[0]).toMatchObject({ begroot: 1500, besteed: 300, verschil: 1200, signal: "ok" });
    expect(result[0].pct).toBeCloseTo(20);
    expect(result[1]).toMatchObject({ begroot: 2000, besteed: 2500, verschil: -500, signal: "over" });
    expect(result[1].pct).toBeCloseTo(125);
  });

  it("sorteert op fase-volgorde", () => {
    const result = analyzePhaseCosts([mkPhase("b", 2), mkPhase("a", 1)], [], []);
    expect(result.map((r) => r.phase.id)).toEqual(["a", "b"]);
  });

  it("negeert regels zonder fase in de per-fase-lijst", () => {
    const result = analyzePhaseCosts([mkPhase("a", 1)], [mkBudget(1000)], [mkExpense(400)]);
    expect(result[0].begroot).toBe(0);
    expect(result[0].besteed).toBe(0);
  });

  it("pct is 100 bij uitgaven zonder budget", () => {
    const result = analyzePhaseCosts([mkPhase("a", 1)], [], [mkExpense(400, "a")]);
    expect(result[0].pct).toBe(100);
    expect(result[0].signal).toBe("over");
  });
});

describe("forecastProjectCosts", () => {
  it("gebruikt werkelijk besteed voor afgeronde fases", () => {
    // Fase a done: begroot 1000, besteed 800 → telt als 800 (meevaller).
    const f = forecastProjectCosts(
      [mkPhase("a", 1, "done")],
      [mkBudget(1000, "a")],
      [mkExpense(800, "a")],
    );
    expect(f.prognose).toBe(800);
    expect(f.verschil).toBe(200);
  });

  it("gebruikt max(begroot, besteed) voor lopende en komende fases", () => {
    // Fase b in uitvoering: al 1200 besteed op 1000 begroot → 1200.
    // Fase c todo: 500 begroot, niets besteed → 500.
    const f = forecastProjectCosts(
      [mkPhase("b", 1, "in-progress"), mkPhase("c", 2)],
      [mkBudget(1000, "b"), mkBudget(500, "c")],
      [mkExpense(1200, "b")],
    );
    expect(f.prognose).toBe(1700);
    expect(f.verschil).toBe(-200);
  });

  it("telt regels zonder fase mee als max(begroot, besteed)", () => {
    const f = forecastProjectCosts([], [mkBudget(1000)], [mkExpense(1300)]);
    expect(f.begroot).toBe(1000);
    expect(f.besteed).toBe(1300);
    expect(f.prognose).toBe(1300);
    expect(f.verschil).toBe(-300);
  });

  it("geeft nullen zonder data", () => {
    expect(forecastProjectCosts([], [], [])).toEqual({
      begroot: 0, besteed: 0, prognose: 0, verschil: 0,
    });
  });
});
