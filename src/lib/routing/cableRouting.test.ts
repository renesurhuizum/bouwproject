// Tests voor de kabelroutering. De getallen hieronder zijn met de hand
// narekenbaar — dat is het punt: de gebruiker koopt hierop in.

import { describe, expect, it } from "vitest";
import { computeCircuitRoutes } from "./cableRouting";
import {
  CABLE_PANEL_TAIL_M,
  CABLE_SLACK_PER_POINT_M,
  CABLE_WASTE_FACTOR,
} from "../domain/constants";
import type { ElectricalCircuit, ElectricalItem, Level, Wall } from "../domain/types";

const level: Level = {
  id: "bg", updatedAt: 0, projectId: "p", name: "Begane grond",
  elevation: 0, height: 2.6, order: 1,
};

const upper: Level = {
  id: "v1", updatedAt: 0, projectId: "p", name: "Verdieping",
  elevation: 2.8, height: 2.5, order: 2,
};

function wall(id: string, x1: number, y1: number, x2: number, y2: number, levelId = "bg"): Wall {
  return {
    id, updatedAt: 0, levelId,
    start: { x: x1, y: y1 }, end: { x: x2, y: y2 },
    thickness: 0.1, height: 2.6, material: "brick",
    loadBearing: false, status: "existing",
  };
}

function item(
  id: string,
  x: number,
  y: number,
  over: Partial<ElectricalItem> = {},
): ElectricalItem {
  return {
    id, updatedAt: 0, levelId: "bg", type: "socket",
    position: { x, y }, heightZ: 0.3, circuitId: "c1", ...over,
  };
}

const circuit: ElectricalCircuit = {
  id: "c1", updatedAt: 0, projectId: "p", number: "1", name: "Groep 1",
  breaker: "B16", cableSpec: "3×2,5 mm²", color: "#000",
  panelId: "panel", routeAt: "ceiling",
};

// L-vormig plan: muur langs y=0 van x=0..10, en muur langs x=10 van y=0..10.
const lShape = [wall("w1", 0, 0, 10, 0), wall("w2", 10, 0, 10, 10)];

describe("computeCircuitRoutes", () => {
  it("routeert langs de muren, niet hemelsbreed", () => {
    const panel = item("panel", 0, 0, { type: "panel", heightZ: 1.5 });
    const socket = item("s1", 10, 10);
    const [route] = computeCircuitRoutes({
      circuits: [circuit],
      items: [panel, socket],
      walls: lShape,
      levels: [level],
    });

    // Horizontaal langs de muren: 10 m + 10 m = 20 m (hemelsbreed zou 14,1 zijn).
    // Verticaal: kast 2,6 − 1,5 = 1,1 omhoog; stopcontact 2,6 − 0,3 = 2,3 omlaag.
    expect(route.measuredM).toBeCloseTo(20 + 1.1 + 2.3, 2);
    expect(route.unroutedItemIds).toEqual([]);
  });

  it("telt speling, kaststaart en snijverlies bij de inkooplengte op", () => {
    const panel = item("panel", 0, 0, { type: "panel", heightZ: 1.5 });
    const socket = item("s1", 10, 10);
    const [route] = computeCircuitRoutes({
      circuits: [circuit],
      items: [panel, socket],
      walls: lShape,
      levels: [level],
    });

    const expected =
      (route.measuredM + 1 * CABLE_SLACK_PER_POINT_M + CABLE_PANEL_TAIL_M) * CABLE_WASTE_FACTOR;
    expect(route.purchaseM).toBeCloseTo(Math.round(expected * 100) / 100, 2);
    // De inkooplengte moet altijd ruimer zijn dan de gemeten lengte.
    expect(route.purchaseM).toBeGreaterThan(route.measuredM);
  });

  it("rijgt meerdere punten aan één ketting vanaf de kast", () => {
    const panel = item("panel", 0, 0, { type: "panel", heightZ: 1.5 });
    const [route] = computeCircuitRoutes({
      circuits: [circuit],
      items: [panel, item("s1", 3, 0), item("s2", 7, 0), item("s3", 10, 0)],
      walls: lShape,
      levels: [level],
    });

    // Volgorde: dichtstbijzijnde eerst, dus 3 → 7 → 10.
    expect(route.items.map((r) => r.itemId)).toEqual(["s1", "s2", "s3"]);
    // Horizontaal totaal blijft 10 m: de kabel loopt door, niet heen en weer.
    const horizontal = route.items.reduce((s, r) => s + r.horizontalM, 0);
    expect(horizontal).toBeCloseTo(10, 2);
  });

  it("rekent een stub mee voor een punt dat los in de ruimte hangt", () => {
    const panel = item("panel", 0, 0, { type: "panel", heightZ: 1.5 });
    // Plafondlicht 2 m van de muur af, op 5 m langs de muur.
    const light = item("l1", 5, 2, { type: "light", heightZ: 2.6 });
    const [route] = computeCircuitRoutes({
      circuits: [circuit],
      items: [panel, light],
      walls: lShape,
      levels: [level],
    });

    // 5 m langs de muur + 2 m loodrecht ernaartoe.
    const leg = route.items.find((r) => r.itemId === "l1")!;
    expect(leg.horizontalM).toBeCloseTo(7, 2);
    // Lichtpunt zit op plafondhoogte, dus geen stijgstuk.
    expect(leg.verticalM).toBeCloseTo(0, 2);
  });

  it("gebruikt een handmatig getekend traject als dat er is", () => {
    const panel = item("panel", 0, 0, { type: "panel", heightZ: 1.5 });
    const socket = item("s1", 10, 0, {
      path: [{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: 10, y: 4 }],
    });
    const [route] = computeCircuitRoutes({
      circuits: [circuit],
      items: [panel, socket],
      walls: lShape,
      levels: [level],
    });

    const leg = route.items.find((r) => r.itemId === "s1")!;
    expect(leg.manual).toBe(true);
    expect(leg.horizontalM).toBeCloseTo(14, 2); // 4 + 10
  });

  it("telt het verdiepingsverschil mee bij een punt op een andere laag", () => {
    const panel = item("panel", 0, 0, { type: "panel", heightZ: 1.5 });
    const upstairs = item("s1", 0, 0, { levelId: "v1", heightZ: 0.3 });
    const [route] = computeCircuitRoutes({
      circuits: [circuit],
      items: [panel, upstairs],
      walls: [...lShape, wall("w3", 0, 0, 10, 0, "v1")],
      levels: [level, upper],
    });

    const leg = route.items.find((r) => r.itemId === "s1")!;
    // 2,5 (route-hoogte verdieping) − 0,3 = 2,2, plus 2,8 verdiepingsverschil.
    expect(leg.verticalM).toBeCloseTo(2.2 + 2.8, 2);
  });

  it("valt terug op hemelsbreed als er geen muren zijn, en meldt dat", () => {
    const panel = item("panel", 0, 0, { type: "panel", heightZ: 1.5 });
    const socket = item("s1", 3, 4);
    const [route] = computeCircuitRoutes({
      circuits: [circuit],
      items: [panel, socket],
      walls: [],
      levels: [level],
    });

    const leg = route.items.find((r) => r.itemId === "s1")!;
    expect(leg.horizontalM).toBeCloseTo(5, 2);
    expect(route.unroutedItemIds).toContain("s1");
  });

  it("geeft een lege route voor een groep zonder punten", () => {
    const [route] = computeCircuitRoutes({
      circuits: [circuit], items: [], walls: lShape, levels: [level],
    });
    expect(route.measuredM).toBe(0);
    expect(route.purchaseM).toBe(0);
    expect(route.items).toEqual([]);
  });

  it("negeert punten van een andere groep", () => {
    const panel = item("panel", 0, 0, { type: "panel", heightZ: 1.5 });
    const mine = item("s1", 5, 0);
    const other = item("s2", 9, 0, { circuitId: "c2" });
    const [route] = computeCircuitRoutes({
      circuits: [circuit],
      items: [panel, mine, other],
      walls: lShape,
      levels: [level],
    });
    expect(route.items.map((r) => r.itemId)).toEqual(["s1"]);
  });
});
