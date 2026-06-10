// Slimme Nederlandse bouw-defaults en vaste keuzelijsten.

import type {
  ElectricalType,
  FixtureKind,
  HvacType,
  OpeningType,
  WallMaterial,
  WallStatus,
  PhaseStatus,
  MaterialStatus,
} from "./types";

// ── Verwarming / HVAC ─────────────────────────────────────────────────────────

export const HVAC_LABEL: Record<HvacType, string> = {
  "cv-pipe": "CV-leiding",
  radiator: "Radiator",
  "floor-heating": "Vloerverwarming",
  ventilation: "Ventilatie",
  wtw: "WTW-unit",
};

export const HVAC_CODE: Record<HvacType, string> = {
  "cv-pipe": "CV",
  radiator: "RAD",
  "floor-heating": "VV",
  ventilation: "VEN",
  wtw: "WTW",
};

export const HVAC_COLOR: Record<HvacType, string> = {
  "cv-pipe": "#f97316",
  radiator: "#f97316",
  "floor-heating": "#fb923c",
  ventilation: "#6b7280",
  wtw: "#9333ea",
};

export const HVAC_DEFAULT_HEIGHT: Record<HvacType, number> = {
  "cv-pipe": 0.3,
  radiator: 0.3,
  "floor-heating": 0,
  ventilation: 2.3,
  wtw: 0.5,
};

// Standaard montagehoogtes (m boven vloer) — NEN/praktijk in NL.
export const ELECTRICAL_DEFAULT_HEIGHT: Record<ElectricalType, number> = {
  socket: 0.3,
  "socket-double": 0.3,
  switch: 1.05,
  light: 2.6,
  spot: 2.6,
  "wall-light": 1.9,
  data: 0.3,
  panel: 1.5,
  outdoor: 0.6,
};

export const ELECTRICAL_LABEL: Record<ElectricalType, string> = {
  socket: "Stopcontact",
  "socket-double": "Dubbel stopcontact",
  switch: "Schakelaar",
  light: "Lichtpunt",
  spot: "Inbouwspot",
  "wall-light": "Wandlamp",
  data: "Data / UTP",
  panel: "Groepenkast",
  outdoor: "Buitenpunt",
};

// Veelgebruikte uitzonderingen op de standaardhoogte.
export const ELECTRICAL_HEIGHT_PRESETS: { label: string; value: number }[] = [
  { label: "Vloer / plint (30 cm)", value: 0.3 },
  { label: "Boven aanrecht (110 cm)", value: 1.1 },
  { label: "Schakelaar (105 cm)", value: 1.05 },
  { label: "Wandlamp (190 cm)", value: 1.9 },
  { label: "Plafond (260 cm)", value: 2.6 },
];

export const WALL_MATERIAL_LABEL: Record<WallMaterial, string> = {
  brick: "Baksteen / metselwerk",
  "sand-lime": "Kalkzandsteen",
  concrete: "Beton",
  "aerated-concrete": "Cellenbeton (gasbeton)",
  "timber-frame": "Houtskeletbouw",
  gypsum: "Gipsplaat / metalstud",
  other: "Anders",
};

// Typische muurdikte (m) per materiaal, als voorstel bij aanmaken.
export const WALL_MATERIAL_THICKNESS: Record<WallMaterial, number> = {
  brick: 0.1,
  "sand-lime": 0.1,
  concrete: 0.2,
  "aerated-concrete": 0.1,
  "timber-frame": 0.15,
  gypsum: 0.1,
  other: 0.1,
};

export const WALL_STATUS_LABEL: Record<WallStatus, string> = {
  existing: "Bestaand",
  new: "Nieuw",
  demolish: "Slopen",
};

export const PHASE_STATUS_LABEL: Record<PhaseStatus, string> = {
  todo: "Te doen",
  "in-progress": "Bezig",
  done: "Klaar",
};

// Standaard renovatie-fasering (NL) met afhankelijkheden via index-volgorde.
// dependsOnOrders verwijst naar de `order`-waarden die eerst klaar moeten zijn.
export interface PhaseTemplate {
  name: string;
  order: number;
  dependsOnOrders: number[];
  color: string;
  note: string;
}

export const DEFAULT_PHASES: PhaseTemplate[] = [
  {
    name: "Voorbereiding & ontwerp",
    order: 1,
    dependsOnOrders: [],
    color: "#64748b",
    note: "Opmeten, vergunning, definitief ontwerp.",
  },
  {
    name: "Sloop",
    order: 2,
    dependsOnOrders: [1],
    color: "#a16207",
    note: "Weghalen wat weg moet. Let op asbest en dragende delen.",
  },
  {
    name: "Constructief",
    order: 3,
    dependsOnOrders: [2],
    color: "#b91c1c",
    note: "Fundering, stalen balken/lateien, dragende wijzigingen.",
  },
  {
    name: "Ruwbouw / casco",
    order: 4,
    dependsOnOrders: [3],
    color: "#c2410c",
    note: "Nieuwe muren, dak, wind- en waterdicht.",
  },
  {
    name: "Installaties — 1e fase",
    order: 5,
    dependsOnOrders: [4],
    color: "#1d4ed8",
    note: "Bedrading en leidingen ÍN de muren/vloer, vóór dichtmaken.",
  },
  {
    name: "Isolatie",
    order: 6,
    dependsOnOrders: [4],
    color: "#0d9488",
    note: "Muur, dak en vloer isoleren.",
  },
  {
    name: "Wanden dicht (gipsplaat)",
    order: 7,
    dependsOnOrders: [5, 6],
    color: "#7c3aed",
    note: "Niet eerder dan na 1e fase installaties + isolatie.",
  },
  {
    name: "Stucwerk / spack",
    order: 8,
    dependsOnOrders: [7],
    color: "#9333ea",
    note: "Wanden en plafonds afwerken.",
  },
  {
    name: "Dekvloer",
    order: 9,
    dependsOnOrders: [5],
    color: "#0891b2",
    note: "Pas gieten als vloerverwarming ligt.",
  },
  {
    name: "Installaties — 2e fase",
    order: 10,
    dependsOnOrders: [8, 9],
    color: "#2563eb",
    note: "Stopcontacten, schakelaars en kranen monteren.",
  },
  {
    name: "Afwerking",
    order: 11,
    dependsOnOrders: [10],
    color: "#16a34a",
    note: "Tegelwerk, vloeren, schilderen, keuken, badkamer.",
  },
  {
    name: "Oplevering",
    order: 12,
    dependsOnOrders: [11],
    color: "#15803d",
    note: "Controle en restpunten.",
  },
];

// Standaard verdiepingen bij een nieuw project.
export const DEFAULT_LEVELS: { name: string; elevation: number; height: number; order: number }[] = [
  { name: "Begane grond", elevation: 0, height: 2.6, order: 1 },
  { name: "Verdieping", elevation: 2.8, height: 2.5, order: 2 },
];

export const KOSTEN_CATEGORIEEN = [
  "Sloop",
  "Constructie",
  "Metselwerk",
  "Dak",
  "Elektra",
  "Loodgieter / water",
  "Verwarming / cv",
  "Ventilatie",
  "Isolatie",
  "Stucwerk",
  "Vloeren",
  "Tegelwerk",
  "Keuken",
  "Badkamer",
  "Schilderwerk",
  "Vergunningen",
  "Gereedschap",
  "Onvoorzien",
  "Overig",
] as const;

// Visuele kleuren per muurstatus (blueprint-stijl).
export const WALL_STATUS_COLOR: Record<WallStatus, string> = {
  existing: "#334155", // ink/slate
  new: "#ea580c", // accent oranje
  demolish: "#dc2626", // rood
};

// Rastermaat in meters voor snapping.
export const GRID_SIZE_M = 0.1; // 10 cm
export const GRID_MAJOR_EVERY = 10; // elke 1 m een zware lijn

// ── Deuren & ramen ────────────────────────────────────────────────────────────

export const OPENING_LABEL: Record<OpeningType, string> = {
  door: "Deur",
  window: "Raam",
  passage: "Doorgang",
};

// Standaardafmetingen (m): breedte, hoogte, borsthoogte.
export const OPENING_DEFAULTS: Record<
  OpeningType,
  { width: number; height: number; sillHeight: number }
> = {
  door: { width: 0.9, height: 2.1, sillHeight: 0 },
  window: { width: 1.2, height: 1.2, sillHeight: 0.9 },
  passage: { width: 0.9, height: 2.1, sillHeight: 0 },
};

export const OPENING_COLOR: Record<OpeningType, string> = {
  door: "#a16207", // bruin
  window: "#1d4ed8", // blauw
  passage: "#78716c", // grijs
};

// Hoe dicht (m) een tik bij een muur moet zijn om er een opening op te plaatsen.
export const OPENING_SNAP_M = 0.5;

// ── Water & sanitair ─────────────────────────────────────────────────────────

export const FIXTURE_LABEL: Record<FixtureKind, string> = {
  toilet: "Toilet",
  sink: "Wastafel",
  shower: "Douche",
  bath: "Bad",
  "kitchen-tap": "Keukenkraan",
  "washing-machine": "Wasmachine",
  boiler: "CV-ketel / boiler",
  "outdoor-tap": "Buitenkraan",
};

export const FIXTURE_CODE: Record<FixtureKind, string> = {
  toilet: "WC",
  sink: "WT",
  shower: "DO",
  bath: "BAD",
  "kitchen-tap": "KK",
  "washing-machine": "WM",
  boiler: "CV",
  "outdoor-tap": "BK",
};

// Standaard aansluithoogte (m boven vloer).
export const FIXTURE_DEFAULT_HEIGHT: Record<FixtureKind, number> = {
  toilet: 0.2,
  sink: 1.0,
  shower: 1.1,
  bath: 0.6,
  "kitchen-tap": 1.0,
  "washing-machine": 0.9,
  boiler: 1.5,
  "outdoor-tap": 0.5,
};

export const PLUMBING_COLOR = "#0891b2"; // teal

// ── Materialen ────────────────────────────────────────────────────────────────

export const MATERIAL_UNITS = ["st", "m", "m²", "m³", "zak", "rol", "pak", "l", "kg"] as const;

export const MATERIAL_STATUS_LABEL: Record<MaterialStatus, string> = {
  needed: "Nodig",
  ordered: "Besteld",
  delivered: "Geleverd",
};

export const MATERIAL_STATUS_COLOR: Record<MaterialStatus, string> = {
  needed: "#b45309",
  ordered: "#1d4ed8",
  delivered: "#15803d",
};

// ── Stappenplannen per fase ──────────────────────────────────────────────────
// Standaard checklist per fase (op `order`), om automatisch te genereren.

export const PHASE_TASK_TEMPLATES: Record<number, string[]> = {
  1: [
    "Bestaande situatie opmeten",
    "Definitieve indeling vaststellen",
    "Vergunning checken / aanvragen",
    "Constructieberekening (indien nodig)",
    "Offertes aannemers verzamelen",
    "Planning en budget vastleggen",
  ],
  2: [
    "Asbestinventarisatie laten uitvoeren",
    "Nutsvoorzieningen afsluiten waar nodig",
    "Niet-dragende wanden slopen",
    "Oude vloeren en plafonds verwijderen",
    "Puin afvoeren (container regelen)",
  ],
  3: [
    "Dragende wijzigingen voorbereiden",
    "Stalen balken / lateien plaatsen",
    "Fundering aanpassen of storten",
    "Constructie laten controleren",
  ],
  4: [
    "Nieuwe muren metselen / lijmen",
    "Dak herstellen of vervangen",
    "Kozijnen plaatsen",
    "Wind- en waterdicht maken",
  ],
  5: [
    "Leidingplan uitwerken",
    "Elektra bedrading trekken (per groep)",
    "Waterleidingen aanleggen (aan- en afvoer)",
    "CV / vloerverwarming leidingen leggen",
    "Ventilatiekanalen plaatsen",
    "Inspectie vóór dichtmaken",
  ],
  6: [
    "Vloerisolatie aanbrengen",
    "Spouw- / wandisolatie aanbrengen",
    "Dakisolatie aanbrengen",
    "Dampscherm plaatsen",
  ],
  7: [
    "Metalstud / regelwerk plaatsen",
    "Gipsplaten monteren",
    "Naden en hoeken afwerken",
  ],
  8: ["Wanden uitvlakken en stucen", "Plafonds afwerken", "Schuren en stofvrij maken"],
  9: [
    "Vloerverwarming controleren / afpersen",
    "Dekvloer storten",
    "Uithardingstijd afwachten",
  ],
  10: [
    "Stopcontacten en schakelaars monteren",
    "Verlichting ophangen en aansluiten",
    "Kranen en sanitair aansluiten",
    "CV-ketel / warmtepomp in bedrijf stellen",
    "Groepenkast afmonteren en testen",
  ],
  11: [
    "Tegelwerk badkamer en keuken",
    "Vloeren leggen",
    "Binnendeuren plaatsen",
    "Schilderwerk",
    "Keuken plaatsen",
    "Sanitair afmonteren",
  ],
  12: [
    "Restpuntenlijst opstellen",
    "Restpunten oplossen",
    "Schoonmaak",
    "Opleverinspectie",
  ],
};
