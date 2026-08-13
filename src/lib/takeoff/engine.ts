// Eén hoeveelheidsengine voor het hele project.
//
// Hiervóór stonden er twee berekeningen naast elkaar die elkaar tegenspraken:
// quantityTakeoff.ts (één verdieping, mét aftrek van sparingen) en
// Materiaal.estimateFromPlan (alle verdiepingen, zónder aftrek). Zelfde muren,
// andere getallen. Deze engine vervangt beide en voegt toe wat ontbrak:
// leidingmeters, kabelmeters, dak- en constructiehoeveelheden — en vooral de
// stap van "gemeten hoeveelheid" naar "wat leg je in het winkelwagentje".
//
// Elke regel draagt een stabiele sourceId, zodat de materiaallijst bijgewerkt
// kan worden zonder dubbele regels bij elke hertekening.

import type {
  Beam,
  ElectricalCircuit,
  ElectricalItem,
  Level,
  Opening,
  PlumbingItem,
  Room,
  Wall,
} from "../domain/types";
import { dist, pathLength, polygonArea } from "../geometry";
import { ARTICLE_BY_KEY, type CatalogArticle } from "./catalog";
import { computeCircuitRoutes } from "../routing/cableRouting";
import { findSection, LINTEL_BEARING_M } from "../structural/sections";
import { BREAKER_SPECS } from "../domain/constants";

export interface PlanModel {
  levels: Level[];
  walls: Wall[];
  rooms: Room[];
  openings: Opening[];
  plumbing: PlumbingItem[];
  electrical: ElectricalItem[];
  circuits: ElectricalCircuit[];
  beams: Beam[];
}

export interface TakeoffLine {
  /** Stabiel over herberekeningen heen; sleutel voor de materiaallijst. */
  sourceId: string;
  articleKey: string;
  name: string;
  unit: string;
  /** Gemeten hoeveelheid. */
  netQty: number;
  /** Inclusief snij-/breukverlies. */
  grossQty: number;
  /** Aantal verpakkingen, als het artikel per pak gaat. */
  packs?: number;
  packName?: string;
  /** Wat je daadwerkelijk koopt (hele verpakkingen, of de brutohoeveelheid). */
  buyQty: number;
  unitPrice?: number;
  totalPrice?: number;
  category: string;
  phaseOrder?: number;
  /** Toelichting op de herkomst van het getal. */
  detail?: string;
}

const VERF_DEKKING_M2_PER_L = 8; // gangbaar voor muurverf, één laag
const VERF_LAGEN = 2;

export function computeTakeoff(model: PlanModel): TakeoffLine[] {
  const acc = new Map<string, { article: CatalogArticle; netQty: number; detail?: string }>();

  function add(articleKey: string, qty: number, detail?: string, suffix = "") {
    if (!(qty > 0)) return;
    const article = ARTICLE_BY_KEY[articleKey];
    if (!article) return;
    const sourceId = suffix ? `${articleKey}:${suffix}` : articleKey;
    const cur = acc.get(sourceId);
    if (cur) cur.netQty += qty;
    else acc.set(sourceId, { article, netQty: qty, detail });
  }

  // ── Wanden ────────────────────────────────────────────────────────────────
  const openingsByWall = new Map<string, Opening[]>();
  for (const op of model.openings) {
    const list = openingsByWall.get(op.wallId) ?? [];
    list.push(op);
    openingsByWall.set(op.wallId, list);
  }
  const levelById = new Map(model.levels.map((l) => [l.id, l]));

  let paintableArea = 0;
  for (const wall of model.walls) {
    if (wall.status === "demolish") continue;
    const length = dist(wall.start, wall.end);
    const height = wall.height > 0 ? wall.height : levelById.get(wall.levelId)?.height ?? 2.6;
    let area = length * height;
    for (const op of openingsByWall.get(wall.id) ?? []) area -= op.width * op.height;
    area = Math.max(0, area);
    paintableArea += area;

    if (wall.status !== "new") continue; // bestaande muren hoef je niet te bouwen

    switch (wall.material) {
      case "gypsum":
      case "timber-frame":
        // Metalstud: gips aan twee zijden, stijlen hart-op-hart 0,6 m.
        add("gipsplaat-1200x2600", area * 2, "beide zijden");
        add("metalstud-profiel", (length / 0.6) * height + length * 2, "stijlen + rails");
        add("montageschroeven", area * 2 * 12, "≈12 schroeven per m²");
        add("isolatie-wand", area);
        break;
      case "sand-lime":
        add("kalkzandsteen-blok", area);
        break;
      case "aerated-concrete":
        add("gasbeton-blok", area);
        break;
      default:
        add("baksteen-metselwerk", area);
    }
  }

  // ── Vloeren, plafonds en afwerking ────────────────────────────────────────
  let floorArea = 0;
  let perimeter = 0;
  for (const room of model.rooms) {
    if (room.polygon.length < 3) continue;
    const area = polygonArea(room.polygon);
    floorArea += area;
    for (let i = 0; i < room.polygon.length; i++) {
      perimeter += dist(room.polygon[i], room.polygon[(i + 1) % room.polygon.length]);
    }
    if (room.floorMaterial) {
      const key = {
        tile: "vloer-tegel",
        wood: "vloer-hout",
        carpet: "vloer-tapijt",
        stone: "vloer-natuursteen",
        concrete: "vloer-beton",
      }[room.floorMaterial];
      add(key, area);
    }
  }
  add("dekvloer", floorArea);
  add("plafond-gipsplaat", floorArea);

  // Plinten: omtrek minus de deurbreedtes (daar komt geen plint).
  const doorWidth = model.openings
    .filter((o) => o.type === "door" || o.type === "passage")
    .reduce((s, o) => s + o.width, 0);
  add("plint", Math.max(0, perimeter - doorWidth));

  // Verf: wandoppervlak omgerekend naar liters bij twee lagen.
  add(
    "muurverf",
    (paintableArea * VERF_LAGEN) / VERF_DEKKING_M2_PER_L,
    `${VERF_LAGEN} lagen, ${VERF_DEKKING_M2_PER_L} m² per liter`,
  );

  // ── Deuren & ramen ────────────────────────────────────────────────────────
  add("binnendeur-set", model.openings.filter((o) => o.type === "door").length);
  add("raam-kozijn", model.openings.filter((o) => o.type === "window").length);
  add("doorgang-afwerking", model.openings.filter((o) => o.type === "passage").length);

  // ── Elektra ───────────────────────────────────────────────────────────────
  const routes = model.circuits.length
    ? computeCircuitRoutes({
        circuits: model.circuits,
        items: model.electrical,
        walls: model.walls,
        levels: model.levels,
      })
    : [];
  const routeById = new Map(routes.map((r) => [r.circuitId, r]));

  let cableMeters = 0;
  for (const circuit of model.circuits) {
    const route = routeById.get(circuit.id);
    if (!route || route.purchaseM <= 0) continue;
    cableMeters += route.purchaseM;
    const spec = BREAKER_SPECS[circuit.breaker];
    const key = CABLE_ARTICLE[spec.cableSpec];
    if (key) add(key, route.purchaseM, undefined, spec.cableSpec);
  }
  // Flexbuis loopt met de kabels mee.
  add("flexbuis-19", cableMeters);

  const points = model.electrical.filter((e) => e.type !== "panel");
  add("inbouwdoos", points.filter((e) => e.type !== "light" && e.type !== "spot").length);
  add("centraaldoos", points.filter((e) => e.type === "light" || e.type === "spot").length);

  // ── Water, afvoer en cv ───────────────────────────────────────────────────
  let bends = 0;
  for (const item of model.plumbing) {
    if (item.type === "fixture" || !item.path || item.path.length < 2) continue;
    const horizontal = pathLength(item.path);
    // Verticale stukken tellen mee: een standleiding is grotendeels verticaal.
    const vertical = Math.abs((item.startZ ?? 0) - (item.endZ ?? 0));
    const meters = horizontal + vertical;
    bends += Math.max(0, item.path.length - 2);

    const diameter = item.diameter ?? 0;
    if (item.type === "drain") {
      add("afvoerbuis", meters, `Ø${diameter} mm`, `${diameter}`);
    } else if (item.type === "cv-pipe") {
      add("cv-leiding", meters, `Ø${diameter} mm`, `${diameter}`);
    } else {
      add("waterleiding", meters, `Ø${diameter} mm`, `${diameter}`);
    }
  }
  add("leidingfitting", bends, "één per knik in een leiding");

  // ── Constructie ───────────────────────────────────────────────────────────
  let steelKg = 0;
  let timberM = 0;
  const addStructural = (profileKey: string, lengthM: number) => {
    const section = findSection(profileKey);
    if (!section) return;
    if (section.material === "steel") steelKg += lengthM * section.weightKgPerM;
    else timberM += lengthM;
  };
  for (const beam of model.beams) addStructural(beam.profile, dist(beam.start, beam.end));
  for (const op of model.openings) {
    if (op.lintelProfile) addStructural(op.lintelProfile, op.width + 2 * LINTEL_BEARING_M);
  }
  add("staalprofiel", steelKg, "balken en lateien");
  add("houten-balk", timberM, "balken en lateien");

  // ── Naar inkoopregels ─────────────────────────────────────────────────────
  return [...acc.entries()]
    .map(([sourceId, { article, netQty, detail }]) => toLine(sourceId, article, netQty, detail))
    .sort(
      (a, b) =>
        (a.phaseOrder ?? 99) - (b.phaseOrder ?? 99) || a.name.localeCompare(b.name),
    );
}

// Kabelspecificatie → catalogusartikel.
const CABLE_ARTICLE: Record<string, string> = {
  "3×1,5 mm²": "kabel-3x1.5",
  "3×2,5 mm²": "kabel-3x2.5",
  "3×4 mm²": "kabel-3x4",
  "5×2,5 mm²": "kabel-5x2.5",
};

function toLine(
  sourceId: string,
  article: CatalogArticle,
  netQty: number,
  detail?: string,
): TakeoffLine {
  const grossQty = netQty * article.wasteFactor;
  const packs = article.packSize ? Math.ceil(grossQty / article.packSize) : undefined;
  const buyQty = packs != null ? packs * article.packSize! : grossQty;
  const totalPrice = article.unitPrice != null ? buyQty * article.unitPrice : undefined;

  return {
    sourceId,
    articleKey: article.key,
    name: article.name,
    unit: article.unit,
    netQty: round(netQty),
    grossQty: round(grossQty),
    packs,
    packName: article.packName,
    buyQty: round(buyQty),
    unitPrice: article.unitPrice,
    totalPrice: totalPrice != null ? Math.round(totalPrice * 100) / 100 : undefined,
    category: article.category,
    phaseOrder: article.phaseOrder,
    detail,
  };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
