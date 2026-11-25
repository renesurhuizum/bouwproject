// Basisontwerp "Verbouw R. de Boer" — schetsontwerp Visser Ontwerpburo (J. Visser,
// nov. 2026), blad 1–3: begane grond 139 m², verdieping 97 m² (80+), gevels.
//
// Interpretatie van de handschetsen (schaal 1:100) naar exacte maten:
//
//   x = lengterichting (links voorhuis → rechts achtergevel/terras), y = diepte.
//
//   • Voorhuis (BESTAAND, handhaven): x 0–6,0 · y 5,2–10,2 (6,0 × 5,0 m).
//     Baksteen (Vandersanden Hubertus) met trasraam (Vandersanden Carbon),
//     goot 3,0 m, nok 6,2 m (dak: pannen mat zwart), nok in x-richting.
//   • Achterhuis (NIEUW, opnieuw opbouwen): x 4,8–15,0 · y 0–11,4.
//     Zwart houten gevelbekleding, kozijnen hout antraciet RAL 7024,
//     zadeldak 45° met dakpanelen RAL 7024, lage goot ±2,6 m, nok ±8,3 m.
//     Ingang + badkamer in de uitbouw x 4,8–6,0 onder hetzelfde dakvlak.
//   • Overdekt terras onder doorgezet dak: x 15,0–17,4 (240), houten staanders.
//   • Verdieping (+2,90): kamers tussen de knieschotten op y 1,8–9,6 (780),
//     glazen achtergevel met balkon boven het terras.
//
//   Controle: 10,2×5,2 + 9,0×6,2 + 6,0×5,0 = 138,8 m² ≈ 139 m² (BG). ✔
//
// Kleuren van de stenen zijn benaderingen op basis van de productnamen; de
// productnaam staat bij de gevelafwerking zodat je het later kunt verfijnen.

import { getDB } from "../db/db";
import { create, type TableName } from "../db/repo";
import type {
  Column,
  FacadeFinish,
  Furniture,
  FurnitureKind,
  Level,
  Opening,
  PlumbingItem,
  FixtureKind,
  Point,
  Roof,
  Room,
  Staircase,
  Wall,
  WallMaterial,
  WallStatus,
} from "../domain/types";

export const ONTWERP_NAAM = "Verbouw R. de Boer — schetsontwerp Visser Ontwerpburo (nov. 2026)";

export const ONTWERP_TEKENINGEN = [
  { src: "/ontwerp/1-begane-grond.jpg", titel: "Begane grond (139 m²)" },
  { src: "/ontwerp/2-verdieping.jpg", titel: "Verdieping (97 m², 80+)" },
  { src: "/ontwerp/3-voorgevel.jpg", titel: "Voorgevel" },
  { src: "/ontwerp/4-zijgevel-1.jpg", titel: "Zijgevel 1" },
  { src: "/ontwerp/5-zijgevel-2.jpg", titel: "Zijgevel 2" },
  { src: "/ontwerp/6-achtergevel.jpg", titel: "Achtergevel" },
];

// ── Materialen ──────────────────────────────────────────────────────────────

const RAL_7024 = "#45494e"; // grafietgrijs (kozijnen, dakpanelen, nok)

const CARBON_TRAS = { height: 0.5, color: "#2e2c2b", mortarColor: "#3b3936", product: "Vandersanden Carbon" };

const HUBERTUS: FacadeFinish = {
  kind: "brick",
  color: "#c7ad86",
  mortarColor: "#d6cfc2",
  product: "Vandersanden Hubertus (zandkleur)",
  plinth: CARBON_TRAS,
};

const HOUT_ZWART: FacadeFinish = {
  kind: "boards-v",
  color: "#232425",
  mortarColor: "rgba(0,0,0,0.7)",
  product: "Houten gevelbekleding zwart",
};

// ── Maatvoering ─────────────────────────────────────────────────────────────

const F2 = 2.9; // vloerpeil verdieping
const DEPTH = 11.4; // diepte achterhuis
const EAVE = 2.6; // hoogte dakvlak boven de gevellijn y=0 / y=11,4 (lage goot)
const TAN = 1.0; // 45°
const RIDGE = EAVE + (DEPTH / 2) * TAN; // ≈ 8,3 m
const OVERHANG = 0.4;

const VH_EAVE = 3.0; // voorhuis goot
const VH_RIDGE = 6.2; // voorhuis nok
const VH_TAN = (VH_RIDGE - VH_EAVE) / 2.5;

// Absolute hoogte van de onderkant van het hoofddak op diepte y.
const roofAbs = (y: number) => EAVE + Math.min(y, DEPTH - y) * TAN;
const CLEAR = 0.2; // speling tussen wandkop en dakvlak (dakpakket)

// ── Builders ────────────────────────────────────────────────────────────────

interface Build {
  walls: Omit<Wall, "id" | "updatedAt">[];
  openings: { wallIdx: number; o: Omit<Opening, "id" | "updatedAt" | "wallId"> }[];
}

type OpeningSpec = {
  at: number; // absolute positie langs de as van de muur (x of y) van het midden
  type: Opening["type"];
  width: number;
  height: number;
  sill?: number;
  glazed?: boolean;
};

function outsideSign(start: Point, end: Point, inside: Point): 1 | -1 {
  const a = Math.atan2(end.y - start.y, end.x - start.x);
  const n = { x: -Math.sin(a), y: Math.cos(a) };
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  return (inside.x - mid.x) * n.x + (inside.y - mid.y) * n.y > 0 ? -1 : 1;
}

class LevelBuilder implements Build {
  walls: Build["walls"] = [];
  openings: Build["openings"] = [];
  constructor(public levelId: string) {}

  wall(
    start: Point,
    end: Point,
    opts: {
      height: number;
      heightEnd?: number;
      gablePeak?: number;
      thickness: number;
      material: WallMaterial;
      status: WallStatus;
      loadBearing?: boolean;
      facade?: FacadeFinish;
      inside?: Point; // punt binnen het gebouw → bepaalt de buitenzijde
      openings?: OpeningSpec[];
    },
  ) {
    const facade = opts.facade
      ? { ...opts.facade, outside: opts.inside ? outsideSign(start, end, opts.inside) : undefined }
      : undefined;
    const idx = this.walls.length;
    this.walls.push({
      levelId: this.levelId,
      start,
      end,
      thickness: opts.thickness,
      height: opts.height,
      heightEnd: opts.heightEnd,
      gablePeak: opts.gablePeak,
      material: opts.material,
      loadBearing: opts.loadBearing ?? false,
      status: opts.status,
      facade,
    });
    const horizontal = Math.abs(end.y - start.y) < 1e-6;
    const s0 = horizontal ? start.x : start.y;
    const dir = horizontal ? Math.sign(end.x - start.x) : Math.sign(end.y - start.y);
    for (const sp of opts.openings ?? []) {
      this.openings.push({
        wallIdx: idx,
        o: {
          type: sp.type,
          width: sp.width,
          height: sp.height,
          sillHeight: sp.sill ?? 0,
          offset: (sp.at - s0) * dir,
          glazed: sp.glazed,
        },
      });
    }
  }

  // Muur loodrecht op de nok (x = const) onder het hoofddak: splitst in een
  // schuin deel (volgt het dakvlak) en een recht deel (max `cap`).
  perpWall(
    x: number,
    y0: number,
    y1: number,
    levelElev: number,
    cap: number,
    opts: Omit<Parameters<LevelBuilder["wall"]>[2], "height" | "heightEnd">,
  ) {
    const h = (y: number) => Math.min(cap, roofAbs(y) - levelElev - CLEAR);
    const flatFrom = cap + levelElev + CLEAR - EAVE; // y waarop het dak `cap` bereikt
    const cuts = [y0, y1];
    for (const c of [flatFrom / TAN, DEPTH - flatFrom / TAN]) if (c > Math.min(y0, y1) + 0.05 && c < Math.max(y0, y1) - 0.05) cuts.push(c);
    const sorted = [...new Set(cuts)].sort((a, b) => (y1 >= y0 ? a - b : b - a));
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const ops = (opts.openings ?? []).filter((o) => o.at >= lo && o.at < hi);
      const ha = h(a);
      const hb = h(b);
      this.wall({ x, y: a }, { x, y: b }, {
        ...opts,
        height: ha,
        heightEnd: Math.abs(ha - hb) > 0.01 ? hb : undefined,
        openings: ops,
      });
    }
  }
}

// ── Hoofdfunctie ────────────────────────────────────────────────────────────

const PROJECT_TABLES: TableName[] = [
  "walls", "openings", "rooms", "electrical", "plumbing", "hvac", "furniture",
  "stairs", "columns", "beams", "roofs", "dormers",
];

/**
 * Vervangt alle verdiepingen + geometrie van het project door het ontwerp.
 * Fasering, kosten, taken en materialen blijven staan.
 */
export async function laadOntwerpDeBoer(projectId: string): Promise<{ groundLevelId: string }> {
  const db = getDB();

  // 1. Oude verdiepingen + alles wat eraan hangt hard verwijderen.
  const oldLevels = await db.levels.where("projectId").equals(projectId).toArray();
  const levelIds = new Set(oldLevels.map((l) => l.id));
  const oldWalls = (await db.walls.toArray()).filter((w) => levelIds.has(w.levelId));
  const wallIds = new Set(oldWalls.map((w) => w.id));
  const oldRoofs = (await db.roofs.toArray()).filter((r) => levelIds.has(r.levelId));
  const roofIds = new Set(oldRoofs.map((r) => r.id));
  await db.transaction("rw", [db.levels, ...PROJECT_TABLES.map((t) => db[t])], async () => {
    for (const t of PROJECT_TABLES) {
      const table = db[t] as unknown as { toArray(): Promise<Record<string, unknown>[]>; bulkDelete(k: string[]): Promise<void> };
      const rows = await table.toArray();
      const del = rows
        .filter((r) =>
          (typeof r.levelId === "string" && levelIds.has(r.levelId)) ||
          (typeof r.wallId === "string" && wallIds.has(r.wallId)) ||
          (typeof r.roofId === "string" && roofIds.has(r.roofId)),
        )
        .map((r) => r.id as string);
      if (del.length) await table.bulkDelete(del);
    }
    await db.levels.bulkDelete([...levelIds]);
  });

  // 2. Verdiepingen
  const bg = await create<Level>("levels", { projectId, name: "Begane grond", elevation: 0, height: F2, order: 1 });
  const vd = await create<Level>("levels", { projectId, name: "Verdieping", elevation: F2, height: 2.6, order: 2 });

  await bouwBeganeGrond(bg.id);
  await bouwVerdieping(vd.id);

  await db.projects.update(projectId, {
    name: "Verbouw R. de Boer",
    description: "Woonboerderij: voorhuis handhaven, achterhuis opnieuw opbouwen. " + ONTWERP_NAAM,
    updatedAt: Date.now(),
  });

  return { groundLevelId: bg.id };
}

async function persist(b: Build) {
  const ids: string[] = [];
  for (const w of b.walls) ids.push((await create<Wall>("walls", w)).id);
  for (const { wallIdx, o } of b.openings) await create<Opening>("openings", { ...o, wallId: ids[wallIdx] });
}

function rect(x0: number, y0: number, x1: number, y1: number): Point[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

async function room(levelId: string, name: string, func: string, polygon: Point[], extra: Partial<Room> = {}) {
  await create<Room>("rooms", { levelId, name, func, polygon, ...extra });
}

async function meubel(levelId: string, kind: FurnitureKind, x: number, y: number, rotation = 0, extra: Partial<Furniture> = {}) {
  await create<Furniture>("furniture", { levelId, kind, position: { x, y }, rotation, ...extra });
}

async function sanitair(levelId: string, fixture: FixtureKind, x: number, y: number, heightZ = 0) {
  await create<PlumbingItem>("plumbing", { levelId, type: "fixture", fixture, position: { x, y }, heightZ });
}

async function staander(levelId: string, x: number, y: number, size: number, height: number, material: WallMaterial = "timber-frame") {
  await create<Column>("columns", { levelId, position: { x, y }, shape: "square", size, height, material, loadBearing: true });
}

// ── Begane grond ────────────────────────────────────────────────────────────

async function bouwBeganeGrond(levelId: string) {
  const b = new LevelBuilder(levelId);
  const IN = { x: 10, y: 6 }; // punt binnen het achterhuis
  const IN_VH = { x: 2, y: 7.7 }; // punt binnen het voorhuis
  const houtExt = { thickness: 0.3, material: "timber-frame" as const, status: "new" as const, loadBearing: true, facade: HOUT_ZWART };
  const steenExt = { thickness: 0.33, material: "brick" as const, status: "existing" as const, loadBearing: true, facade: HUBERTUS, inside: IN_VH };
  const binnen = { thickness: 0.1, material: "gypsum" as const, status: "new" as const };

  // Achterhuis — gevel y=0 (zijgevel 1): lage goot met 4 kleine ramen
  const klein = (at: number): OpeningSpec => ({ at, type: "window", width: 0.6, height: 0.7, sill: 1.05 });
  b.wall({ x: 4.8, y: 0 }, { x: 15.0, y: 0 }, { ...houtExt, height: EAVE - CLEAR, inside: IN, openings: [klein(5.5), klein(8.1), klein(10.3), klein(13.2)] });
  // Gevel y=11,4 (zijgevel 2): schuifpui zithoek + raam eethoek
  b.wall({ x: 15.0, y: DEPTH }, { x: 6.0, y: DEPTH }, {
    ...houtExt, height: EAVE - CLEAR, inside: IN,
    openings: [
      { at: 8.2, type: "door", width: 2.8, height: 2.2, glazed: true },
      { at: 12.9, type: "window", width: 1.4, height: 1.2, sill: 0.8 },
    ],
  });
  // Uitbouw ingang/badkamer: kopgevel x=4,8 (voorgevel, links)
  b.perpWall(4.8, 0, 5.2, 0, F2, {
    ...houtExt, inside: IN,
    openings: [
      { at: 1.6, type: "window", width: 0.6, height: 0.6, sill: 1.5 },
      { at: 4.2, type: "door", width: 1.0, height: 2.2 },
    ],
  });
  // Achtergevel x=15 (terras): glazen puien + deuren
  b.perpWall(15.0, 0, DEPTH, 0, F2, {
    ...houtExt, inside: IN,
    openings: [
      { at: 2.55, type: "window", width: 3.5, height: 2.4, sill: 0.1 },
      { at: 5.7, type: "door", width: 2.0, height: 2.4, glazed: true },
      { at: 8.85, type: "window", width: 3.5, height: 2.4, sill: 0.1 },
    ],
  });
  // Achterhuis x=6 tussen y 10,2 en 11,4 (buitenhoek naast voorhuis)
  b.perpWall(6.0, 10.2, DEPTH, 0, F2, { ...houtExt, inside: IN });

  // Voorhuis (bestaand) — kopgevel x=0 met topgevel
  b.wall({ x: 0, y: 10.2 }, { x: 0, y: 5.2 }, {
    ...steenExt, height: VH_EAVE, gablePeak: VH_RIDGE - VH_EAVE,
    openings: [
      { at: 8.7, type: "window", width: 1.0, height: 1.4, sill: 0.8 },
      { at: 6.7, type: "window", width: 1.0, height: 1.4, sill: 0.8 },
      { at: 7.7, type: "window", width: 0.5, height: 0.9, sill: 3.9 }, // zolderraam
    ],
  });
  b.wall({ x: 0, y: 5.2 }, { x: 4.8, y: 5.2 }, {
    ...steenExt, height: VH_EAVE,
    openings: [{ at: 1.8, type: "window", width: 1.2, height: 1.4, sill: 0.8 }],
  });
  b.wall({ x: 6.0, y: 10.2 }, { x: 0, y: 10.2 }, {
    ...steenExt, height: VH_EAVE,
    openings: [
      { at: 1.7, type: "window", width: 1.2, height: 1.4, sill: 0.8 },
      { at: 4.3, type: "door", width: 0.9, height: 2.1 },
    ],
  });
  // Oude achtergevel voorhuis (nu binnenmuur naar de zithoek)
  b.wall({ x: 6.0, y: 5.2 }, { x: 6.0, y: 10.2 }, {
    thickness: 0.33, material: "brick", status: "existing", loadBearing: true, height: F2,
    openings: [{ at: 9.2, type: "door", width: 0.9, height: 2.1 }],
  });

  // Binnenwanden
  b.wall({ x: 4.8, y: 2.8 }, { x: 15.0, y: 2.8 }, {
    ...binnen, height: F2,
    openings: [
      { at: 5.6, type: "door", width: 0.8, height: 2.1 },
      { at: 8.1, type: "door", width: 0.8, height: 2.1 },
      { at: 10.3, type: "door", width: 0.8, height: 2.1 },
      { at: 12.9, type: "door", width: 0.9, height: 2.1 },
    ],
  });
  for (const x of [7.0, 9.2, 11.4]) b.perpWall(x, 0, 2.8, 0, F2, binnen);
  b.wall({ x: 4.8, y: 5.2 }, { x: 6.0, y: 5.2 }, { ...binnen, height: F2, openings: [{ at: 5.4, type: "door", width: 0.8, height: 2.1 }] });
  b.wall({ x: 6.0, y: 5.4 }, { x: 9.2, y: 5.4 }, { ...binnen, height: F2 }); // trapwand
  b.wall({ x: 3.7, y: 5.2 }, { x: 3.7, y: 10.2 }, { ...binnen, height: F2, openings: [{ at: 6.1, type: "door", width: 0.8, height: 2.1 }] });
  await persist(b);

  // Ruimtes
  const tegel = { floorMaterial: "tile" as const, wallColor: "#f4f2ee" };
  const hout = { floorMaterial: "wood" as const };
  const open = { noCeiling: true };
  await room(levelId, "Badkamer", "badkamer", rect(4.8, 0, 7.0, 2.8), { ...tegel, ...open });
  await room(levelId, "T. (toilet)", "toilet", rect(7.0, 0, 9.2, 2.8), { ...tegel, ...open });
  await room(levelId, "W. (was/bijkeuken)", "bijkeuken", rect(9.2, 0, 11.4, 2.8), { ...tegel, ...open });
  await room(levelId, "H. (hobby/werkruimte)", "werkruimte", rect(11.4, 0, 15.0, 2.8), { ...hout, ...open });
  await room(levelId, "E. (entree/hal)", "hal", rect(4.8, 2.8, 6.2, 5.2), { floorMaterial: "stone", ...open });
  await room(levelId, "Trap / doorloop", "verkeer", rect(6.2, 2.8, 9.2, 5.4), { ...hout, ...open });
  await room(levelId, "K. (keuken)", "keuken", rect(9.2, 2.8, 15.0, 5.4), { floorMaterial: "stone", ...open });
  await room(levelId, "Zithoek", "woonkamer", rect(6.0, 5.4, 10.2, DEPTH), { ...hout, ...open });
  await room(levelId, "Eethoek", "eetkamer", rect(10.2, 5.4, 15.0, DEPTH), { ...hout, ...open });
  await room(levelId, "SL/K (slaapkamer)", "slaapkamer", rect(0, 5.2, 3.7, 10.2), hout);
  await room(levelId, "Gang voorhuis", "verkeer", rect(3.7, 5.2, 6.0, 10.2), { floorMaterial: "stone" });
  await room(levelId, "Terras (overdekt)", "terras", rect(15.0, 0, 17.4, DEPTH), { floorMaterial: "wood", color: "#8a7356", noCeiling: true });

  // Trappen
  await create<Staircase>("stairs", { levelId, kind: "straight", position: { x: 6.2, y: 5.4 }, width: 1.0, run: 3.0, steps: 15, rotation: 270, direction: "up" });
  await create<Staircase>("stairs", { levelId, kind: "straight", position: { x: 4.75, y: 9.7 }, width: 0.85, run: 3.0, steps: 15, rotation: 180, direction: "up" });

  // Eiken spanten (staanders) in de woonkeuken + terrasstaanders tot onder het dak
  for (const [x, y] of [[10.2, 4.6], [13.4, 4.6], [10.2, 6.9], [13.4, 6.9]]) await staander(levelId, x, y, 0.2, F2);
  for (const y of [1.2, 4.6, 6.9, 10.2]) await staander(levelId, 17.1, y, 0.18, roofAbs(y) - CLEAR);
  // Schoorsteen voorhuis (op de nok bij de kopgevel)
  await staander(levelId, 0.6, 7.7, 0.55, VH_RIDGE + 0.8, "brick");

  // Daken
  await create<Roof>("roofs", {
    levelId, type: "gable", pitch: 45, ridgeDirection: 0, overhang: OVERHANG,
    polygon: rect(4.8, 0, 17.4, DEPTH), baseHeight: EAVE - OVERHANG * TAN, gableEnds: false,
    color: RAL_7024, product: "Dakpanelen RAL 7024, nok aluminium RAL 7024",
  });
  await create<Roof>("roofs", {
    levelId, type: "gable", pitch: (Math.atan(VH_TAN) * 180) / Math.PI, ridgeDirection: 0, overhang: 0.3,
    polygon: rect(0, 5.2, 6.0, 10.2), baseHeight: VH_EAVE - 0.3 * VH_TAN, gableEnds: false,
    color: "#2b2b2c", product: "Dakpannen mat zwart",
  });

  // Inrichting (indicatief, volgens de schets)
  await meubel(levelId, "kitchen-island", 11.8, 4.75, 0, { width: 3.0, depth: 1.0 });
  for (let i = 0; i < 5; i++) await meubel(levelId, "kitchen-base", 11.9 + i * 0.6, 3.15, 180);
  await meubel(levelId, "kitchen-high", 14.95 - 0.35, 3.15, 180);
  await meubel(levelId, "dining-table", 12.6, 8.6, 0, { width: 2.2, depth: 1.0 });
  for (const dx of [-0.7, 0, 0.7]) {
    await meubel(levelId, "dining-chair", 12.6 + dx, 7.9, 180);
    await meubel(levelId, "dining-chair", 12.6 + dx, 9.3, 0);
  }
  await meubel(levelId, "sofa-l", 7.8, 9.9, 0);
  await meubel(levelId, "coffee-table", 8.0, 8.3, 0);
  await meubel(levelId, "tv-unit", 6.45, 8.0, 90);
  await meubel(levelId, "bed-double", 1.3, 7.7, 90);
  await meubel(levelId, "wardrobe", 3.25, 9.3, 270);
  await meubel(levelId, "desk", 13.2, 1.4, 0);
  await sanitair(levelId, "toilet", 5.3, 0.45);
  await sanitair(levelId, "sink", 6.5, 0.4, 0.85);
  await sanitair(levelId, "shower", 5.4, 2.1);
  await sanitair(levelId, "toilet", 8.1, 0.45);
  await sanitair(levelId, "sink", 8.9, 0.4, 0.85);
  await sanitair(levelId, "washing-machine", 9.8, 0.45);
  await sanitair(levelId, "boiler", 10.8, 0.4, 1.2);
}

// ── Verdieping ──────────────────────────────────────────────────────────────

async function bouwVerdieping(levelId: string) {
  const b = new LevelBuilder(levelId);
  const IN = { x: 10, y: 6 };
  const binnen = { thickness: 0.1, material: "gypsum" as const, status: "new" as const };
  const peak = RIDGE - F2 - CLEAR * Math.SQRT2; // topgevel boven de vloer (onder het dakpakket)

  // Kopgevels: driehoek vanaf de vloer (dak snijdt vloer op y=0,7 en y=10,7)
  const y0 = (F2 + CLEAR * Math.SQRT2 - EAVE) / TAN;
  const y1 = DEPTH - y0;
  b.wall({ x: 4.8, y: y1 }, { x: 4.8, y: y0 }, {
    thickness: 0.25, material: "timber-frame", status: "new", loadBearing: true, facade: HOUT_ZWART, inside: IN,
    height: 0.02, gablePeak: peak - 0.02,
    openings: [
      { at: 5.7, type: "window", width: 0.5, height: 1.5, sill: 2.4 }, // smal raam in de top
      { at: 7.0, type: "door", width: 0.8, height: 2.0 }, // naar de berging (voorhuiszolder)
    ],
  });
  // Achtergevel: glazen topgevel tussen eiken spanten + balkondeur
  const half = (y1 - y0) / 2;
  const triTop = (d: number) => 0.02 + (peak - 0.02) * (1 - d / half);
  const panelen: OpeningSpec[] = [{ at: 5.7, type: "door", width: 1.0, height: 2.3, glazed: true }];
  panelen.push({ at: 5.7, type: "window", width: 0.9, sill: 2.55, height: Math.max(0.4, triTop(0.5) - 0.25 - 2.55) });
  for (let k = 1; k <= 4; k++) {
    for (const sgn of [-1, 1]) {
      const d = k * 1.05 + 0.45;
      const hgt = triTop(d) - 0.25 - 0.1;
      if (hgt > 0.5) panelen.push({ at: 5.7 + sgn * k * 1.05, type: "window", width: 0.9, height: hgt, sill: 0.1 });
    }
  }
  b.wall({ x: 15.0, y: y0 }, { x: 15.0, y: y1 }, {
    thickness: 0.25, material: "timber-frame", status: "new", loadBearing: true, facade: HOUT_ZWART, inside: IN,
    height: 0.02, gablePeak: peak - 0.02, openings: panelen,
  });

  // Knieschotten (80+ lijnen) op y=1,8 en y=9,6
  const knie = roofAbs(1.8) - F2 - CLEAR;
  b.wall({ x: 4.8, y: 1.8 }, { x: 15.0, y: 1.8 }, { ...binnen, height: knie });
  b.wall({ x: 15.0, y: 9.6 }, { x: 4.8, y: 9.6 }, { ...binnen, height: knie });

  // Indeling
  const CAP = 2.6;
  b.wall({ x: 4.8, y: 4.3 }, { x: 12.5, y: 4.3 }, {
    ...binnen, height: CAP,
    openings: [
      { at: 7.0, type: "passage", width: 1.2, height: 2.1 },
      { at: 10.8, type: "door", width: 0.8, height: 2.1 },
    ],
  });
  b.perpWall(8.2, 1.8, 4.3, F2, CAP, binnen);
  b.perpWall(12.5, 1.8, 9.6, F2, CAP, {
    ...binnen,
    openings: [
      { at: 4.75, type: "door", width: 0.8, height: 2.1 },
      { at: 5.65, type: "door", width: 0.7, height: 2.1 },
    ],
  });
  b.wall({ x: 12.5, y: 5.2 }, { x: 15.0, y: 5.2 }, { ...binnen, height: CAP });
  b.wall({ x: 7.0, y: 6.1 }, { x: 12.5, y: 6.1 }, {
    ...binnen, height: CAP,
    openings: [
      { at: 9.0, type: "door", width: 0.8, height: 2.1 },
      { at: 11.85, type: "door", width: 0.6, height: 2.1 },
    ],
  });
  b.perpWall(7.0, 6.1, 9.6, F2, CAP, binnen);
  b.perpWall(11.2, 6.1, 9.6, F2, CAP, binnen);

  // Balkon boven het terras: borstwering zwart hout
  const balk = { thickness: 0.05, material: "timber-frame" as const, status: "new" as const, height: 1.0, facade: HOUT_ZWART, inside: { x: 16.2, y: 5.7 } };
  b.wall({ x: 15.15, y: 4.7 }, { x: 17.2, y: 4.7 }, balk);
  b.wall({ x: 17.2, y: 4.7 }, { x: 17.2, y: 6.7 }, balk);
  b.wall({ x: 17.2, y: 6.7 }, { x: 15.15, y: 6.7 }, balk);
  await persist(b);

  const open = { noCeiling: true, floorMaterial: "wood" as const };
  await room(levelId, "V. (vide/overloop)", "verkeer", rect(4.8, 1.8, 8.2, 4.3), open);
  await room(levelId, "B. (badkamer)", "badkamer", rect(8.2, 1.8, 12.5, 4.3), { noCeiling: true, floorMaterial: "tile", wallColor: "#f4f2ee" });
  await room(levelId, "SL.1", "slaapkamer", rect(12.5, 1.8, 15.0, 5.2), open);
  await room(levelId, "SL.2", "slaapkamer", rect(12.5, 5.2, 15.0, 9.6), open);
  await room(levelId, "SL.3", "slaapkamer", rect(7.0, 6.1, 11.2, 9.6), open);
  await room(levelId, "K. (kast)", "berging", rect(11.2, 6.1, 12.5, 9.6), open);
  // Overloop rondom het trapgat (x 6,2–9,2 · y 4,4–5,4)
  await room(levelId, "Overloop", "verkeer", [
    { x: 4.8, y: 4.3 }, { x: 12.5, y: 4.3 }, { x: 12.5, y: 6.1 }, { x: 7.0, y: 6.1 }, { x: 7.0, y: 9.6 },
    { x: 4.8, y: 9.6 }, { x: 4.8, y: 5.4 }, { x: 9.2, y: 5.4 }, { x: 9.2, y: 4.4 }, { x: 4.8, y: 4.4 },
  ], open);
  await room(levelId, "Berging (zolder voorhuis)", "berging", rect(0.2, 5.4, 4.8, 10.0), { noCeiling: true, floorMaterial: "wood" });
  await room(levelId, "Balkon", "buiten", rect(15.0, 4.7, 17.2, 6.7), { noCeiling: true, floorMaterial: "wood", color: "#8a7356" });

  await meubel(levelId, "bed-double", 13.75, 3.6, 0);
  await meubel(levelId, "bed-double", 13.75, 7.6, 180);
  await meubel(levelId, "bed-double", 9.1, 8.3, 180);
  await meubel(levelId, "wardrobe", 10.6, 6.5, 0);
  await meubel(levelId, "bathtub", 9.5, 2.3, 0);
  await sanitair(levelId, "toilet", 8.55, 3.6);
  await sanitair(levelId, "sink", 11.6, 2.6, 0.85);
  await sanitair(levelId, "sink", 11.6, 3.4, 0.85);
  await sanitair(levelId, "shower", 11.0, 3.8);
}
