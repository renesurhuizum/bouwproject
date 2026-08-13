// Vangnet voor de fasering-engine. De blokkeerlogica bepaalt de volgorde-
// bewaking van de hele renovatie; die moet exact blijven werken als er straks
// model-koppeling (elektra klaar vóór wanden dicht) bovenop komt.

import { describe, expect, it } from "vitest";
import { analyzePhases, phaseProgress } from "./phases";
import type { Phase, PhaseStatus } from "./domain/types";

function phase(
  id: string,
  order: number,
  status: PhaseStatus,
  dependsOn: string[] = [],
): Phase {
  return { id, updatedAt: 0, projectId: "p", name: id, order, status, dependsOn };
}

describe("analyzePhases", () => {
  it("sorteert op volgorde, ongeacht invoervolgorde", () => {
    const res = analyzePhases([
      phase("c", 3, "todo"),
      phase("a", 1, "todo"),
      phase("b", 2, "todo"),
    ]);
    expect(res.map((r) => r.phase.id)).toEqual(["a", "b", "c"]);
  });

  it("markeert een fase zonder afhankelijkheden als startklaar", () => {
    const [res] = analyzePhases([phase("a", 1, "todo")]);
    expect(res.blocked).toBe(false);
    expect(res.ready).toBe(true);
  });

  it("blokkeert zolang een voorwaarde niet done is", () => {
    const res = analyzePhases([
      phase("sloop", 1, "in-progress"),
      phase("casco", 2, "todo", ["sloop"]),
    ]);
    const casco = res.find((r) => r.phase.id === "casco")!;
    expect(casco.blocked).toBe(true);
    expect(casco.ready).toBe(false);
    expect(casco.blockedBy.map((p) => p.id)).toEqual(["sloop"]);
  });

  it("deblokkeert zodra alle voorwaarden done zijn", () => {
    const res = analyzePhases([
      phase("sloop", 1, "done"),
      phase("constructief", 2, "done"),
      phase("casco", 3, "todo", ["sloop", "constructief"]),
    ]);
    const casco = res.find((r) => r.phase.id === "casco")!;
    expect(casco.blocked).toBe(false);
    expect(casco.ready).toBe(true);
  });

  it("noemt alleen de nog openstaande voorwaarden", () => {
    const res = analyzePhases([
      phase("elektra", 1, "done"),
      phase("isolatie", 2, "todo"),
      phase("dichtmaken", 3, "todo", ["elektra", "isolatie"]),
    ]);
    const dicht = res.find((r) => r.phase.id === "dichtmaken")!;
    expect(dicht.blockedBy.map((p) => p.id)).toEqual(["isolatie"]);
  });

  it("negeert verwijzingen naar onbekende fases", () => {
    const [res] = analyzePhases([phase("a", 1, "todo", ["bestaat-niet"])]);
    expect(res.blocked).toBe(false);
  });

  it("rekent een afgeronde fase niet als startklaar", () => {
    const [res] = analyzePhases([phase("a", 1, "done")]);
    expect(res.ready).toBe(false);
  });
});

describe("phaseProgress", () => {
  it("geeft 0 bij een lege lijst", () => {
    expect(phaseProgress([])).toBe(0);
  });

  it("geeft het aandeel afgeronde fases", () => {
    expect(
      phaseProgress([
        phase("a", 1, "done"),
        phase("b", 2, "done"),
        phase("c", 3, "todo"),
        phase("d", 4, "in-progress"),
      ]),
    ).toBe(0.5);
  });
});
