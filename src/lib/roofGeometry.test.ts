import { describe, expect, it } from "vitest";
import type { Roof } from "./domain/types";
import {
  buildRoof,
  cutRoofHoles,
  dormerHoles,
  roofFootprint,
  type RoofFootprint,
  type RoofMesh,
} from "./roofGeometry";

/** Oppervlakte van alle driehoeken samen — de maat waarmee we een gat meten. */
function meshArea(m: RoofMesh): number {
  let sum = 0;
  for (let i = 0; i < m.indices.length; i += 3) {
    const p = (k: number) => {
      const j = m.indices[i + k] * 3;
      return [m.positions[j], m.positions[j + 1], m.positions[j + 2]] as const;
    };
    const [ax, ay, az] = p(0);
    const [bx, by, bz] = p(1);
    const [cx, cy, cz] = p(2);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    sum += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return sum;
}

const gable: Roof = {
  id: "r1",
  levelId: "l1",
  type: "gable",
  pitch: 45,
  ridgeDirection: 0,
  overhang: 0,
  updatedAt: 0,
};

/** Normaal van elke driehoek, in dezelfde volgorde als de indices. */
function faceNormals(m: RoofMesh): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < m.indices.length; i += 3) {
    const p = (k: number) => {
      const j = m.indices[i + k] * 3;
      return [m.positions[j], m.positions[j + 1], m.positions[j + 2]] as const;
    };
    const [ax, ay, az] = p(0);
    const [bx, by, bz] = p(1);
    const [cx, cy, cz] = p(2);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    out.push([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
  }
  return out;
}

describe("buildRoof", () => {
  // Wijzen de normalen naar buiten? Zo niet, dan belicht three het dak van de
  // verkeerde kant en zie je het dakbeschot aan de buitenkant.
  it.each(["flat", "shed", "gable", "hip", "mansard"] as const)(
    "%s: geen enkele normaal wijst naar beneden",
    (type) => {
      for (const [, ny] of faceNormals(buildRoof(type, 8, 10, 45, 0.5))) {
        expect(ny).toBeGreaterThanOrEqual(-1e-9);
      }
    },
  );

  it("zadeldak: het z+ vlak kijkt naar buiten en omhoog", () => {
    const normals = faceNormals(buildRoof("gable", 8, 10, 45, 0));
    // Er moet minstens één vlak zijn dat zowel omhoog als naar +z kijkt,
    // en één dat omhoog en naar −z kijkt: de twee dakschilden.
    expect(normals.some(([, y, z]) => y > 0 && z > 0)).toBe(true);
    expect(normals.some(([, y, z]) => y > 0 && z < 0)).toBe(true);
  });
});

describe("cutRoofHoles", () => {
  it("laat de mesh met rust als er geen gaten zijn", () => {
    const m = buildRoof("gable", 8, 10, 45, 0);
    expect(cutRoofHoles(m, [])).toBe(m);
  });

  it("snijdt precies het schuine oppervlak van de uitsparing weg", () => {
    // Plat dak: de uitsparing ligt in het vlak, dus het verschil is exact
    // de oppervlakte van de rechthoek.
    const m = buildRoof("flat", 8, 10, 3, 0);
    const before = meshArea(m);
    const cut = cutRoofHoles(m, [{ x0: -1, x1: 1, z0: -0.5, z1: 0.5 }]);
    expect(before - meshArea(cut)).toBeCloseTo(2 * 1, 6);
  });

  it("houdt op een 45°-zadeldak rekening met de helling", () => {
    // Op 45° is elke horizontale meter √2 m dakvlak: een gat van 2 × 1 m in
    // bovenaanzicht kost 2·1·√2 m² dakvlak.
    const m = buildRoof("gable", 8, 10, 45, 0);
    const before = meshArea(m);
    const cut = cutRoofHoles(m, [{ x0: -1, x1: 1, z0: 1, z1: 2 }]);
    expect(before - meshArea(cut)).toBeCloseTo(2 * 1 * Math.SQRT2, 4);
  });

  it("verwerkt meerdere gaten zonder overlap te dubbeltellen", () => {
    const m = buildRoof("flat", 10, 10, 3, 0);
    const before = meshArea(m);
    const cut = cutRoofHoles(m, [
      { x0: -2, x1: 0, z0: -1, z1: 1 },
      { x0: 1, x1: 3, z0: -1, z1: 1 },
    ]);
    expect(before - meshArea(cut)).toBeCloseTo(2 * (2 * 2), 6);
  });

  it("laat het dak heel als het gat er helemaal buiten valt", () => {
    const m = buildRoof("flat", 8, 10, 3, 0);
    const before = meshArea(m);
    const cut = cutRoofHoles(m, [{ x0: 20, x1: 22, z0: 0, z1: 1 }]);
    expect(meshArea(cut)).toBeCloseTo(before, 6);
  });

  it("houdt positions en uvs in de pas", () => {
    const cut = cutRoofHoles(buildRoof("gable", 8, 10, 45, 0), [
      { x0: -1, x1: 1, z0: 1, z1: 2 },
    ]);
    expect(cut.uvs.length / 2).toBe(cut.positions.length / 3);
    expect(cut.indices.every((i) => i < cut.positions.length / 3)).toBe(true);
  });
});

describe("dormerHoles", () => {
  const fp: RoofFootprint = { W: 8, D: 10, center: { x: 0, y: 0 } };

  it("negeert een velux — die ligt ín het dakvlak", () => {
    expect(
      dormerHoles(gable, fp, [
        {
          id: "d1",
          roofId: "r1",
          type: "velux",
          position: { x: 0, y: 2 },
          width: 1,
          height: 1,
          updatedAt: 0,
        },
      ]),
    ).toEqual([]);
  });

  it("zet een dakkapel om in een rechthoek in het lokale dakstelsel", () => {
    const [h] = dormerHoles(gable, fp, [
      {
        id: "d1",
        roofId: "r1",
        type: "gable-dormer",
        position: { x: 1, y: 2 },
        width: 2,
        height: 1.5,
        updatedAt: 0,
      },
    ]);
    expect(h.x0).toBeCloseTo(0);
    expect(h.x1).toBeCloseTo(2);
    expect(h.z0).toBeCloseTo(2 - 0.55);
    expect(h.z1).toBeCloseTo(2 + 0.55);
  });

  it("volgt de nokrichting", () => {
    // Nok 90° gedraaid: een kapel op (0, 3) belandt lokaal op de x-as.
    const [h] = dormerHoles({ ...gable, ridgeDirection: 90 }, fp, [
      {
        id: "d1",
        roofId: "r1",
        type: "shed-dormer",
        position: { x: 0, y: 3 },
        width: 2,
        height: 1.5,
        updatedAt: 0,
      },
    ]);
    expect((h.x0 + h.x1) / 2).toBeCloseTo(-3);
    expect((h.z0 + h.z1) / 2).toBeCloseTo(0);
  });
});

describe("roofFootprint", () => {
  const wall = (x1: number, y1: number, x2: number, y2: number) => ({
    id: `${x1}${y1}${x2}${y2}`,
    levelId: "l1",
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    thickness: 0.1,
    height: 2.5,
    material: "brick" as const,
    loadBearing: true,
    status: "new" as const,
    updatedAt: 0,
  });

  it("gebruikt de bounding box van de muren", () => {
    const fp = roofFootprint(gable, [wall(0, 0, 8, 0), wall(8, 0, 8, 10)]);
    expect(fp).toEqual({ W: 8, D: 10, center: { x: 4, y: 5 } });
  });

  it("geeft voorrang aan een ingevulde dakvoet-polygoon", () => {
    const fp = roofFootprint(
      { ...gable, polygon: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }] },
      [wall(0, 0, 100, 100)],
    );
    expect(fp).toEqual({ W: 4, D: 4, center: { x: 2, y: 2 } });
  });

  it("geeft null zonder muren", () => {
    expect(roofFootprint(gable, [])).toBeNull();
  });
});
