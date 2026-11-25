// Vangnet voor de kozijnstaat-nummering (D01/R01/P01). Deze codes staan op de
// werktekeningen én worden straks de sleutel voor latei-regels in de takeoff,
// dus de nummering moet stabiel blijven.

import { describe, expect, it } from "vitest";
import { buildOpeningSchedule } from "./openingSchedule";
import type { Opening, OpeningType } from "./domain/types";

function opening(
  id: string,
  type: OpeningType,
  offset: number,
  over: Partial<Opening> = {},
): Opening {
  return {
    id, updatedAt: 0, wallId: "w1", type,
    width: 0.9, height: 2.1, sillHeight: 0, offset, ...over,
  };
}

describe("buildOpeningSchedule", () => {
  it("nummert per type met een eigen prefix en twee cijfers", () => {
    const { rows } = buildOpeningSchedule([
      opening("a", "door", 1),
      opening("b", "window", 2),
      opening("c", "passage", 3),
    ]);
    expect(rows.map((r) => r.code)).toEqual(["D01", "P01", "R01"]);
  });

  it("nummert binnen een type oplopend op offset, niet op invoervolgorde", () => {
    const { codeById } = buildOpeningSchedule([
      opening("ver", "door", 9),
      opening("dichtbij", "door", 1),
    ]);
    expect(codeById.get("dichtbij")).toBe("D01");
    expect(codeById.get("ver")).toBe("D02");
  });

  it("geeft een id→code map die overeenkomt met de rijen", () => {
    const { rows, codeById } = buildOpeningSchedule([
      opening("a", "door", 1),
      opening("b", "door", 2),
    ]);
    for (const row of rows) {
      expect(codeById.get(row.id)).toBe(row.code);
    }
  });

  it("neemt de afmetingen over in de rij", () => {
    const { rows } = buildOpeningSchedule([
      opening("a", "window", 1, { width: 1.2, height: 1.4, sillHeight: 0.9 }),
    ]);
    expect(rows[0]).toMatchObject({
      code: "R01", type: "window", width: 1.2, height: 1.4, sillHeight: 0.9, wallId: "w1",
    });
  });

  it("geeft lege uitvoer zonder openingen", () => {
    const { rows, codeById } = buildOpeningSchedule([]);
    expect(rows).toEqual([]);
    expect(codeById.size).toBe(0);
  });
});
