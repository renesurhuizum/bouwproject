import { describe, expect, it } from "vitest";
import type { Phase, PhaseStatus } from "../domain/types";
import { analyzePhases, phaseProgress } from "../phases";

function mkPhase(
  id: string,
  order: number,
  status: PhaseStatus,
  dependsOn: string[] = [],
): Phase {
  return {
    id,
    projectId: "p1",
    name: `Fase ${id}`,
    order,
    status,
    dependsOn,
    updatedAt: 0,
  };
}

describe("analyzePhases", () => {
  it("blokkeert een fase waarvan de voorwaarde nog niet klaar is", () => {
    const a = mkPhase("a", 1, "todo");
    const b = mkPhase("b", 2, "todo", ["a"]);
    const [ra, rb] = analyzePhases([a, b]);

    expect(ra.blocked).toBe(false);
    expect(ra.ready).toBe(true);
    expect(rb.blocked).toBe(true);
    expect(rb.blockedBy).toEqual([a]);
    expect(rb.ready).toBe(false);
  });

  it("geeft een fase vrij zodra alle voorwaarden done zijn", () => {
    const a = mkPhase("a", 1, "done");
    const b = mkPhase("b", 2, "todo", ["a"]);
    const [, rb] = analyzePhases([a, b]);

    expect(rb.blocked).toBe(false);
    expect(rb.ready).toBe(true);
  });

  it("markeert een afgeronde fase nooit als ready", () => {
    const a = mkPhase("a", 1, "done");
    const [ra] = analyzePhases([a]);
    expect(ra.ready).toBe(false);
    expect(ra.blocked).toBe(false);
  });

  it("blokkeert ook bij een voorwaarde die in-progress is", () => {
    const a = mkPhase("a", 1, "in-progress");
    const b = mkPhase("b", 2, "todo", ["a"]);
    const [, rb] = analyzePhases([a, b]);
    expect(rb.blocked).toBe(true);
  });

  it("sorteert het resultaat op order", () => {
    const result = analyzePhases([
      mkPhase("c", 3, "todo"),
      mkPhase("a", 1, "todo"),
      mkPhase("b", 2, "todo"),
    ]);
    expect(result.map((r) => r.phase.id)).toEqual(["a", "b", "c"]);
  });

  it("negeert verwijzingen naar onbekende fases", () => {
    const b = mkPhase("b", 1, "todo", ["bestaat-niet"]);
    const [rb] = analyzePhases([b]);
    expect(rb.blocked).toBe(false);
    expect(rb.ready).toBe(true);
  });
});

describe("phaseProgress", () => {
  it("geeft 0 zonder fases", () => {
    expect(phaseProgress([])).toBe(0);
  });

  it("geeft het aandeel afgeronde fases", () => {
    expect(
      phaseProgress([
        mkPhase("a", 1, "done"),
        mkPhase("b", 2, "todo"),
        mkPhase("c", 3, "in-progress"),
        mkPhase("d", 4, "done"),
      ]),
    ).toBe(0.5);
  });
});
