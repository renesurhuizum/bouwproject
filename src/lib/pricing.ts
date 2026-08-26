// Kostenkentallen voor de live raming in de werkruimte.
//
// Dit zijn *ramingen*, geen offerte: indicatieve Nederlandse eenheidsprijzen
// inclusief materiaal en arbeid. Ze zijn er om tijdens het tekenen richting te
// geven ("wat kost deze wand ongeveer"), niet om mee aan te besteden. Per
// project overschrijfbaar via Instellingen.

import type { QuantityItem } from "./quantityTakeoff";

/**
 * Posten zonder eigen prijs. Dit zijn meetstaten die al in andere posten zitten
 * (het wandoppervlak wordt via nieuwbouw/schilderwerk geprijsd), of pure
 * oppervlaktematen. Zonder deze uitsluiting zou de raming dubbel tellen.
 */
export const INFORMATIVE_ITEMS = new Set([
  "Totaal vloeroppervlak",
  "Totaal wandoppervlak (netto)",
]);

/** Indicatieve eenheidsprijs in euro, per postnaam uit computeQuantities(). */
export const DEFAULT_UNIT_PRICES: Record<string, number> = {
  // Wanden
  "Nieuw te bouwen wanden": 95, // metselwerk of metalstud, incl. stucwerk
  "Te slopen wanden": 35, // sloop, afvoer en containerhuur
  // Afwerking
  Plafondoppervlak: 22, // spuitwerk / stucwerk plafond
  "Schilderwerk wanden (2 lagen)": 14,
  Plinten: 12,
  // Openingen
  "Binnendeur (kozijn + deur)": 450,
  "Raam / kozijn": 850,
  "Doorgang (afwerken)": 180,
  // Vloerafwerking
  Tegels: 75,
  "Houten vloer": 85,
  Vloerbedekking: 45,
  "Natuursteen vloer": 130,
  Betonvloer: 60,
};

export interface CostLine {
  item: QuantityItem;
  /** Undefined = geen kental bekend; de post telt dan niet mee in het totaal. */
  unitPrice?: number;
  total?: number;
  informative: boolean;
}

export interface CostEstimate {
  lines: CostLine[];
  /** Som van alle posten waarvoor een kental bekend is. */
  total: number;
  /** Posten zonder kental — expliciet tonen, anders lijkt de raming compleet. */
  unpriced: number;
}

/**
 * Koppelt hoeveelheden aan eenheidsprijzen. `overrides` wint van de defaults,
 * zodat een project met eigen aannemersprijzen kan rekenen.
 */
export function estimateCosts(
  items: QuantityItem[],
  overrides?: Record<string, number>,
): CostEstimate {
  let total = 0;
  let unpriced = 0;

  const lines = items.map((item): CostLine => {
    const informative = INFORMATIVE_ITEMS.has(item.name);
    const unitPrice = overrides?.[item.name] ?? DEFAULT_UNIT_PRICES[item.name];

    if (informative || unitPrice == null) {
      if (!informative) unpriced++;
      return { item, informative };
    }

    const lineTotal = item.quantity * unitPrice;
    total += lineTotal;
    return { item, unitPrice, total: lineTotal, informative };
  });

  return { lines, total, unpriced };
}

export const CATEGORY_LABEL: Record<QuantityItem["category"], string> = {
  walls: "Wanden",
  floors: "Vloeren & plafonds",
  openings: "Deuren & ramen",
  finishes: "Afwerking",
};
