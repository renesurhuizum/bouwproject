// Hoeveel van een zolder is écht bruikbaar?
//
// Een ruimte onder een kap telde tot nu toe zijn volledige footprint mee. Maar
// onder een 45°-zadeldak van 8 m overspanning kun je maar over 5 m staan — de
// rest is kruipruimte achter de kniewand. Dat verschil bepaalt of er een
// slaapkamer in past, dus het hoort zichtbaar te zijn.
//
// Grenswaarden (NL):
//   1,50 m — vanaf hier telt de vloer mee voor de gebruiksoppervlakte (NEN 2580)
//   2,30 m — vanaf hier mag het een verblijfsruimte zijn
//
// De berekening rastert de ruimtepolygoon in plaats van analytisch te rekenen.
// Dat is bewust: zo klopt hij ook bij een grillige plattegrond, een schilddak
// en dakkapellen tegelijk, zonder per combinatie een aparte formule.

import type { Dormer, Point, Roof, Room, Wall } from "./domain/types";
import { bounds, pointInPolygon, polygonArea } from "./geometry";
import {
  roofFootprint,
  roofHeightAt,
  toRoofLocal,
  type RoofFootprint,
} from "./roofGeometry";

/** Vanaf deze stahoogte telt vloer mee als gebruiksoppervlakte (NEN 2580). */
export const HEADROOM_USABLE_M = 1.5;
/** Vanaf deze stahoogte mag een ruimte verblijfsruimte zijn. */
export const HEADROOM_LIVING_M = 2.3;

/** Rastermaat voor de monstering (m). 5 cm geeft ruim voldoende nauwkeurigheid. */
const CELL_M = 0.05;

export interface AtticAreas {
  /** Volledige vloeroppervlakte van de ruimte (m²). */
  grossM2: number;
  /** Deel met stahoogte ≥ 1,50 m (m²). */
  usableM2: number;
  /** Deel met stahoogte ≥ 2,30 m (m²). */
  livingM2: number;
  /** Hoogste punt binnen de ruimte (m). */
  maxHeadroomM: number;
}

/**
 * Stahoogte op één punt: de onderkant van het dak boven de zoldervloer.
 * Een dakkapel verhoogt de stahoogte binnen zijn eigen footprint.
 */
export function headroomAt(
  world: Point,
  roof: Roof,
  fp: RoofFootprint,
  dormers: Dormer[] = [],
  /**
   * Hoogte van het muurwerk waar het dak op staat — in het model is dat de
   * verdiepingshoogte van de zolder. Bij een zolder met een kniewand van 1 m
   * begint het dak dus op 1 m, en telt die meter overal mee.
   */
  baseHeightM = 0,
): number {
  const local = toRoofLocal(world, roof, fp);
  let h = baseHeightM + roofHeightAt(roof.type, fp.W, fp.D, roof.pitch, roof.overhang, local);

  // Binnen een dakkapel is de hoogte minimaal de kapelhoogte: dat is precies
  // waarvoor je hem plaatst.
  for (const d of dormers) {
    if (d.deleted) continue;
    const halfW = d.width / 2;
    const halfD = 0.55; // diepte van de kapel, zoals DormerMesh3D hem tekent
    if (
      Math.abs(world.x - d.position.x) <= halfW &&
      Math.abs(world.y - d.position.y) <= halfD
    ) {
      h = Math.max(h, baseHeightM + d.height);
    }
  }
  return h;
}

/**
 * Bruto, bruikbaar en verblijfsoppervlak van een ruimte onder een kap.
 * Zonder dak (of bij een plat dak) is alles bruikbaar.
 */
export function atticAreas(
  room: Room,
  roof: Roof | null,
  fp: RoofFootprint | null,
  dormers: Dormer[] = [],
  baseHeightM = 0,
): AtticAreas {
  const gross = room.polygon.length >= 3 ? polygonArea(room.polygon) : 0;

  if (!roof || !fp || roof.type === "flat" || gross <= 0) {
    return {
      grossM2: round(gross),
      usableM2: round(gross),
      livingM2: round(gross),
      maxHeadroomM: 0,
    };
  }

  const bb = bounds(room.polygon);
  const cellArea = CELL_M * CELL_M;
  let usable = 0;
  let living = 0;
  let maxH = 0;

  // Monsteren in het midden van elke cel, zodat de randen niet dubbel tellen.
  for (let x = bb.min.x + CELL_M / 2; x < bb.max.x; x += CELL_M) {
    for (let y = bb.min.y + CELL_M / 2; y < bb.max.y; y += CELL_M) {
      const p = { x, y };
      if (!pointInPolygon(p, room.polygon)) continue;
      const h = headroomAt(p, roof, fp, dormers, baseHeightM);
      if (h > maxH) maxH = h;
      if (h >= HEADROOM_USABLE_M) usable += cellArea;
      if (h >= HEADROOM_LIVING_M) living += cellArea;
    }
  }

  return {
    grossM2: round(gross),
    usableM2: round(usable),
    livingM2: round(living),
    maxHeadroomM: round(maxH),
  };
}

/**
 * Alles wat je moet weten over de kap boven een verdieping. Eén object, zodat
 * aanroepers niet steeds drie losse dingen hoeven door te geven.
 */
export interface AtticContext {
  roof: Roof;
  dormers: Dormer[];
  /** Muurhoogte van de verdieping: de kniewand waar het dak op staat. */
  baseHeightM: number;
}

/**
 * Zoldercijfers voor één ruimte, of `null` als er geen schuine kap boven staat
 * of de kap niets kost. Bij een flinke kniewand haal je overal 1,50 m maar nog
 * lang niet overal 2,30 m — dan is er dus wél iets te melden.
 */
export function atticAreasFor(
  room: Room,
  walls: Wall[],
  ctx: AtticContext | null | undefined,
): AtticAreas | null {
  if (!ctx || ctx.roof.type === "flat") return null;
  const fp = roofFootprint(ctx.roof, walls);
  if (!fp) return null;
  const a = atticAreas(room, ctx.roof, fp, ctx.dormers, ctx.baseHeightM);
  const costsSomething = a.usableM2 < a.grossM2 - 0.05 || a.livingM2 < a.grossM2 - 0.05;
  return costsSomething ? a : null;
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}
