// Basisontwerp "Verbouw R. de Boer" — schetsontwerp Visser Ontwerpburo (J. Visser,
// nov. 2026), blad 1–3: begane grond 139 m², verdieping 97 m² (80+), gevels.
//
// Interpretatie van de handschetsen (schaal 1:100) naar exacte maten:
//
//   x = lengterichting (links voorhuis → rechts achtergevel/terras), y = diepte.
//
//   • Voorhuis (BESTAAND, handhaven): x 0–6,0 · y 5,2–10,2 (6,0 × 5,0 m).
//     Gevels baksteen zandkleur (Vandersanden Hubertus), trasraam donker
//     (Vandersanden Carbon), kozijnen hout antraciet RAL 7024.
//     Goot 3,00 (300+), nok 6,30 (630+), dakpannen antraciet, nok in x-richting.
//   • Achterhuis/schuur (NIEUW): x 4,8–15,0 · y 0–11,4. Gevels zwart hout op
//     een donker trasraam, dak edelriet naturel met aluminium nok RAL 7024,
//     45°, dakrand 1,80 (180+), nok ±7,9 (805+). Aan de voorkant een steil
//     wolfseind dat schuin naar achteren loopt.
//     Ingang + badkamer in de uitbouw x 4,8–6,0 onder hetzelfde rieten dak.
//   • Overdekt terras onder doorgezet dak: x 15,0–17,4 (240), eiken spant.
//   • Verdieping (+2,90): kamers tussen de knieschotten op y 1,8–9,6 (780),
//     glazen achtergevel met balkon boven het terras.
//
//   Controle: 10,2×5,2 + 9,0×6,2 + 6,0×5,0 = 138,8 m² ≈ 139 m² (BG). ✔
//
// Kleuren van de stenen zijn benaderingen op basis van de productnamen; de
// productnaam staat bij de gevelafwerking zodat je het later kunt verfijnen.

import { getDB } from "../db/db";
import { newId, type TableName } from "../db/repo";
import type {
  Entity,
  Beam,
  Column,
  Dormer,
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

// Ophogen bij elke inhoudelijke wijziging van het ontwerp: de app biedt dan
// aan om het opgeslagen ontwerp bij te werken.
// v1: eerste versie · v2: rieten dak + wolfseind, antraciet pannen, gevels volgens schetsen
export const ONTWERP_VERSIE = 2;

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

const RAL_7024 = "#45494e"; // grafietgrijs (kozijnen, nok)
const RIET = "#94825f"; // edelriet naturel
const PANNEN_ANTRACIET = "#3d4043";
const HUBERTUS_KLEUR = "#c7ad86";

const CARBON_TRAS = { height: 0.5, color: "#2e2c2b", mortarColor: "#3b3936", product: "Vandersanden Carbon" };

const HUBERTUS: FacadeFinish = {
  kind: "brick",
  color: HUBERTUS_KLEUR,
  mortarColor: "#d6cfc2",
  product: "Vandersanden Hubertus (zandkleur)",
  plinth: CARBON_TRAS,
};

const HOUT_ZWART: FacadeFinish = {
  kind: "boards-v",
  color: "#232425",
  mortarColor: "rgba(0,0,0,0.7)",
  product: "Houten gevelbekleding zwart",
  plinth: { ...CARBON_TRAS, height: 0.45 },
};

// ── Maatvoering ─────────────────────────────────────────────────────────────

const F2 = 2.9; // vloerpeil verdieping
const DEPTH = 11.4; // diepte achterhuis
const OVERHANG = 0.4;
const TAN = 1.0; // 45°
const ROOF_BASE = 1.8; // dakrand (onderkant riet bij de overstek), "180+"
const EAVE = ROOF_BASE + OVERHANG * TAN; // dakvlak boven de gevellijn y=0 / y=11,4 = 2,2
const RIDGE = EAVE + (DEPTH / 2) * TAN; // ≈ 7,9 m ("805+")
// Wolfseind aan de voorkant: dakrand x=4,4 (4,8 − overstek), onderrand schild
// op 2,50 m, nok begint 1,80 m verder naar achteren.
const HIP_X = 4.8 - OVERHANG;
const HIP_FOOT = 2.5;
const HIP_RUN = 1.8;

const VH_EAVE = 3.0; // voorhuis goot (300+)
const VH_RIDGE = 6.3; // voorhuis nok (630+)
const VH_TAN = (VH_RIDGE - VH_EAVE) / 2.5;

// Absolute hoogte van de onderkant van het hoofddak op punt (x, y).
const roofAbs = (x: number, y: number) =>
  Math.min(EAVE + Math.min(y, DEPTH - y) * TAN, HIP_FOOT + Math.max(0, x - HIP_X) * ((RIDGE - HIP_FOOT) / HIP_RUN));
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

type WallOpts = {
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

  wall(start: Point, end: Point, opts: WallOpts) {
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

  // Asrechte muur onder het hoofddak: de kop volgt het dakvlak (incl. het
  // wolfseind) met `CLEAR` speling en wordt afgetopt op `cap`. De muur wordt
  // gesplitst op de knikpunten van dat profiel.
  roofWall(start: Point, end: Point, levelElev: number, cap: number, opts: Omit<WallOpts, "height" | "heightEnd">) {
    const L = Math.hypot(end.x - start.x, end.y - start.y);
    const at = (s: number): Point => ({ x: start.x + ((end.x - start.x) * s) / L, y: start.y + ((end.y - start.y) * s) / L });
    const h = (s: number) => {
      const p = at(s);
      return Math.min(cap, roofAbs(p.x, p.y) - levelElev - CLEAR);
    };
    const step = 0.02;
    const n = Math.max(2, Math.ceil(L / step));
    const ss = Array.from({ length: n + 1 }, (_, i) => (L * i) / n);
    const hs = ss.map(h);
    const cuts = [0];
    for (let i = 1; i < n; i++) {
      const d2 = hs[i + 1] - 2 * hs[i] + hs[i - 1];
      if (Math.abs(d2) > 1e-4 && ss[i] - cuts[cuts.length - 1] > 0.08) cuts.push(ss[i]);
    }
    if (L - cuts[cuts.length - 1] < 0.08) cuts.pop();
    cuts.push(L);
    const horizontal = Math.abs(end.y - start.y) < 1e-6;
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = at(cuts[i]);
      const b = at(cuts[i + 1]);
      const lo = horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
      const hi = horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
      const ha = h(cuts[i]);
      const hb = h(cuts[i + 1]);
      this.wall(a, b, {
        ...opts,
        height: ha,
        heightEnd: Math.abs(ha - hb) > 0.01 ? hb : undefined,
        openings: (opts.openings ?? []).filter((o) => o.at >= lo && o.at < hi),
      });
    }
  }
}

// ── Hoofdfunctie ────────────────────────────────────────────────────────────

const PROJECT_TABLES: TableName[] = [
  "walls", "openings", "rooms", "electrical", "plumbing", "hvac", "furniture",
  "stairs", "columns", "beams", "roofs", "dormers", "sections",
];

// Het ontwerp wordt eerst in het geheugen opgebouwd en daarna in één
// transactie met bulkPut weggeschreven: snel, en de live-queries (2D/3D)
// verversen maar één keer.
let buffer: Map<TableName, Entity[]> | null = null;

function mk<T extends Entity>(name: TableName, data: Omit<T, "id" | "updatedAt">): T {
  if (!buffer) throw new Error("mk() buiten laadOntwerpDeBoer");
  const e = { ...data, id: newId(), updatedAt: Date.now() } as T;
  const list = buffer.get(name) ?? [];
  list.push(e);
  buffer.set(name, list);
  return e;
}

/**
 * Vervangt alle verdiepingen + geometrie van het project door het ontwerp.
 * Fasering, kosten, taken en materialen blijven staan.
 */
export async function laadOntwerpDeBoer(projectId: string): Promise<{ groundLevelId: string }> {
  const db = getDB();

  // 1. Bepaal wat er weg moet: oude verdiepingen + alles wat eraan hangt.
  const oldLevels = await db.levels.where("projectId").equals(projectId).toArray();
  const levelIds = new Set(oldLevels.map((l) => l.id));
  const wallIds = new Set((await db.walls.toArray()).filter((w) => levelIds.has(w.levelId)).map((w) => w.id));
  const roofIds = new Set((await db.roofs.toArray()).filter((r) => levelIds.has(r.levelId)).map((r) => r.id));
  const toDelete = new Map<TableName, string[]>();
  for (const t of PROJECT_TABLES) {
    const rows = (await (db[t] as unknown as { toArray(): Promise<Record<string, unknown>[]> }).toArray()).filter(
      (r) =>
        (typeof r.levelId === "string" && levelIds.has(r.levelId)) ||
        (typeof r.wallId === "string" && wallIds.has(r.wallId)) ||
        (typeof r.roofId === "string" && roofIds.has(r.roofId)),
    );
    toDelete.set(t, rows.map((r) => r.id as string));
  }

  // 2. Nieuw ontwerp opbouwen in het geheugen.
  buffer = new Map();
  let out: Map<TableName, Entity[]>;
  let groundLevelId: string;
  try {
    const bg = mk<Level>("levels", { projectId, name: "Begane grond", elevation: 0, height: F2, order: 1 });
    const vd = mk<Level>("levels", { projectId, name: "Verdieping", elevation: F2, height: 2.6, order: 2 });
    bouwBeganeGrond(bg.id);
    bouwVerdieping(vd.id);
    groundLevelId = bg.id;
    out = buffer;
  } finally {
    buffer = null;
  }

  // 3. In één transactie vervangen (alleen Dexie-bewerkingen in de transactie).
  const allTables = [db.projects, db.levels, ...PROJECT_TABLES.map((t) => db[t])];
  await db.transaction("rw", allTables, async () => {
    for (const [t, ids] of toDelete) if (ids.length) await (db[t] as unknown as { bulkDelete(k: string[]): Promise<void> }).bulkDelete(ids);
    if (levelIds.size) await db.levels.bulkDelete([...levelIds]);
    for (const [t, rows] of out) await (db[t] as unknown as { bulkPut(r: Entity[]): Promise<unknown> }).bulkPut(rows);
    await db.projects.update(projectId, {
      name: "Verbouw R. de Boer",
      description: "Woonboerderij: voorhuis handhaven, achterhuis opnieuw opbouwen. " + ONTWERP_NAAM,
      ontwerpVersie: ONTWERP_VERSIE,
      updatedAt: Date.now(),
    });
  });

  return { groundLevelId };
}

function persist(b: Build) {
  const ids: string[] = [];
  for (const w of b.walls) ids.push(mk<Wall>("walls", w).id);
  for (const { wallIdx, o } of b.openings) mk<Opening>("openings", { ...o, wallId: ids[wallIdx] });
}

function rect(x0: number, y0: number, x1: number, y1: number): Point[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

function room(levelId: string, name: string, func: string, polygon: Point[], extra: Partial<Room> = {}) {
  mk<Room>("rooms", { levelId, name, func, polygon, ...extra });
}

function meubel(levelId: string, kind: FurnitureKind, x: number, y: number, rotation = 0, extra: Partial<Furniture> = {}) {
  mk<Furniture>("furniture", { levelId, kind, position: { x, y }, rotation, ...extra });
}

function sanitair(levelId: string, fixture: FixtureKind, x: number, y: number, heightZ = 0) {
  mk<PlumbingItem>("plumbing", { levelId, type: "fixture", fixture, position: { x, y }, heightZ });
}

function staander(levelId: string, x: number, y: number, size: number, height: number, material: WallMaterial = "timber-frame", color?: string) {
  mk<Column>("columns", { levelId, position: { x, y }, shape: "square", size, height, material, loadBearing: true, color });
}

function eiken(levelId: string, a: Point, b: Point, h0: number, h1?: number, depth = 0.25) {
  mk<Beam>("beams", { levelId, start: a, end: b, profile: "custom", height: h0, heightEnd: h1, material: "oak", width: 0.2, depth });
}

function dakraam(roofId: string, x: number, y: number, width = 0.78, height = 1.18) {
  mk<Dormer>("dormers", { roofId, type: "velux", position: { x, y }, width, height });
}

// ── Begane grond ────────────────────────────────────────────────────────────

function bouwBeganeGrond(levelId: string) {
  const b = new LevelBuilder(levelId);
  const IN = { x: 10, y: 6 }; // punt binnen het achterhuis
  const IN_VH = { x: 2, y: 7.7 }; // punt binnen het voorhuis
  const houtExt = { thickness: 0.3, material: "timber-frame" as const, status: "new" as const, loadBearing: true, facade: HOUT_ZWART, inside: IN };
  const steenExt = { thickness: 0.33, material: "brick" as const, status: "existing" as const, loadBearing: true, facade: HUBERTUS, inside: IN_VH };
  const binnen = { thickness: 0.1, material: "gypsum" as const, status: "new" as const };
  const HOOG = 99; // muur loopt door tot onder het dak

  // ── Achterhuis ──
  // Zijgevel 1 (y=0): lage gevel onder de rieten dakrand, 4 kleine ramen
  const klein = (at: number): OpeningSpec => ({ at, type: "window", width: 0.6, height: 0.6, sill: 1.0 });
  b.roofWall({ x: 4.8, y: 0 }, { x: 15.0, y: 0 }, 0, HOOG, { ...houtExt, openings: [klein(6.5), klein(8.9), klein(11.0), klein(13.6)] });
  // Zijgevel 2 (y=11,4): raamstrook zithoek + raam eethoek
  b.roofWall({ x: 15.0, y: DEPTH }, { x: 6.0, y: DEPTH }, 0, HOOG, {
    ...houtExt,
    openings: [
      { at: 8.2, type: "window", width: 2.6, height: 1.05, sill: 0.6 },
      { at: 12.85, type: "window", width: 0.7, height: 1.05, sill: 0.6 },
    ],
  });
  // Voorgevel uitbouw (x=4,8) onder het wolfseind: glazen voordeur + zijlicht
  b.roofWall({ x: 4.8, y: 0 }, { x: 4.8, y: 5.2 }, 0, HOOG, {
    ...houtExt,
    openings: [
      { at: 3.85, type: "door", width: 1.0, height: 2.2, glazed: true },
      { at: 4.65, type: "window", width: 0.45, height: 1.75, sill: 0.45 },
    ],
  });
  // Achtergevel BG (x=15): glazen puien tussen de spanten + terrasdeuren
  b.roofWall({ x: 15.0, y: 0 }, { x: 15.0, y: DEPTH }, 0, F2, {
    ...houtExt,
    openings: [
      { at: 2.6, type: "window", width: 3.4, height: 2.3, sill: 0.1 },
      { at: 5.7, type: "door", width: 2.0, height: 2.3, glazed: true },
      { at: 8.8, type: "window", width: 3.4, height: 2.3, sill: 0.1 },
    ],
  });
  // Buitenhoek naast het voorhuis (x=6, y 10,2–11,4)
  b.roofWall({ x: 6.0, y: 10.2 }, { x: 6.0, y: DEPTH }, 0, HOOG, houtExt);

  // ── Voorhuis (bestaand) ──
  // Voorgevel (x=0): dubbel raam met dicht paneel ertussen, smal raam rechts,
  // smal raam in de top onder de schoorsteen.
  b.wall({ x: 0, y: 10.2 }, { x: 0, y: 5.2 }, {
    ...steenExt, height: VH_EAVE, gablePeak: VH_RIDGE - VH_EAVE,
    openings: [
      { at: 7.05, type: "window", width: 0.75, height: 1.9, sill: 0.5 },
      { at: 7.7, type: "window", width: 0.55, height: 1.9, sill: 0.5, glazed: false },
      { at: 8.35, type: "window", width: 0.75, height: 1.9, sill: 0.5 },
      { at: 9.5, type: "window", width: 0.5, height: 1.9, sill: 0.5 },
      { at: 7.7, type: "window", width: 0.3, height: 1.2, sill: 3.6 },
    ],
  });
  // Zijgevel 1 (y=5,2): hoog raam
  b.wall({ x: 0, y: 5.2 }, { x: 4.8, y: 5.2 }, {
    ...steenExt, height: VH_EAVE,
    openings: [{ at: 1.8, type: "window", width: 0.9, height: 2.0, sill: 0.5 }],
  });
  // Zijgevel 2 (y=10,2): twee hoge ramen
  b.wall({ x: 6.0, y: 10.2 }, { x: 0, y: 10.2 }, {
    ...steenExt, height: VH_EAVE,
    openings: [
      { at: 1.8, type: "window", width: 0.85, height: 2.0, sill: 0.5 },
      { at: 4.6, type: "window", width: 0.85, height: 2.0, sill: 0.5 },
    ],
  });
  // Oude achtergevel voorhuis (nu binnenmuur naar de zithoek)
  b.wall({ x: 6.0, y: 5.2 }, { x: 6.0, y: 10.2 }, {
    thickness: 0.33, material: "brick", status: "existing", loadBearing: true, height: F2,
    openings: [{ at: 9.2, type: "door", width: 0.9, height: 2.1 }],
  });

  // ── Binnenwanden ──
  b.roofWall({ x: 4.8, y: 2.8 }, { x: 15.0, y: 2.8 }, 0, F2, {
    ...binnen,
    openings: [
      { at: 5.6, type: "door", width: 0.8, height: 2.1 },
      { at: 8.1, type: "door", width: 0.8, height: 2.1 },
      { at: 10.3, type: "door", width: 0.8, height: 2.1 },
      { at: 12.9, type: "door", width: 0.9, height: 2.1 },
    ],
  });
  for (const x of [7.0, 9.2, 11.4]) b.roofWall({ x, y: 0 }, { x, y: 2.8 }, 0, F2, binnen);
  b.roofWall({ x: 4.8, y: 5.2 }, { x: 6.0, y: 5.2 }, 0, F2, { ...binnen, openings: [{ at: 5.4, type: "door", width: 0.8, height: 2.1 }] });
  b.wall({ x: 6.0, y: 5.4 }, { x: 9.2, y: 5.4 }, { ...binnen, height: F2 }); // trapwand
  b.wall({ x: 3.7, y: 5.2 }, { x: 3.7, y: 10.2 }, { ...binnen, height: F2, openings: [{ at: 6.1, type: "door", width: 0.8, height: 2.1 }] });
  persist(b);

  // ── Ruimtes ──
  const tegel = { floorMaterial: "tile" as const, wallColor: "#f4f2ee" };
  const hout = { floorMaterial: "wood" as const };
  const open = { noCeiling: true };
  room(levelId, "Badkamer", "badkamer", rect(4.8, 0, 7.0, 2.8), { ...tegel, ...open });
  room(levelId, "T. (toilet)", "toilet", rect(7.0, 0, 9.2, 2.8), { ...tegel, ...open });
  room(levelId, "W. (was/bijkeuken)", "bijkeuken", rect(9.2, 0, 11.4, 2.8), { ...tegel, ...open });
  room(levelId, "H. (hobby/werkruimte)", "werkruimte", rect(11.4, 0, 15.0, 2.8), { ...hout, ...open });
  room(levelId, "E. (entree/hal)", "hal", rect(4.8, 2.8, 6.2, 5.2), { floorMaterial: "stone", ...open });
  room(levelId, "Trap / doorloop", "verkeer", rect(6.2, 2.8, 9.2, 5.4), { ...hout, ...open });
  room(levelId, "K. (keuken)", "keuken", rect(9.2, 2.8, 15.0, 5.4), { floorMaterial: "stone", ...open });
  room(levelId, "Zithoek", "woonkamer", rect(6.0, 5.4, 10.2, DEPTH), { ...hout, ...open });
  room(levelId, "Eethoek", "eetkamer", rect(10.2, 5.4, 15.0, DEPTH), { ...hout, ...open });
  room(levelId, "SL/K (slaapkamer)", "slaapkamer", rect(0, 5.2, 3.7, 10.2), hout);
  room(levelId, "Gang voorhuis", "verkeer", rect(3.7, 5.2, 6.0, 10.2), { floorMaterial: "stone" });
  room(levelId, "Terras (overdekt)", "terras", rect(15.0, 0, 17.4, DEPTH), { floorMaterial: "wood", color: "#8a7356", noCeiling: true });

  // ── Trappen ──
  mk<Staircase>("stairs", { levelId, kind: "straight", position: { x: 6.2, y: 5.4 }, width: 1.0, run: 3.0, steps: 15, rotation: 270, direction: "up" });
  mk<Staircase>("stairs", { levelId, kind: "straight", position: { x: 4.75, y: 9.7 }, width: 0.85, run: 3.0, steps: 15, rotation: 180, direction: "up" });

  // ── Constructie ──
  // Eiken staanders in de woonkeuken
  for (const [x, y] of [[10.2, 4.6], [13.4, 4.6], [10.2, 6.9], [13.4, 6.9]]) staander(levelId, x, y, 0.2, F2);
  // Eiken spant aan de buitenkant van het terras (achtergevel): staanders,
  // trekbalk, schuine spantbenen en makelaar (koningsstijl)
  const XS = 17.25;
  for (const y of [1.0, 4.6, 6.8, 10.4]) staander(levelId, XS, y, 0.2, roofAbs(XS, y) - CLEAR - 0.05);
  eiken(levelId, { x: XS, y: 0.55 }, { x: XS, y: DEPTH - 0.55 }, 2.35);
  eiken(levelId, { x: XS, y: 0.5 }, { x: XS, y: DEPTH / 2 }, roofAbs(XS, 0.5) - 0.3, RIDGE - 0.35, 0.22);
  eiken(levelId, { x: XS, y: DEPTH / 2 }, { x: XS, y: DEPTH - 0.5 }, RIDGE - 0.35, roofAbs(XS, DEPTH - 0.5) - 0.3, 0.22);
  staander(levelId, XS, DEPTH / 2, 0.2, RIDGE - 0.4);
  // Schoorsteen voorhuis (op de nok bij de voorgevel)
  staander(levelId, 0.45, 7.7, 0.55, VH_RIDGE + 0.8, "brick", HUBERTUS_KLEUR);

  // ── Daken ──
  const hoofddak = mk<Roof>("roofs", {
    levelId, type: "gable", pitch: 45, ridgeDirection: 0, overhang: OVERHANG,
    polygon: rect(4.8, 0, 17.4, DEPTH), baseHeight: ROOF_BASE, gableEnds: false,
    hipStart: { run: HIP_RUN, foot: HIP_FOOT - ROOF_BASE },
    covering: "reed", color: RIET, ridgeColor: RAL_7024,
    product: "Edelriet naturel, nok aluminium RAL 7024",
  });
  const voorhuisdak = mk<Roof>("roofs", {
    levelId, type: "gable", pitch: (Math.atan(VH_TAN) * 180) / Math.PI, ridgeDirection: 0, overhang: 0.3,
    polygon: rect(0, 5.2, 6.0, 10.2), baseHeight: VH_EAVE - 0.3 * VH_TAN, gableEnds: false,
    covering: "tiles", color: PANNEN_ANTRACIET, ridgeColor: "#2f3133",
    product: "Dakpannen antraciet",
  });
  // Dakramen (zijgevels 1 en 2)
  dakraam(hoofddak.id, 10.4, 1.95);
  dakraam(hoofddak.id, 8.4, DEPTH - 1.95);
  dakraam(voorhuisdak.id, 1.9, 6.35, 0.55, 0.78);
  dakraam(voorhuisdak.id, 1.9, 9.05, 0.55, 0.78);

  // ── Inrichting (indicatief, volgens de schets) ──
  meubel(levelId, "kitchen-island", 11.8, 4.75, 0, { width: 3.0, depth: 1.0 });
  for (let i = 0; i < 5; i++) meubel(levelId, "kitchen-base", 11.9 + i * 0.6, 3.15, 180);
  meubel(levelId, "kitchen-high", 14.95 - 0.35, 3.15, 180);
  meubel(levelId, "dining-table", 12.6, 8.6, 0, { width: 2.2, depth: 1.0 });
  for (const dx of [-0.7, 0, 0.7]) {
    meubel(levelId, "dining-chair", 12.6 + dx, 7.9, 180);
    meubel(levelId, "dining-chair", 12.6 + dx, 9.3, 0);
  }
  meubel(levelId, "sofa-l", 7.8, 9.9, 0);
  meubel(levelId, "coffee-table", 8.0, 8.3, 0);
  meubel(levelId, "tv-unit", 6.45, 8.0, 90);
  meubel(levelId, "bed-double", 1.3, 7.7, 90);
  meubel(levelId, "wardrobe", 3.25, 9.3, 270);
  meubel(levelId, "desk", 13.2, 1.4, 0);
  sanitair(levelId, "toilet", 5.3, 0.45);
  sanitair(levelId, "sink", 6.5, 0.4, 0.85);
  sanitair(levelId, "shower", 5.4, 2.1);
  sanitair(levelId, "toilet", 8.1, 0.45);
  sanitair(levelId, "sink", 8.9, 0.4, 0.85);
  sanitair(levelId, "washing-machine", 9.8, 0.45);
  sanitair(levelId, "boiler", 10.8, 0.4, 1.2);
}

// ── Verdieping ──────────────────────────────────────────────────────────────

function bouwVerdieping(levelId: string) {
  const b = new LevelBuilder(levelId);
  const IN = { x: 10, y: 6 };
  const binnen = { thickness: 0.1, material: "gypsum" as const, status: "new" as const };
  const HOOG = 99;

  // Achtergevel: topgevel in zwart hout met glas in het midden (tussen de
  // eiken stijlen) en een balkondeur.
  const y0 = (F2 + CLEAR * Math.SQRT2 - EAVE) / TAN;
  const y1 = DEPTH - y0;
  const peak = RIDGE - F2 - CLEAR * Math.SQRT2;
  const half = (y1 - y0) / 2;
  const triTop = (d: number) => 0.02 + (peak - 0.02) * (1 - d / half);
  const mid = DEPTH / 2;
  b.wall({ x: 15.0, y: y0 }, { x: 15.0, y: y1 }, {
    thickness: 0.25, material: "timber-frame", status: "new", loadBearing: true, facade: HOUT_ZWART, inside: IN,
    height: 0.02, gablePeak: peak - 0.02,
    openings: [
      { at: mid, type: "door", width: 1.0, height: 2.2, glazed: true },
      { at: mid, type: "window", width: 1.0, sill: 2.4, height: triTop(0.5) - 0.3 - 2.4 },
      { at: mid - 0.9, type: "window", width: 0.6, sill: 0.1, height: triTop(1.2) - 0.35 - 0.1 },
      { at: mid + 0.9, type: "window", width: 0.6, sill: 0.1, height: triTop(1.2) - 0.35 - 0.1 },
    ],
  });

  // Knieschotten (80+ lijnen) op y=1,8 en y=9,6 en onder het wolfseind (x=4,8)
  b.roofWall({ x: 4.8, y: 1.8 }, { x: 15.0, y: 1.8 }, F2, HOOG, binnen);
  b.roofWall({ x: 15.0, y: 9.6 }, { x: 4.8, y: 9.6 }, F2, HOOG, binnen);
  b.roofWall({ x: 4.8, y: 1.8 }, { x: 4.8, y: 9.6 }, F2, HOOG, binnen);

  // Indeling
  const CAP = 2.6;
  b.roofWall({ x: 4.8, y: 4.3 }, { x: 12.5, y: 4.3 }, F2, CAP, {
    ...binnen,
    openings: [
      { at: 7.0, type: "passage", width: 1.2, height: 2.1 },
      { at: 10.8, type: "door", width: 0.8, height: 2.1 },
    ],
  });
  b.roofWall({ x: 8.2, y: 1.8 }, { x: 8.2, y: 4.3 }, F2, CAP, binnen);
  b.roofWall({ x: 12.5, y: 1.8 }, { x: 12.5, y: 9.6 }, F2, CAP, {
    ...binnen,
    openings: [
      { at: 4.75, type: "door", width: 0.8, height: 2.1 },
      { at: 5.65, type: "door", width: 0.7, height: 2.1 },
    ],
  });
  b.roofWall({ x: 12.5, y: 5.2 }, { x: 15.0, y: 5.2 }, F2, CAP, binnen);
  b.roofWall({ x: 7.0, y: 6.1 }, { x: 12.5, y: 6.1 }, F2, CAP, {
    ...binnen,
    openings: [
      { at: 9.0, type: "door", width: 0.8, height: 2.1 },
      { at: 11.85, type: "door", width: 0.6, height: 2.1 },
    ],
  });
  b.roofWall({ x: 7.0, y: 6.1 }, { x: 7.0, y: 9.6 }, F2, CAP, binnen);
  b.roofWall({ x: 11.2, y: 6.1 }, { x: 11.2, y: 9.6 }, F2, CAP, binnen);

  // Balkon boven het terras: borstwering zwart hout
  const balk = { thickness: 0.05, material: "timber-frame" as const, status: "new" as const, height: 1.0, facade: { ...HOUT_ZWART, plinth: undefined }, inside: { x: 16.2, y: 5.7 } };
  b.wall({ x: 15.15, y: 4.7 }, { x: 17.1, y: 4.7 }, balk);
  b.wall({ x: 17.1, y: 4.7 }, { x: 17.1, y: 6.7 }, balk);
  b.wall({ x: 17.1, y: 6.7 }, { x: 15.15, y: 6.7 }, balk);
  persist(b);

  const open = { noCeiling: true, floorMaterial: "wood" as const };
  room(levelId, "V. (vide/overloop)", "verkeer", rect(4.8, 1.8, 8.2, 4.3), open);
  room(levelId, "B. (badkamer)", "badkamer", rect(8.2, 1.8, 12.5, 4.3), { noCeiling: true, floorMaterial: "tile", wallColor: "#f4f2ee" });
  room(levelId, "SL.1", "slaapkamer", rect(12.5, 1.8, 15.0, 5.2), open);
  room(levelId, "SL.2", "slaapkamer", rect(12.5, 5.2, 15.0, 9.6), open);
  room(levelId, "SL.3", "slaapkamer", rect(7.0, 6.1, 11.2, 9.6), open);
  room(levelId, "K. (kast)", "berging", rect(11.2, 6.1, 12.5, 9.6), open);
  // Overloop rondom het trapgat (x 6,2–9,2 · y 4,4–5,4)
  room(levelId, "Overloop", "verkeer", [
    { x: 4.8, y: 4.3 }, { x: 12.5, y: 4.3 }, { x: 12.5, y: 6.1 }, { x: 7.0, y: 6.1 }, { x: 7.0, y: 9.6 },
    { x: 4.8, y: 9.6 }, { x: 4.8, y: 5.4 }, { x: 9.2, y: 5.4 }, { x: 9.2, y: 4.4 }, { x: 4.8, y: 4.4 },
  ], open);
  room(levelId, "Berging (zolder voorhuis)", "berging", rect(0.2, 5.4, 4.7, 10.0), { noCeiling: true, floorMaterial: "wood" });
  room(levelId, "Balkon", "buiten", rect(15.0, 4.7, 17.1, 6.7), { noCeiling: true, floorMaterial: "wood", color: "#8a7356" });

  meubel(levelId, "bed-double", 13.75, 3.6, 0);
  meubel(levelId, "bed-double", 13.75, 7.6, 180);
  meubel(levelId, "bed-double", 9.1, 8.3, 180);
  meubel(levelId, "wardrobe", 10.6, 6.5, 0);
  meubel(levelId, "bathtub", 9.5, 2.3, 0);
  sanitair(levelId, "toilet", 8.55, 3.6);
  sanitair(levelId, "sink", 11.6, 2.6, 0.85);
  sanitair(levelId, "sink", 11.6, 3.4, 0.85);
  sanitair(levelId, "shower", 11.0, 3.8);
}
