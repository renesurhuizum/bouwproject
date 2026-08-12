// Artikelcatalogus: van gemeten hoeveelheid naar iets wat je kunt bestellen.
//
// De oude berekening gaf alleen kale m² en m terug. Wat je in de bouwmarkt
// afrekent zijn platen, rollen, zakken en pakken — inclusief snijverlies. Elk
// artikel weet daarom zijn verpakkingsgrootte en verliesfactor.
//
// Prijzen zijn indicatieve NL-richtprijzen (incl. btw, 2024-orde). Ze zijn
// bedoeld om een begroting op gang te helpen, niet als offerte; de gebruiker
// kan ze in de materiaallijst overschrijven.

export type CatalogUnit = "st" | "m" | "m²" | "m³" | "zak" | "rol" | "pak" | "l" | "kg";

export interface CatalogArticle {
  key: string;
  name: string;
  /** Eenheid waarin gemeten wordt. */
  unit: CatalogUnit;
  /** Inhoud van één verpakking, in dezelfde eenheid. Leeg = los per eenheid. */
  packSize?: number;
  /** Hoe de verpakking heet ("plaat", "rol à 100 m"). */
  packName?: string;
  /** Vermenigvuldiger voor snij-, breuk- en trekverlies. */
  wasteFactor: number;
  /** Indicatieve prijs per eenheid (niet per pak), in euro. */
  unitPrice?: number;
  /** Sluit aan op KOSTEN_CATEGORIEEN. */
  category: string;
  /** Volgorde van de fase waarin dit materiaal nodig is (DEFAULT_PHASES). */
  phaseOrder?: number;
}

export const CATALOG: CatalogArticle[] = [
  // ── Wanden ────────────────────────────────────────────────────────────────
  {
    key: "gipsplaat-1200x2600",
    name: "Gipsplaat 120×260 cm",
    unit: "m²", packSize: 3.12, packName: "plaat",
    wasteFactor: 1.1, unitPrice: 6.5, category: "Stucwerk", phaseOrder: 7,
  },
  {
    key: "metalstud-profiel",
    name: "Metalstud profiel",
    unit: "m", wasteFactor: 1.05, unitPrice: 2.4, category: "Stucwerk", phaseOrder: 7,
  },
  {
    key: "montageschroeven",
    name: "Montageschroeven",
    unit: "st", packSize: 500, packName: "doos (500 st)",
    wasteFactor: 1.05, unitPrice: 0.03, category: "Stucwerk", phaseOrder: 7,
  },
  {
    key: "kalkzandsteen-blok",
    name: "Kalkzandsteen lijmblok",
    unit: "m²", wasteFactor: 1.05, unitPrice: 24, category: "Metselwerk", phaseOrder: 4,
  },
  {
    key: "gasbeton-blok",
    name: "Cellenbeton blok",
    unit: "m²", wasteFactor: 1.05, unitPrice: 18, category: "Metselwerk", phaseOrder: 4,
  },
  {
    key: "baksteen-metselwerk",
    name: "Metselwerk baksteen",
    unit: "m²", wasteFactor: 1.07, unitPrice: 45, category: "Metselwerk", phaseOrder: 4,
  },
  {
    key: "isolatie-wand",
    name: "Wandisolatie (minerale wol)",
    unit: "m²", packSize: 6, packName: "pak",
    wasteFactor: 1.08, unitPrice: 9, category: "Isolatie", phaseOrder: 6,
  },

  // ── Vloeren & plafonds ────────────────────────────────────────────────────
  {
    key: "dekvloer",
    name: "Dekvloer (zand-cement)",
    unit: "m²", wasteFactor: 1.03, unitPrice: 18, category: "Vloeren", phaseOrder: 9,
  },
  {
    key: "vloer-tegel",
    name: "Vloertegels",
    unit: "m²", packSize: 1.44, packName: "doos",
    wasteFactor: 1.1, unitPrice: 32, category: "Tegelwerk", phaseOrder: 11,
  },
  {
    key: "vloer-hout",
    name: "Houten vloer",
    unit: "m²", packSize: 2.2, packName: "pak",
    wasteFactor: 1.08, unitPrice: 45, category: "Vloeren", phaseOrder: 11,
  },
  {
    key: "vloer-tapijt",
    name: "Vloerbedekking",
    unit: "m²", wasteFactor: 1.12, unitPrice: 25, category: "Vloeren", phaseOrder: 11,
  },
  {
    key: "vloer-natuursteen",
    name: "Natuursteen vloer",
    unit: "m²", wasteFactor: 1.12, unitPrice: 85, category: "Vloeren", phaseOrder: 11,
  },
  {
    key: "vloer-beton",
    name: "Betonvloer afwerking",
    unit: "m²", wasteFactor: 1.03, unitPrice: 30, category: "Vloeren", phaseOrder: 11,
  },
  {
    key: "plafond-gipsplaat",
    name: "Plafond gipsplaat",
    unit: "m²", packSize: 3.12, packName: "plaat",
    wasteFactor: 1.12, unitPrice: 6.5, category: "Stucwerk", phaseOrder: 7,
  },

  // ── Afwerking ─────────────────────────────────────────────────────────────
  {
    key: "muurverf",
    name: "Muurverf",
    unit: "l", packSize: 10, packName: "emmer 10 l",
    wasteFactor: 1.05, unitPrice: 6, category: "Schilderwerk", phaseOrder: 11,
  },
  {
    key: "plint",
    name: "Plinten",
    unit: "m", packSize: 2.4, packName: "lengte 2,4 m",
    wasteFactor: 1.1, unitPrice: 4.5, category: "Schilderwerk", phaseOrder: 11,
  },

  // ── Deuren & ramen ────────────────────────────────────────────────────────
  {
    key: "binnendeur-set",
    name: "Binnendeur incl. kozijn",
    unit: "st", wasteFactor: 1, unitPrice: 250, category: "Afwerking", phaseOrder: 11,
  },
  {
    key: "raam-kozijn",
    name: "Raamkozijn incl. beglazing",
    unit: "st", wasteFactor: 1, unitPrice: 650, category: "Afwerking", phaseOrder: 4,
  },
  {
    key: "doorgang-afwerking",
    name: "Doorgang afwerken",
    unit: "st", wasteFactor: 1, unitPrice: 60, category: "Afwerking", phaseOrder: 11,
  },

  // ── Elektra ───────────────────────────────────────────────────────────────
  {
    key: "kabel-3x1.5",
    name: "Installatiedraad 3×1,5 mm²",
    unit: "m", packSize: 100, packName: "rol à 100 m",
    wasteFactor: 1, unitPrice: 0.85, category: "Elektra", phaseOrder: 5,
  },
  {
    key: "kabel-3x2.5",
    name: "Installatiedraad 3×2,5 mm²",
    unit: "m", packSize: 100, packName: "rol à 100 m",
    wasteFactor: 1, unitPrice: 1.25, category: "Elektra", phaseOrder: 5,
  },
  {
    key: "kabel-3x4",
    name: "Installatiedraad 3×4 mm²",
    unit: "m", packSize: 100, packName: "rol à 100 m",
    wasteFactor: 1, unitPrice: 1.95, category: "Elektra", phaseOrder: 5,
  },
  {
    key: "kabel-5x2.5",
    name: "Perilexkabel 5×2,5 mm²",
    unit: "m", packSize: 50, packName: "rol à 50 m",
    wasteFactor: 1, unitPrice: 3.2, category: "Elektra", phaseOrder: 5,
  },
  {
    key: "flexbuis-19",
    name: "Flexbuis 19 mm",
    unit: "m", packSize: 100, packName: "rol à 100 m",
    wasteFactor: 1.05, unitPrice: 0.45, category: "Elektra", phaseOrder: 5,
  },
  {
    key: "inbouwdoos",
    name: "Inbouwdoos",
    unit: "st", packSize: 10, packName: "zak (10 st)",
    wasteFactor: 1.05, unitPrice: 0.9, category: "Elektra", phaseOrder: 5,
  },
  {
    key: "centraaldoos",
    name: "Centraaldoos (lichtpunt)",
    unit: "st", packSize: 10, packName: "zak (10 st)",
    wasteFactor: 1.05, unitPrice: 1.2, category: "Elektra", phaseOrder: 5,
  },

  // ── Water & afvoer ────────────────────────────────────────────────────────
  {
    key: "waterleiding",
    name: "Waterleiding",
    unit: "m", wasteFactor: 1.05, unitPrice: 3.5, category: "Loodgieter / water", phaseOrder: 5,
  },
  {
    key: "afvoerbuis",
    name: "Afvoerbuis pvc",
    unit: "m", wasteFactor: 1.05, unitPrice: 6, category: "Loodgieter / water", phaseOrder: 5,
  },
  {
    key: "cv-leiding",
    name: "CV-leiding",
    unit: "m", wasteFactor: 1.05, unitPrice: 4, category: "Verwarming / cv", phaseOrder: 5,
  },
  {
    key: "leidingfitting",
    name: "Fittingen (bochten/koppelingen)",
    unit: "st", wasteFactor: 1.1, unitPrice: 3.5, category: "Loodgieter / water", phaseOrder: 5,
  },

  // ── Constructie ───────────────────────────────────────────────────────────
  {
    key: "staalprofiel",
    name: "Stalen profiel",
    unit: "kg", wasteFactor: 1.02, unitPrice: 2.5, category: "Constructie", phaseOrder: 3,
  },
  {
    key: "houten-balk",
    name: "Houten balk C24",
    unit: "m", wasteFactor: 1.05, unitPrice: 12, category: "Constructie", phaseOrder: 3,
  },
];

export const ARTICLE_BY_KEY: Record<string, CatalogArticle> = Object.fromEntries(
  CATALOG.map((a) => [a.key, a]),
);
