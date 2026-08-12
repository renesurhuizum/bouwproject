// Belastingaannames voor de Nederlandse woningbouw.
//
// Bewust vereenvoudigd: dit levert een indicatie waarmee je een gesprek met de
// constructeur kunt beginnen en alvast materiaal kunt begroten — geen
// constructieberekening. De aannames staan expliciet in de code zodat
// controleerbaar is waar een getal vandaan komt.

import type { WallMaterial } from "../domain/types";

/** Wat draagt de balk of latei? */
export type SupportedLoad =
  | "wall-only" // alleen het metselwerk erboven (typisch een latei)
  | "floor" // één verdiepingsvloer
  | "floor-and-wall" // vloer plus de muur erboven
  | "roof" // dakvlak (inclusief sneeuw)
  | "roof-and-wall";

export const SUPPORTED_LOAD_LABEL: Record<SupportedLoad, string> = {
  "wall-only": "Alleen muur erboven",
  floor: "Verdiepingsvloer",
  "floor-and-wall": "Vloer + muur erboven",
  roof: "Dakvlak",
  "roof-and-wall": "Dak + muur erboven",
};

// Permanente belasting (eigen gewicht) in kN/m².
export const PERMANENT_FLOOR_KNM2 = 1.2; // houten vloer met dekvloer en afwerking
export const PERMANENT_ROOF_KNM2 = 0.7; // pannen, panlatten, dakbeschot, isolatie

// Veranderlijke belasting in kN/m².
// NEN-EN 1991-1-1 NB, categorie A (woonfunctie).
export const VARIABLE_FLOOR_KNM2 = 1.75;
// Sneeuw in NL op een niet-beloopbaar dak.
export const VARIABLE_ROOF_KNM2 = 0.56;

// Soortelijk gewicht van muurmateriaal in kN/m³, voor het gewicht van de muur
// die op de balk of latei staat.
export const WALL_DENSITY_KNM3: Record<WallMaterial, number> = {
  brick: 18,
  "sand-lime": 18,
  concrete: 24,
  "aerated-concrete": 6,
  "timber-frame": 3,
  gypsum: 3,
  other: 18,
};

// Veiligheidsfactoren (Eurocode, blijvende/voorbijgaande situatie).
export const GAMMA_PERMANENT = 1.35;
export const GAMMA_VARIABLE = 1.5;

export interface LoadInput {
  supports: SupportedLoad;
  /** Belastingbreedte in m: de helft van de overspanning aan weerszijden. */
  tributaryWidthM: number;
  /** Hoogte van het muurwerk boven de balk, in m. */
  wallHeightM: number;
  /** Muurdikte in m. */
  wallThicknessM: number;
  wallMaterial: WallMaterial;
}

export interface LineLoad {
  /** Permanente lijnlast, kN/m. */
  permanentKnM: number;
  /** Veranderlijke lijnlast, kN/m. */
  variableKnM: number;
  /** Rekenwaarde (UGT): 1,35·G + 1,5·Q, kN/m. */
  designKnM: number;
  /** Karakteristieke waarde (BGT, voor doorbuiging): G + Q, kN/m. */
  serviceKnM: number;
  /** Leesbare opbouw van het getal, voor in de UI. */
  breakdown: { label: string; knM: number }[];
}

/**
 * Rekent de aannames om naar een gelijkmatig verdeelde lijnlast op de balk.
 */
export function estimateLineLoad(input: LoadInput): LineLoad {
  const { supports, tributaryWidthM, wallHeightM, wallThicknessM, wallMaterial } = input;
  const breakdown: { label: string; knM: number }[] = [];
  let permanent = 0;
  let variable = 0;

  const carriesWall =
    supports === "wall-only" || supports === "floor-and-wall" || supports === "roof-and-wall";
  const carriesFloor = supports === "floor" || supports === "floor-and-wall";
  const carriesRoof = supports === "roof" || supports === "roof-and-wall";

  if (carriesWall) {
    const wall = WALL_DENSITY_KNM3[wallMaterial] * wallThicknessM * wallHeightM;
    permanent += wall;
    breakdown.push({ label: "Muur erboven", knM: round(wall) });
  }
  if (carriesFloor) {
    const g = PERMANENT_FLOOR_KNM2 * tributaryWidthM;
    const q = VARIABLE_FLOOR_KNM2 * tributaryWidthM;
    permanent += g;
    variable += q;
    breakdown.push({ label: "Vloer eigen gewicht", knM: round(g) });
    breakdown.push({ label: "Vloer belasting (wonen)", knM: round(q) });
  }
  if (carriesRoof) {
    const g = PERMANENT_ROOF_KNM2 * tributaryWidthM;
    const q = VARIABLE_ROOF_KNM2 * tributaryWidthM;
    permanent += g;
    variable += q;
    breakdown.push({ label: "Dak eigen gewicht", knM: round(g) });
    breakdown.push({ label: "Sneeuw", knM: round(q) });
  }

  return {
    permanentKnM: round(permanent),
    variableKnM: round(variable),
    designKnM: round(GAMMA_PERMANENT * permanent + GAMMA_VARIABLE * variable),
    serviceKnM: round(permanent + variable),
    breakdown,
  };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
