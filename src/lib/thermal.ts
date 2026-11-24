// Bouwfysica: Rc/U-waarden, gevelherkenning en een indicatieve
// warmteverliesberekening per ruimte (transmissie + ventilatie).
//
// Dit is een *indicatie* in de geest van ISSO 51 (vereenvoudigd), bedoeld om
// keuzes te vergelijken (isoleren ja/nee, HR++ of triple, wel/geen
// warmtepomp) — geen vervanging van een officiële warmteverliesberekening
// of EP-online/NTA 8800 energielabel.

import type { Level, Opening, Point, Roof, Room, Wall, WallMaterial } from "./domain/types";
import type { LevelModel, ProjectModel } from "./model";
import { dist, pointInPolygon, polygonArea, projectOnSegment } from "./geometry";

// Overgangsweerstanden binnen + buiten (m²K/W), NEN-EN-ISO 6946.
const RSI_RSE = 0.17;

export const DESIGN_TEMP_INSIDE = 20; // °C
export const DESIGN_TEMP_OUTSIDE = -10; // °C (ISSO 51 ontwerpbuitentemperatuur)
const DELTA_T = DESIGN_TEMP_INSIDE - DESIGN_TEMP_OUTSIDE;

// Correctiefactor voor vloer op grond/kruipruimte (minder koud dan buitenlucht).
const FLOOR_B_FACTOR = 0.6;
// Ventilatievoud (1/h) als indicatie: oude woning met naden/kieren + roosters.
export const DEFAULT_AIR_CHANGES = 0.7;

// ── Eisen & richtwaarden ─────────────────────────────────────────────────────

/** Nieuwbouwniveau BBL (Besluit bouwwerken leefomgeving). */
export const REQUIREMENT_NEW = { wall: 4.7, floor: 3.7, roof: 6.3, windowU: 1.65 } as const;
/** Minimum Rc / max U voor ISDE-subsidie (isolatiemaatregelen bestaande bouw). */
export const REQUIREMENT_ISDE = { wall: 3.5, cavity: 1.1, floor: 3.5, roof: 3.5, windowU_HRpp: 1.2, windowU_triple: 0.7 } as const;

// ── Defaults ─────────────────────────────────────────────────────────────────

// Rc van een *ongeïsoleerde* bestaande constructie per materiaal (m²K/W).
const EXISTING_WALL_RC: Record<WallMaterial, number> = {
  brick: 0.35, // steens metselwerk / ongeïsoleerde spouw
  "sand-lime": 0.3,
  concrete: 0.2,
  "aerated-concrete": 1.0,
  "timber-frame": 1.3,
  gypsum: 0.4,
  other: 0.4,
};

export const DEFAULT_EXISTING_FLOOR_RC = 0.15;
export const DEFAULT_EXISTING_ROOF_RC = 0.4;

export const OPENING_U_PRESETS: { label: string; value: number }[] = [
  { label: "Enkel glas", value: 5.2 },
  { label: "Dubbel glas (oud)", value: 2.9 },
  { label: "HR++", value: 1.4 },
  { label: "Triple (HR+++)", value: 0.9 },
];

export const RC_PRESETS: { label: string; value: number }[] = [
  { label: "Ongeïsoleerd", value: 0.35 },
  { label: "Spouw gevuld", value: 1.7 },
  { label: "ISDE-minimum", value: 3.5 },
  { label: "Nieuwbouw gevel", value: 4.7 },
  { label: "Nieuwbouw dak", value: 6.3 },
];

export function uFromRc(rc: number): number {
  return 1 / (Math.max(0, rc) + RSI_RSE);
}

export function wallRc(wall: Wall): number {
  if (wall.insulationRc != null) return wall.insulationRc;
  return wall.status === "new" ? REQUIREMENT_NEW.wall : EXISTING_WALL_RC[wall.material];
}

export function wallRcIsDefault(wall: Wall): boolean {
  return wall.insulationRc == null;
}

export function openingU(o: Opening, wall?: Wall): number {
  if (o.uValue != null) return o.uValue;
  if (o.type === "passage") return 0;
  if (wall?.status === "new") return o.type === "door" ? 1.4 : 1.2; // nieuw kozijn: HR++
  return o.type === "door" ? 3.0 : 2.9;
}

export function floorRc(level: Level): number {
  return level.floorRc ?? DEFAULT_EXISTING_FLOOR_RC;
}

export function roofRc(roof?: Roof): number {
  return roof?.insulationRc ?? DEFAULT_EXISTING_ROOF_RC;
}

// ── Gevelherkenning ──────────────────────────────────────────────────────────
// Een muur is een gevel als je vanaf één kant naar buiten kunt "kijken" zonder
// een andere muur te raken (straal-test op 3 punten langs de muur). Werkt ook
// als nog niet alle ruimtes getekend zijn, en voor L- of U-vormige plattegronden.

const RAY_LEN = 200; // m

function rayHitsWall(origin: Point, dx: number, dy: number, self: Wall, walls: Wall[]): boolean {
  const far = { x: origin.x + dx * RAY_LEN, y: origin.y + dy * RAY_LEN };
  for (const w of walls) {
    if (w.id === self.id || w.status === "demolish") continue;
    if (segmentsCross(origin, far, w.start, w.end)) return true;
  }
  return false;
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/** Aan welke kant(en) ligt "buiten"? +1 = normaalzijde, −1 = andere zijde, 0 = geen (binnenmuur). */
export function outsideSide(wall: Wall, allWalls: Wall[]): -1 | 0 | 1 {
  const L = dist(wall.start, wall.end);
  if (L < 0.01) return 0;
  const nx = -(wall.end.y - wall.start.y) / L;
  const ny = (wall.end.x - wall.start.x) / L;
  const off = wall.thickness / 2 + 0.02;
  let a = 0;
  let b = 0;
  for (const t of [0.2, 0.5, 0.8]) {
    const px = wall.start.x + (wall.end.x - wall.start.x) * t;
    const py = wall.start.y + (wall.end.y - wall.start.y) * t;
    if (!rayHitsWall({ x: px + nx * off, y: py + ny * off }, nx, ny, wall, allWalls)) a++;
    if (!rayHitsWall({ x: px - nx * off, y: py - ny * off }, -nx, -ny, wall, allWalls)) b++;
  }
  if (a >= 2 && b < 2) return 1;
  if (b >= 2 && a < 2) return -1;
  if (a >= 2 && b >= 2) return 1; // vrijstaande muur: beide kanten buiten
  return 0;
}

// `rooms` blijft in de signatuur voor compatibiliteit; de straal-test is
// betrouwbaarder dan ruimte-detectie bij half getekende plattegronden.
export function isExternalWall(wall: Wall, _rooms: Room[], allWalls: Wall[]): boolean {
  if (wall.isExternal != null) return wall.isExternal;
  if (wall.status === "demolish") return false;
  return outsideSide(wall, allWalls) !== 0;
}

// ── Oriëntatie ───────────────────────────────────────────────────────────────

const COMPASS = ["N", "NO", "O", "ZO", "Z", "ZW", "W", "NW"] as const;
const COMPASS_LONG: Record<(typeof COMPASS)[number], string> = {
  N: "noord", NO: "noordoost", O: "oost", ZO: "zuidoost", Z: "zuid", ZW: "zuidwest", W: "west", NW: "noordwest",
};

/**
 * Windrichting waar de gevel naar kijkt (buitenkant). `northDegrees` = hoek
 * van de noordpijl t.o.v. "omhoog" op het plan, met de klok mee.
 */
export function facadeOrientation(wall: Wall, _rooms: Room[], allWalls: Wall[], northDegrees = 0): string {
  const L = dist(wall.start, wall.end);
  if (L < 0.01) return "";
  const side = outsideSide(wall, allWalls) || 1;
  const nx = (-(wall.end.y - wall.start.y) / L) * side;
  const ny = ((wall.end.x - wall.start.x) / L) * side;
  // Plan: omhoog = −y. Bearing met de klok mee vanaf omhoog.
  const bearing = ((Math.atan2(nx, -ny) * 180) / Math.PI - northDegrees + 720) % 360;
  return COMPASS_LONG[COMPASS[Math.round(bearing / 45) % 8]];
}

// ── Warmteverlies ────────────────────────────────────────────────────────────

export interface HeatLossPart {
  kind: "wall" | "window" | "door" | "floor" | "roof" | "ventilation";
  label: string;
  area: number; // m² (0 bij ventilatie)
  u: number; // W/m²K (bij ventilatie: W/m³K × V)
  watts: number;
  elementId?: string;
}

export interface RoomHeatLoss {
  room: Room;
  levelName: string;
  floorArea: number;
  volume: number;
  parts: HeatLossPart[];
  transmission: number; // W
  ventilation: number; // W
  total: number; // W
  wPerM2: number;
  radiators: number; // aantal radiatoren/vloerverwarmingsvelden in de ruimte
}

export interface ElementAdvice {
  severity: "error" | "warn" | "info";
  message: string;
  elementId?: string;
  savingWatts?: number; // vermindering ontwerpvermogen bij ISDE-niveau
}

export interface BuildingHeatLoss {
  rooms: RoomHeatLoss[];
  total: number;
  floorArea: number;
  wPerM2: number;
  envelope: { walls: number; windows: number; floor: number; roof: number; ventilation: number };
  advice: ElementAdvice[];
  heatPumpVerdict: { label: string; tone: "good" | "ok" | "bad"; explanation: string };
}

/** Lengte van het deel van een polygoonzijde dat over een muur loopt. */
function edgeOnWall(a: Point, b: Point, wall: Wall): { from: number; to: number } | null {
  const L = dist(wall.start, wall.end);
  if (L < 0.01) return null;
  const pa = projectOnSegment(a, wall.start, wall.end);
  const pb = projectOnSegment(b, wall.start, wall.end);
  const tol = Math.max(0.35, wall.thickness);
  if (pa.dist > tol || pb.dist > tol) return null;
  // `t` is 0..1 langs de muur.
  const from = Math.min(pa.t, pb.t) * L;
  const to = Math.max(pa.t, pb.t) * L;
  if (to - from < 0.05) return null;
  return { from, to };
}

function roomLoss(
  room: Room,
  lm: LevelModel,
  isLowest: boolean,
  roofAbove: Roof | null | undefined, // null = er ligt een verdieping boven
  airChanges: number,
): RoomHeatLoss {
  const level = lm.level;
  const floorArea = polygonArea(room.polygon);
  const volume = floorArea * level.height;
  const parts: HeatLossPart[] = [];
  const wallById = new Map(lm.walls.map((w) => [w.id, w]));

  // Gevels langs de polygoonzijdes.
  const seen = new Set<string>();
  for (let i = 0; i < room.polygon.length; i++) {
    const a = room.polygon[i];
    const b = room.polygon[(i + 1) % room.polygon.length];
    for (const w of lm.walls) {
      if (w.status === "demolish") continue;
      const span = edgeOnWall(a, b, w);
      if (!span) continue;
      const key = `${w.id}:${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!isExternalWall(w, lm.rooms, lm.walls)) continue;

      let gross = (span.to - span.from) * w.height;
      for (const o of lm.openings) {
        if (o.wallId !== w.id || o.type === "passage") continue;
        if (o.offset < span.from - 0.01 || o.offset > span.to + 0.01) continue;
        const oa = o.width * o.height;
        gross -= oa;
        const u = openingU(o, wallById.get(o.wallId));
        parts.push({
          kind: o.type === "door" ? "door" : "window",
          label: o.type === "door" ? "Buitendeur" : "Raam",
          area: oa,
          u,
          watts: u * oa * DELTA_T,
          elementId: o.id,
        });
      }
      const u = uFromRc(wallRc(w));
      const area = Math.max(0, gross);
      parts.push({ kind: "wall", label: "Gevel", area, u, watts: u * area * DELTA_T, elementId: w.id });
    }
  }

  if (isLowest) {
    const u = uFromRc(floorRc(level));
    parts.push({ kind: "floor", label: "Vloer (op grond/kruipruimte)", area: floorArea, u, watts: u * floorArea * DELTA_T * FLOOR_B_FACTOR, elementId: level.id });
  }
  if (roofAbove !== null) {
    const pitch = roofAbove && roofAbove.type !== "flat" ? roofAbove.pitch : 0;
    const area = floorArea / Math.cos((Math.min(70, pitch) * Math.PI) / 180);
    const u = uFromRc(roofRc(roofAbove ?? undefined));
    parts.push({ kind: "roof", label: pitch > 0 ? "Hellend dak" : "Dak/plafond", area, u, watts: u * area * DELTA_T, elementId: roofAbove?.id });
  }

  const transmission = parts.reduce((s, p) => s + p.watts, 0);
  // Ventilatie: 0,34 Wh/m³K × n × V × ΔT
  const ventilation = 0.34 * airChanges * volume * DELTA_T;
  parts.push({ kind: "ventilation", label: `Ventilatie/infiltratie (${airChanges}×/h)`, area: 0, u: 0.34 * airChanges, watts: ventilation });

  const radiators = lm.hvac.filter(
    (h) => (h.type === "radiator" || h.type === "floor-heating") && h.position && pointInPolygon(h.position, room.polygon),
  ).length;

  const total = transmission + ventilation;
  return {
    room,
    levelName: level.name,
    floorArea,
    volume,
    parts,
    transmission,
    ventilation,
    total,
    wPerM2: floorArea > 0 ? total / floorArea : 0,
    radiators,
  };
}

export function computeHeatLoss(model: ProjectModel, airChanges = DEFAULT_AIR_CHANGES): BuildingHeatLoss {
  const north = model.project.northDegrees ?? 0;
  const rooms: RoomHeatLoss[] = [];
  const levels = model.levels;
  const lowestOrder = Math.min(...levels.map((l) => l.level.order));
  const topIdx = levels.length - 1;

  levels.forEach((lm, idx) => {
    // Dak boven deze verdieping: eigen dak, of — als er geen verdieping meer
    // boven ligt — een plafond naar onverwarmde zolder/buitenlucht.
    const ownRoof = lm.roofs[0];
    const levelAboveHasRooms = idx < topIdx && levels[idx + 1].rooms.length > 0;
    const roofAbove: Roof | null | undefined = ownRoof ?? (levelAboveHasRooms ? null : undefined);
    for (const r of lm.rooms) {
      if (r.polygon.length < 3) continue;
      rooms.push(roomLoss(r, lm, lm.level.order === lowestOrder, roofAbove, airChanges));
    }
  });

  const sumKind = (k: HeatLossPart["kind"] | HeatLossPart["kind"][]) => {
    const ks = Array.isArray(k) ? k : [k];
    return rooms.reduce((s, r) => s + r.parts.filter((p) => ks.includes(p.kind)).reduce((a, p) => a + p.watts, 0), 0);
  };

  const total = rooms.reduce((s, r) => s + r.total, 0);
  const floorArea = rooms.reduce((s, r) => s + r.floorArea, 0);
  const wPerM2 = floorArea > 0 ? total / floorArea : 0;

  // ── Advies per element ──
  const advice: ElementAdvice[] = [];
  for (const lm of levels) {
    for (const w of lm.walls) {
      if (w.status === "demolish" || !isExternalWall(w, lm.rooms, lm.walls)) continue;
      const rc = wallRc(w);
      const area = dist(w.start, w.end) * w.height;
      const side = facadeOrientation(w, lm.rooms, lm.walls, north);
      const where = `${side ? `${side}gevel` : "Gevel"} ${dist(w.start, w.end).toFixed(1)} m, ${lm.level.name}`;
      if (w.status === "new" && rc < REQUIREMENT_NEW.wall) {
        advice.push({ severity: "warn", elementId: w.id, message: `Nieuwe muur (${where}) heeft Rc ${rc.toFixed(1)} — nieuwbouweis is ${REQUIREMENT_NEW.wall}` });
      } else if (rc < REQUIREMENT_ISDE.wall) {
        const saving = (uFromRc(rc) - uFromRc(REQUIREMENT_ISDE.wall)) * area * DELTA_T;
        advice.push({
          severity: rc < 1 ? "warn" : "info",
          elementId: w.id,
          savingWatts: saving,
          message: `${where[0].toUpperCase() + where.slice(1)}: Rc ${rc.toFixed(2)}${wallRcIsDefault(w) ? " (aangenomen)" : ""} — isoleren naar Rc ${REQUIREMENT_ISDE.wall} scheelt ~${Math.round(saving)} W en komt in aanmerking voor ISDE-subsidie`,
        });
      }
    }
    for (const o of lm.openings) {
      if (o.type === "passage") continue;
      const w = lm.walls.find((x) => x.id === o.wallId);
      if (!w || !isExternalWall(w, lm.rooms, lm.walls)) continue;
      const u = openingU(o, w);
      if (o.type === "window" && u > REQUIREMENT_ISDE.windowU_HRpp) {
        const saving = (u - REQUIREMENT_ISDE.windowU_HRpp) * o.width * o.height * DELTA_T;
        advice.push({
          severity: u > 3 ? "warn" : "info",
          elementId: o.id,
          savingWatts: saving,
          message: `Raam ${Math.round(o.width * 100)}×${Math.round(o.height * 100)} (${lm.level.name}): U ${u.toFixed(1)}${o.uValue == null ? " (aangenomen)" : ""} — HR++ (U ≤ ${REQUIREMENT_ISDE.windowU_HRpp}) scheelt ~${Math.round(saving)} W`,
        });
      }
    }
    for (const r of lm.roofs) {
      const rc = roofRc(r);
      if (rc < REQUIREMENT_ISDE.roof) {
        advice.push({
          severity: "warn",
          elementId: r.id,
          message: `Dak (${lm.level.name}): Rc ${rc.toFixed(1)}${r.insulationRc == null ? " (aangenomen)" : ""} — dakisolatie naar Rc ${REQUIREMENT_ISDE.roof}+ is meestal de rendabelste maatregel (ISDE)`,
        });
      }
    }
  }
  const lowest = levels.find((l) => l.level.order === lowestOrder);
  if (lowest && floorRc(lowest.level) < REQUIREMENT_ISDE.floor && lowest.rooms.length > 0) {
    advice.push({
      severity: "info",
      elementId: lowest.level.id,
      message: `Begane-grondvloer: Rc ${floorRc(lowest.level).toFixed(2)}${lowest.level.floorRc == null ? " (aangenomen)" : ""} — vloer-/bodemisolatie naar Rc ${REQUIREMENT_ISDE.floor} (ISDE) en nodig bij vloerverwarming`,
    });
  }
  advice.sort((a, b) => (b.savingWatts ?? 0) - (a.savingWatts ?? 0));

  // ── Warmtepomp-geschiktheid (vuistregel op ontwerpvermogen per m²) ──
  let heatPumpVerdict: BuildingHeatLoss["heatPumpVerdict"];
  if (floorArea === 0) {
    heatPumpVerdict = { label: "Onbekend", tone: "ok", explanation: "Teken eerst ruimtes om het warmteverlies te kunnen bepalen." };
  } else if (wPerM2 <= 50) {
    heatPumpVerdict = { label: "Geschikt voor (all-electric) warmtepomp", tone: "good", explanation: "Warmteverlies ≤ 50 W/m²: lage-temperatuurverwarming (≤ 45 °C) is goed haalbaar." };
  } else if (wPerM2 <= 80) {
    heatPumpVerdict = { label: "Hybride warmtepomp, of eerst isoleren", tone: "ok", explanation: "50–80 W/m²: een hybride warmtepomp werkt; voor all-electric eerst dak/vloer/glas aanpakken." };
  } else {
    heatPumpVerdict = { label: "Eerst isoleren", tone: "bad", explanation: "> 80 W/m²: de schil verliest te veel warmte voor lage-temperatuurverwarming. Begin bij de grootste posten hieronder." };
  }

  return {
    rooms,
    total,
    floorArea,
    wPerM2,
    envelope: {
      walls: sumKind("wall"),
      windows: sumKind(["window", "door"]),
      floor: sumKind("floor"),
      roof: sumKind("roof"),
      ventilation: sumKind("ventilation"),
    },
    advice,
    heatPumpVerdict,
  };
}

/** Indicatief radiatorvermogen (W) bij gegeven aanvoertemperatuur. */
export function radiatorFactor(supplyTemp: 45 | 55 | 70): number {
  // Radiatoren zijn opgegeven bij 75/65/20; bij lagere temperatuur levert
  // een radiator minder (benadering EN 442, exponent 1,3).
  const dtNominal = 50;
  const dt = { 45: 20, 55: 30, 70: 45 }[supplyTemp];
  return Math.pow(dt / dtNominal, 1.3);
}

// ── Scenario's ───────────────────────────────────────────────────────────────

export type ScenarioKey = "huidig" | "isde" | "nieuwbouw";

export const SCENARIOS: { key: ScenarioKey; label: string; description: string }[] = [
  { key: "huidig", label: "Huidig ontwerp", description: "Zoals nu ingevoerd (aangenomen waarden waar niets is opgegeven)." },
  { key: "isde", label: "ISDE-pakket", description: `Gevels, dak en vloer naar Rc ${REQUIREMENT_ISDE.wall}, glas HR++ (U ${REQUIREMENT_ISDE.windowU_HRpp}), kierdicht (0,5×/h).` },
  { key: "nieuwbouw", label: "Nieuwbouwniveau", description: `Gevel Rc ${REQUIREMENT_NEW.wall}, vloer ${REQUIREMENT_NEW.floor}, dak ${REQUIREMENT_NEW.roof}, triple glas, WTW (0,3×/h).` },
];

/** Past een isolatiescenario toe op een kopie van het model (niets wordt opgeslagen). */
export function applyScenario(model: ProjectModel, key: ScenarioKey): { model: ProjectModel; airChanges: number } {
  if (key === "huidig") return { model, airChanges: DEFAULT_AIR_CHANGES };
  const t = key === "isde"
    ? { wall: REQUIREMENT_ISDE.wall, floor: REQUIREMENT_ISDE.floor, roof: REQUIREMENT_ISDE.roof, win: REQUIREMENT_ISDE.windowU_HRpp, door: 1.4, n: 0.5 }
    : { wall: REQUIREMENT_NEW.wall, floor: REQUIREMENT_NEW.floor, roof: REQUIREMENT_NEW.roof, win: REQUIREMENT_ISDE.windowU_triple, door: 1.0, n: 0.3 };
  return {
    airChanges: t.n,
    model: {
      ...model,
      levels: model.levels.map((lm) => ({
        ...lm,
        level: { ...lm.level, floorRc: Math.max(floorRc(lm.level), t.floor) },
        walls: lm.walls.map((w) => (isExternalWall(w, lm.rooms, lm.walls) ? { ...w, insulationRc: Math.max(wallRc(w), t.wall) } : w)),
        openings: lm.openings.map((o) => ({ ...o, uValue: Math.min(openingU(o, lm.walls.find((w) => w.id === o.wallId)), o.type === "door" ? t.door : t.win) })),
        roofs: lm.roofs.map((r) => ({ ...r, insulationRc: Math.max(roofRc(r), t.roof) })),
      })),
    },
  };
}
