// Kabelroutering: bepaalt per eindgroep hoeveel meter kabel je moet trekken.
//
// Waarom over het muurskelet en niet hemelsbreed of via een vrij raster:
// een kabel loopt in de praktijk langs en in de muren, niet diagonaal door een
// kamer. Het muurnetwerk ligt er al, is klein (tientallen knopen, dus Dijkstra
// is verwaarloosbaar snel) en levert een route op die op de werktekening
// herkenbaar is. Een vrij raster zou kortere maar onbouwbare paden geven.
//
// De lengte is nadrukkelijk méér dan de horizontale route: er komen verticale
// stukken bij (van het stopcontact omhoog naar de plafondroute en bij de
// meterkast weer omlaag), speling per aansluitpunt, een staart in de kast en
// een snijverlies-toeslag. Zonder die opslagen koop je structureel te weinig in.

import type {
  ElectricalCircuit,
  ElectricalItem,
  Level,
  Point,
  Wall,
} from "../domain/types";
import {
  CABLE_PANEL_TAIL_M,
  CABLE_SLACK_PER_POINT_M,
  CABLE_WASTE_FACTOR,
} from "../domain/constants";
import { dist, pathLength, projectOnSegment } from "../geometry";

/** Twee punten gelden als hetzelfde knooppunt binnen deze tolerantie (m). */
const JUNCTION_TOL_M = 0.01;

export interface RoutedItem {
  itemId: string;
  /** Horizontale route vanaf het vorige punt in de keten. */
  polyline: Point[];
  horizontalM: number;
  /** Stijgen/dalen tussen route-hoogte en de montagehoogte van het punt. */
  verticalM: number;
  /** Handmatig getekend traject i.p.v. automatisch bepaald. */
  manual: boolean;
}

export interface CircuitRoute {
  circuitId: string;
  /** Route-onderdelen in trekvolgorde, startend bij de meterkast. */
  items: RoutedItem[];
  /** Alle polylijnen samen, voor het tekenen op de plattegrond. */
  polylines: Point[][];
  /** Gemeten lengte: horizontaal + verticaal, zonder opslagen. */
  measuredM: number;
  /** Inkooplengte: gemeten + speling + kaststaart, inclusief snijverlies. */
  purchaseM: number;
  /** Punten die niet aan een muur te koppelen waren (los in de ruimte). */
  unroutedItemIds: string[];
}

// ── Graaf over het muurskelet ────────────────────────────────────────────────

interface Node {
  point: Point;
  edges: { to: number; cost: number }[];
}

function keyOf(p: Point): string {
  // Afronden op de junctie-tolerantie zodat muren die elkaar "net" raken
  // toch één knooppunt delen.
  const r = (v: number) => Math.round(v / JUNCTION_TOL_M) * JUNCTION_TOL_M;
  return `${r(p.x).toFixed(3)},${r(p.y).toFixed(3)}`;
}

class Graph {
  nodes: Node[] = [];
  private index = new Map<string, number>();

  add(point: Point): number {
    const k = keyOf(point);
    const existing = this.index.get(k);
    if (existing != null) return existing;
    const id = this.nodes.length;
    this.nodes.push({ point, edges: [] });
    this.index.set(k, id);
    return id;
  }

  connect(a: number, b: number): void {
    if (a === b) return;
    const cost = dist(this.nodes[a].point, this.nodes[b].point);
    this.nodes[a].edges.push({ to: b, cost });
    this.nodes[b].edges.push({ to: a, cost });
  }
}

/**
 * Bouwt het loopnetwerk: elke muur wordt opgeknipt bij de voetpunten van de
 * elektra-punten die erop uitkomen, zodat een kabel halverwege een muur kan
 * aftakken.
 */
function buildGraph(walls: Wall[], footPoints: Map<string, Point[]>): Graph {
  const g = new Graph();
  for (const wall of walls) {
    const along = (footPoints.get(wall.id) ?? [])
      .map((p) => ({ p, t: projectOnSegment(p, wall.start, wall.end).t }))
      .sort((a, b) => a.t - b.t);
    const chain = [wall.start, ...along.map((a) => a.p), wall.end];
    for (let i = 1; i < chain.length; i++) {
      g.connect(g.add(chain[i - 1]), g.add(chain[i]));
    }
  }
  return g;
}

/** Kortste pad (Dijkstra). Geeft de puntenreeks of null als er geen route is. */
function shortestPath(g: Graph, from: number, to: number): { path: Point[]; cost: number } | null {
  const n = g.nodes.length;
  const distTo = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const visited = new Array<boolean>(n).fill(false);
  distTo[from] = 0;

  for (;;) {
    let cur = -1;
    let best = Infinity;
    for (let i = 0; i < n; i++) {
      if (!visited[i] && distTo[i] < best) {
        best = distTo[i];
        cur = i;
      }
    }
    if (cur === -1) break;
    if (cur === to) break;
    visited[cur] = true;
    for (const e of g.nodes[cur].edges) {
      const alt = distTo[cur] + e.cost;
      if (alt < distTo[e.to]) {
        distTo[e.to] = alt;
        prev[e.to] = cur;
      }
    }
  }

  if (!isFinite(distTo[to])) return null;
  const path: Point[] = [];
  for (let at = to; at !== -1; at = prev[at]) path.unshift(g.nodes[at].point);
  return { path, cost: distTo[to] };
}

// ── Voetpunt van een item op het muurnetwerk ─────────────────────────────────

interface Foot {
  wallId: string;
  point: Point;
  /** Extra stukje van het item naar de muur (als het los in de ruimte hangt). */
  stubM: number;
}

function footOf(item: ElectricalItem, walls: Wall[]): Foot | null {
  let best: { wallId: string; point: Point; d: number } | null = null;
  for (const w of walls) {
    const { point, dist: d } = projectOnSegment(item.position, w.start, w.end);
    if (!best || d < best.d) best = { wallId: w.id, point, d };
  }
  if (!best) return null;
  return { wallId: best.wallId, point: best.point, stubM: best.d };
}

// ── Routering ────────────────────────────────────────────────────────────────

export interface RoutingInput {
  circuits: ElectricalCircuit[];
  items: ElectricalItem[];
  walls: Wall[];
  levels: Level[];
}

/**
 * Bepaalt per groep de kabelroute en de benodigde inkooplengte.
 *
 * De kabel loopt als ketting: vanaf de meterkast naar het dichtstbijzijnde punt,
 * en vandaar telkens naar het eerstvolgende dichtstbijzijnde punt. Zo trekt een
 * installateur hem ook — één kabel die de punten langsgaat, geen ster.
 */
export function computeCircuitRoutes(input: RoutingInput): CircuitRoute[] {
  const { circuits, items, walls, levels } = input;
  const levelById = new Map(levels.map((l) => [l.id, l]));
  const routes: CircuitRoute[] = [];

  for (const circuit of circuits) {
    // De meterkast is het vertrekpunt van de groep, geen aansluitpunt: hem als
    // lid meetellen zou zijn stijgstuk dubbel rekenen.
    const members = items.filter(
      (i) => i.circuitId === circuit.id && !i.deleted && i.type !== "panel",
    );
    if (members.length === 0) {
      routes.push({
        circuitId: circuit.id, items: [], polylines: [],
        measuredM: 0, purchaseM: 0, unroutedItemIds: [],
      });
      continue;
    }

    // Vertrekpunt: de gekoppelde meterkast, anders een paneel in dezelfde
    // groep, anders het eerste punt (dan meten we alleen de onderlinge keten).
    const panel =
      items.find((i) => i.id === circuit.panelId) ??
      items.find((i) => i.type === "panel" && !i.deleted) ??
      null;

    const levelWalls = (levelId: string) => walls.filter((w) => w.levelId === levelId && !w.deleted);

    // Voetpunten per muur verzamelen zodat de graaf daar opgeknipt wordt.
    const relevant = panel ? [panel, ...members] : members;
    const feet = new Map<string, Foot | null>();
    const footByWall = new Map<string, Point[]>();
    for (const it of relevant) {
      const foot = footOf(it, levelWalls(it.levelId));
      feet.set(it.id, foot);
      if (foot) {
        const list = footByWall.get(foot.wallId) ?? [];
        list.push(foot.point);
        footByWall.set(foot.wallId, list);
      }
    }

    // Eén graaf per verdieping; kabels tussen verdiepingen krijgen een
    // verticale stijgleiding via het hoogteverschil.
    const graphByLevel = new Map<string, Graph>();
    for (const levelId of new Set(relevant.map((i) => i.levelId))) {
      graphByLevel.set(levelId, buildGraph(levelWalls(levelId), footByWall));
    }

    const routeHeight = (levelId: string) => {
      const level = levelById.get(levelId);
      if (circuit.routeAt === "floor") return 0;
      return level?.height ?? 2.6;
    };

    const routedItems: RoutedItem[] = [];
    const unrouted: string[] = [];
    const polylines: Point[][] = [];

    // Keten opbouwen: steeds het dichtstbijzijnde nog niet aangesloten punt.
    const remaining = [...members];
    let current: ElectricalItem | null = panel;
    // Zonder meterkast starten we bij het eerste punt en meten we de rest ervanaf.
    if (!current) {
      current = remaining.shift()!;
      routedItems.push({
        itemId: current.id, polyline: [], horizontalM: 0,
        verticalM: Math.abs(routeHeight(current.levelId) - current.heightZ),
        manual: false,
      });
    }

    while (remaining.length > 0) {
      const from = current!;
      const fromFoot = feet.get(from.id) ?? null;

      // Kies het dichtstbijzijnde volgende punt (hemelsbreed als voorselectie;
      // de werkelijke lengte volgt uit de graaf).
      let bestIdx = 0;
      let bestD = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = dist(from.position, remaining[i].position);
        if (d < bestD) {
          bestD = d;
          bestIdx = i;
        }
      }
      const next = remaining.splice(bestIdx, 1)[0];
      const nextFoot = feet.get(next.id) ?? null;

      // Handmatig traject gaat vóór op de automatische route.
      if (next.path && next.path.length >= 2) {
        const horizontal = pathLength(next.path);
        routedItems.push({
          itemId: next.id,
          polyline: next.path,
          horizontalM: horizontal,
          verticalM: Math.abs(routeHeight(next.levelId) - next.heightZ),
          manual: true,
        });
        polylines.push(next.path);
        current = next;
        continue;
      }

      let horizontal = 0;
      let polyline: Point[] = [];
      let routable = false;

      if (fromFoot && nextFoot && from.levelId === next.levelId) {
        const g = graphByLevel.get(next.levelId)!;
        const res = shortestPath(g, g.add(fromFoot.point), g.add(nextFoot.point));
        if (res) {
          horizontal = res.cost + fromFoot.stubM + nextFoot.stubM;
          polyline = [from.position, ...res.path, next.position];
          routable = true;
        }
      }

      if (!routable) {
        // Geen muurverbinding (andere verdieping of losstaande muren):
        // hemelsbrede terugval, zodat de meters niet zomaar wegvallen.
        horizontal = dist(from.position, next.position);
        polyline = [from.position, next.position];
        unrouted.push(next.id);
      }

      // Verticaal: van route-hoogte naar de montagehoogte van dit punt, plus
      // het verdiepingsverschil als de kabel naar een andere laag gaat.
      let vertical = Math.abs(routeHeight(next.levelId) - next.heightZ);
      if (from.levelId !== next.levelId) {
        const a = levelById.get(from.levelId)?.elevation ?? 0;
        const b = levelById.get(next.levelId)?.elevation ?? 0;
        vertical += Math.abs(b - a);
      }

      routedItems.push({
        itemId: next.id,
        polyline,
        horizontalM: horizontal,
        verticalM: vertical,
        manual: false,
      });
      polylines.push(polyline);
      current = next;
    }

    // De kabel begint in de kast op paneelhoogte en gaat omhoog naar de route.
    const panelRise = panel
      ? Math.abs(routeHeight(panel.levelId) - panel.heightZ)
      : 0;

    const measured =
      panelRise + routedItems.reduce((sum, r) => sum + r.horizontalM + r.verticalM, 0);
    const slack = members.length * CABLE_SLACK_PER_POINT_M + (panel ? CABLE_PANEL_TAIL_M : 0);
    const purchase = (measured + slack) * CABLE_WASTE_FACTOR;

    routes.push({
      circuitId: circuit.id,
      items: routedItems,
      polylines,
      measuredM: round(measured),
      purchaseM: round(purchase),
      unroutedItemIds: unrouted,
    });
  }

  return routes;
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
