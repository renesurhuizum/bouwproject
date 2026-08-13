// Indicatieve profielkeuze voor een ligger op twee steunpunten.
//
// Twee controles, allebei maatgevend afhankelijk van de overspanning:
//   sterkte     M = qL²/8  →  benodigd weerstandsmoment Wy = M / f_d
//   doorbuiging δ = 5qL⁴/(384·E·I) ≤ L/250  →  benodigd traagheidsmoment Iy
//
// Bij korte overspanningen is de sterkte maatgevend, bij lange de doorbuiging.
// Welke van de twee het is, wordt teruggegeven — dat verklaart waarom een balk
// zwaarder uitvalt dan je op gevoel zou denken.
//
// NADRUKKELIJK INDICATIEF. Geen knik-, kip-, dwarskracht- of opleggingscontrole,
// geen puntlasten, geen doorgaande liggers. Elke uitkomst draagt daarom een
// disclaimer die de UI moet tonen.

import {
  MATERIAL_PROPS,
  SECTION_PROFILES,
  type SectionMaterial,
  type SectionProfile,
} from "./sections";

export const STRUCTURAL_DISCLAIMER =
  "Indicatief — geen constructieberekening. Laat de maatvoering toetsen door een constructeur voordat je bestelt of bouwt.";

/** Toegestane doorbuiging: overspanning gedeeld door deze waarde. */
export const DEFLECTION_LIMIT = 250;

export interface SizingInput {
  /** Overspanning tussen de steunpunten, in m. */
  spanM: number;
  /** Rekenwaarde lijnlast (UGT), kN/m. */
  designKnM: number;
  /** Karakteristieke lijnlast (BGT), kN/m — voor de doorbuiging. */
  serviceKnM: number;
  material?: SectionMaterial;
}

export interface ProfileSuggestion {
  profile: SectionProfile;
  /** Benutting op sterkte (1,0 = precies vol). */
  strengthUtilisation: number;
  /** Benutting op doorbuiging. */
  deflectionUtilisation: number;
  /** Werkelijke doorbuiging in mm bij karakteristieke belasting. */
  deflectionMm: number;
  /** Welke controle de maat bepaalt. */
  governing: "sterkte" | "doorbuiging";
}

export interface SizingResult {
  /** Benodigd weerstandsmoment, cm³. */
  requiredWyCm3: number;
  /** Benodigd traagheidsmoment, cm⁴. */
  requiredIyCm4: number;
  /** Maximaal moment bij rekenbelasting, kNm. */
  designMomentKnm: number;
  /** Maximaal toelaatbare doorbuiging, mm. */
  allowedDeflectionMm: number;
  /** Passende profielen, lichtste eerst. */
  suggestions: ProfileSuggestion[];
  disclaimer: string;
}

/**
 * Bepaalt welke profielen een overspanning met de gegeven belasting aankunnen.
 */
export function suggestProfiles(input: SizingInput): SizingResult {
  const { spanM, designKnM, serviceKnM, material } = input;
  const span = Math.max(0, spanM);
  const allowedDeflectionMm = (span * 1000) / DEFLECTION_LIMIT;

  // M = qL²/8, in kNm.
  const designMomentKnm = (designKnM * span * span) / 8;

  const candidates = SECTION_PROFILES.filter((p) => !material || p.material === material);

  const suggestions: ProfileSuggestion[] = [];
  let requiredWy = 0;
  let requiredIy = 0;

  for (const profile of candidates) {
    const props = MATERIAL_PROPS[profile.material];

    // Benodigd Wy in cm³: M[kNm] → N·mm is ×1e6; delen door f_d geeft mm³;
    // mm³ → cm³ is ÷1000.
    const wyNeeded = (designMomentKnm * 1e6) / props.fd / 1000;

    // Doorbuiging: q in kN/m = N/mm, L in mm, E in N/mm² → I in mm⁴ (÷1e4 = cm⁴).
    const lMm = span * 1000;
    const iNeededMm4 =
      (5 * serviceKnM * Math.pow(lMm, 4) * DEFLECTION_LIMIT) / (384 * props.e * lMm);
    const iyNeeded = iNeededMm4 / 1e4;

    // Voor de rapportage nemen we de zwaarste eis over de kandidaten heen;
    // bij één materiaal is dat gewoon die van dat materiaal.
    requiredWy = Math.max(requiredWy, wyNeeded);
    requiredIy = Math.max(requiredIy, iyNeeded);

    const strengthUtilisation = profile.wy > 0 ? wyNeeded / profile.wy : Infinity;
    const deflectionUtilisation = profile.iy > 0 ? iyNeeded / profile.iy : Infinity;
    if (strengthUtilisation > 1 || deflectionUtilisation > 1) continue;

    const deflectionMm =
      profile.iy > 0
        ? (5 * serviceKnM * Math.pow(lMm, 4)) / (384 * props.e * profile.iy * 1e4)
        : Infinity;

    suggestions.push({
      profile,
      strengthUtilisation: round(strengthUtilisation),
      deflectionUtilisation: round(deflectionUtilisation),
      deflectionMm: round(deflectionMm),
      governing: strengthUtilisation >= deflectionUtilisation ? "sterkte" : "doorbuiging",
    });
  }

  // Lichtste (en dus goedkoopste) oplossing eerst.
  suggestions.sort((a, b) => a.profile.weightKgPerM - b.profile.weightKgPerM);

  return {
    requiredWyCm3: round(requiredWy),
    requiredIyCm4: round(requiredIy),
    designMomentKnm: round(designMomentKnm),
    allowedDeflectionMm: round(allowedDeflectionMm),
    suggestions,
    disclaimer: STRUCTURAL_DISCLAIMER,
  };
}

/**
 * Controleert of een al gekozen profiel de belasting aankan.
 */
export function checkProfile(
  profile: SectionProfile,
  input: SizingInput,
): ProfileSuggestion & { adequate: boolean } {
  const props = MATERIAL_PROPS[profile.material];
  const span = Math.max(0, input.spanM);
  const lMm = span * 1000;
  const designMomentKnm = (input.designKnM * span * span) / 8;

  const wyNeeded = (designMomentKnm * 1e6) / props.fd / 1000;
  const iyNeeded =
    (5 * input.serviceKnM * Math.pow(lMm, 4) * DEFLECTION_LIMIT) / (384 * props.e * lMm) / 1e4;

  const strengthUtilisation = profile.wy > 0 ? wyNeeded / profile.wy : Infinity;
  const deflectionUtilisation = profile.iy > 0 ? iyNeeded / profile.iy : Infinity;
  const deflectionMm =
    profile.iy > 0
      ? (5 * input.serviceKnM * Math.pow(lMm, 4)) / (384 * props.e * profile.iy * 1e4)
      : Infinity;

  return {
    profile,
    strengthUtilisation: round(strengthUtilisation),
    deflectionUtilisation: round(deflectionUtilisation),
    deflectionMm: round(deflectionMm),
    governing: strengthUtilisation >= deflectionUtilisation ? "sterkte" : "doorbuiging",
    adequate: strengthUtilisation <= 1 && deflectionUtilisation <= 1,
  };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
