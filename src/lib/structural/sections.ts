// Doorsnedegegevens van draagprofielen.
//
// De app kende alleen h × w per profiel — genoeg om een balk te tékenen, maar
// niet om te rékenen. Voor een indicatieve maatvoering zijn het weerstandsmoment
// (Wy) en het traagheidsmoment (Iy) nodig, plus het eigen gewicht.
//
// Waarden zijn de gangbare tabelwaarden voor Europese profielen (S235) en
// gezaagd naaldhout C24.

export type SectionMaterial = "steel" | "timber";

/** Opleglengte van een latei per zijde (m) — gangbare praktijkwaarde in NL. */
export const LINTEL_BEARING_M = 0.15;

export interface SectionProfile {
  key: string;
  label: string;
  material: SectionMaterial;
  h: number; // profielhoogte in m (voor de tekening)
  w: number; // profielbreedte in m
  wy: number; // weerstandsmoment om de sterke as, cm³
  iy: number; // traagheidsmoment om de sterke as, cm⁴
  weightKgPerM: number;
}

// Rekenwaarden per materiaal.
export interface MaterialProperties {
  /** Rekenwaarde buigsterkte, N/mm². */
  fd: number;
  /** Elasticiteitsmodulus, N/mm². */
  e: number;
  label: string;
}

export const MATERIAL_PROPS: Record<SectionMaterial, MaterialProperties> = {
  // S235: f_y = 235 N/mm², γ_M0 = 1,0.
  steel: { fd: 235, e: 210000, label: "Staal S235" },
  // C24: f_m,k = 24 N/mm², k_mod 0,8 (middellange duur), γ_M 1,3 → ≈ 14,8.
  timber: { fd: 14.8, e: 11000, label: "Hout C24" },
};

export const SECTION_PROFILES: SectionProfile[] = [
  // ── Staal: HEA ────────────────────────────────────────────────────────────
  { key: "HEA100", label: "HEA 100", material: "steel", h: 0.096, w: 0.100, wy: 72.8, iy: 349, weightKgPerM: 16.7 },
  { key: "HEA120", label: "HEA 120", material: "steel", h: 0.114, w: 0.120, wy: 106, iy: 606, weightKgPerM: 19.9 },
  { key: "HEA140", label: "HEA 140", material: "steel", h: 0.133, w: 0.140, wy: 155, iy: 1033, weightKgPerM: 24.7 },
  { key: "HEA160", label: "HEA 160", material: "steel", h: 0.152, w: 0.160, wy: 220, iy: 1673, weightKgPerM: 30.4 },
  { key: "HEA180", label: "HEA 180", material: "steel", h: 0.171, w: 0.180, wy: 294, iy: 2510, weightKgPerM: 35.5 },
  { key: "HEA200", label: "HEA 200", material: "steel", h: 0.190, w: 0.200, wy: 389, iy: 3692, weightKgPerM: 42.3 },
  { key: "HEA220", label: "HEA 220", material: "steel", h: 0.210, w: 0.220, wy: 515, iy: 5410, weightKgPerM: 50.5 },
  { key: "HEA240", label: "HEA 240", material: "steel", h: 0.230, w: 0.240, wy: 675, iy: 7763, weightKgPerM: 60.3 },
  { key: "HEA260", label: "HEA 260", material: "steel", h: 0.250, w: 0.260, wy: 836, iy: 10450, weightKgPerM: 68.2 },
  { key: "HEA300", label: "HEA 300", material: "steel", h: 0.290, w: 0.300, wy: 1260, iy: 18260, weightKgPerM: 88.3 },

  // ── Staal: HEB (zwaarder, zelfde hoogte) ──────────────────────────────────
  { key: "HEB100", label: "HEB 100", material: "steel", h: 0.100, w: 0.100, wy: 89.9, iy: 450, weightKgPerM: 20.4 },
  { key: "HEB120", label: "HEB 120", material: "steel", h: 0.120, w: 0.120, wy: 144, iy: 864, weightKgPerM: 26.7 },
  { key: "HEB140", label: "HEB 140", material: "steel", h: 0.140, w: 0.140, wy: 216, iy: 1509, weightKgPerM: 33.7 },
  { key: "HEB160", label: "HEB 160", material: "steel", h: 0.160, w: 0.160, wy: 311, iy: 2492, weightKgPerM: 42.6 },
  { key: "HEB180", label: "HEB 180", material: "steel", h: 0.180, w: 0.180, wy: 426, iy: 3831, weightKgPerM: 51.2 },
  { key: "HEB200", label: "HEB 200", material: "steel", h: 0.200, w: 0.200, wy: 570, iy: 5696, weightKgPerM: 61.3 },
  { key: "HEB220", label: "HEB 220", material: "steel", h: 0.220, w: 0.220, wy: 736, iy: 8091, weightKgPerM: 71.5 },
  { key: "HEB240", label: "HEB 240", material: "steel", h: 0.240, w: 0.240, wy: 938, iy: 11260, weightKgPerM: 83.2 },

  // ── Staal: IPE (efficiënt bij zuivere buiging) ────────────────────────────
  { key: "IPE100", label: "IPE 100", material: "steel", h: 0.100, w: 0.055, wy: 34.2, iy: 171, weightKgPerM: 8.1 },
  { key: "IPE120", label: "IPE 120", material: "steel", h: 0.120, w: 0.064, wy: 53.0, iy: 318, weightKgPerM: 10.4 },
  { key: "IPE140", label: "IPE 140", material: "steel", h: 0.140, w: 0.073, wy: 77.3, iy: 541, weightKgPerM: 12.9 },
  { key: "IPE160", label: "IPE 160", material: "steel", h: 0.160, w: 0.082, wy: 109, iy: 869, weightKgPerM: 15.8 },
  { key: "IPE180", label: "IPE 180", material: "steel", h: 0.180, w: 0.091, wy: 146, iy: 1317, weightKgPerM: 18.8 },
  { key: "IPE200", label: "IPE 200", material: "steel", h: 0.200, w: 0.100, wy: 194, iy: 1943, weightKgPerM: 22.4 },
  { key: "IPE220", label: "IPE 220", material: "steel", h: 0.220, w: 0.110, wy: 252, iy: 2772, weightKgPerM: 26.2 },
  { key: "IPE240", label: "IPE 240", material: "steel", h: 0.240, w: 0.120, wy: 324, iy: 3892, weightKgPerM: 30.7 },
  { key: "IPE270", label: "IPE 270", material: "steel", h: 0.270, w: 0.135, wy: 429, iy: 5790, weightKgPerM: 36.1 },
  { key: "IPE300", label: "IPE 300", material: "steel", h: 0.300, w: 0.150, wy: 557, iy: 8356, weightKgPerM: 42.2 },

  // ── Hout C24: gezaagde balken (b × h in mm) ───────────────────────────────
  { key: "HOUT63x175", label: "Hout 63×175", material: "timber", h: 0.175, w: 0.063, wy: 321, iy: 2814, weightKgPerM: 4.8 },
  { key: "HOUT63x200", label: "Hout 63×200", material: "timber", h: 0.200, w: 0.063, wy: 420, iy: 4200, weightKgPerM: 5.5 },
  { key: "HOUT71x220", label: "Hout 71×220", material: "timber", h: 0.220, w: 0.071, wy: 573, iy: 6301, weightKgPerM: 6.9 },
  { key: "HOUT75x225", label: "Hout 75×225", material: "timber", h: 0.225, w: 0.075, wy: 633, iy: 7119, weightKgPerM: 7.4 },
  { key: "HOUT75x250", label: "Hout 75×250", material: "timber", h: 0.250, w: 0.075, wy: 781, iy: 9766, weightKgPerM: 8.2 },
  { key: "HOUT100x250", label: "Hout 100×250", material: "timber", h: 0.250, w: 0.100, wy: 1042, iy: 13021, weightKgPerM: 11.0 },
];

export const SECTION_BY_KEY: Record<string, SectionProfile> = Object.fromEntries(
  SECTION_PROFILES.map((p) => [p.key, p]),
);

export function findSection(key: string): SectionProfile | undefined {
  return SECTION_BY_KEY[key];
}
