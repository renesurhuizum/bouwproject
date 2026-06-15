// Domeinmodel voor de renovatie digital twin.
// Alle coördinaten en lengtes in METERS (opgeslagen met mm-precisie).
// Elke entiteit erft van `Entity` zodat last-write-wins cloud-sync er later
// netjes bovenop kan: id (uuid) + updatedAt + soft-delete vlag.

export interface Entity {
  id: string;
  updatedAt: number; // epoch ms
  deleted?: boolean;
}

export interface Point {
  x: number;
  y: number;
}

// ── Structuur ────────────────────────────────────────────────────────────────

export interface Project extends Entity {
  name: string;
  description?: string;
  northDegrees?: number;  // voor noordpijl op werkblad (0 = omhoog = Noord)
  startDate?: string;     // ISO yyyy-mm-dd voor Gantt
  revisionNumber?: number; // revisie-nummer (0 = eerste uitgave)
  revisionDate?: string;   // ISO datum van laatste revisie
  drawingScale?: number;   // tekeningschaal: 50 | 100 | 200 (1:50 etc.)
}

export interface Level extends Entity {
  projectId: string;
  name: string; // "Begane grond", "Verdieping"
  elevation: number; // vloerpeil in m t.o.v. nulpeil
  height: number; // standaard verdiepingshoogte in m
  order: number;
  bgImageBlob?: Blob; // optionele achtergrondafbeelding als natekenhulp
  bgImageOpacity?: number; // 0-1, default 0.4
  bgImageScale?: number; // m/pixel, zodat het op de juiste schaal past
  bgImageOffsetX?: number; // wereld-x van linkerbovenhoek in m
  bgImageOffsetY?: number; // wereld-y van linkerbovenhoek in m
}

export type WallStatus = "existing" | "new" | "demolish";

export type WallMaterial =
  | "brick" // baksteen / metselwerk
  | "sand-lime" // kalkzandsteen
  | "concrete" // beton
  | "aerated-concrete" // cellenbeton (gasbeton)
  | "timber-frame" // houtskeletbouw
  | "gypsum" // gipsplaat / metalstud
  | "other";

export interface Wall extends Entity {
  levelId: string;
  start: Point;
  end: Point;
  thickness: number; // m
  height: number; // m
  material: WallMaterial;
  loadBearing: boolean; // dragend?
  status: WallStatus;
}

export type OpeningType = "door" | "window" | "passage";

export interface Opening extends Entity {
  wallId: string;
  type: OpeningType;
  width: number; // m
  height: number; // m
  sillHeight: number; // borsthoogte in m (0 bij deur/doorgang)
  offset: number; // m vanaf wall.start langs de muur
}

export type FloorMaterial = "tile" | "wood" | "carpet" | "stone" | "concrete";

export interface Room extends Entity {
  levelId: string;
  name: string;
  func?: string; // functie: woonkamer, badkamer...
  polygon: Point[]; // gesloten contour
  color?: string;
  wallColor?: string;      // wandverf-kleur voor 3D
  floorMaterial?: FloorMaterial;
}

// ── Installaties ──────────────────────────────────────────────────────────────

export type ElectricalType =
  | "socket" // stopcontact
  | "socket-double"
  | "switch" // schakelaar
  | "light" // lichtpunt (plafond)
  | "spot" // inbouwspot
  | "wall-light" // wandlamp
  | "data" // UTP/data
  | "panel" // meterkast/groepenkast
  | "perilex" // kookgroep 2-fase (krachtstroom)
  | "outdoor"; // buitenpunt

export interface ElectricalItem extends Entity {
  levelId: string;
  type: ElectricalType;
  position: Point;
  heightZ: number; // m boven vloer
  group?: string; // groepnummer
  wallId?: string;
  label?: string;
  note?: string;
  path?: Point[]; // kabeltraject (optioneel)
  linkedIds?: string[]; // gekoppelde elementen (schakelaar → lichtpunt)
}

export type PlumbingType =
  | "supply-cold" // koud water aanvoer (leiding)
  | "supply-hot" // warm water aanvoer (leiding)
  | "drain" // afvoer (leiding)
  | "cv-pipe" // cv-leiding (leiding)
  | "fixture"; // tappunt/sanitair

export type FixtureKind =
  | "toilet"
  | "sink" // wastafel
  | "shower"
  | "bath"
  | "kitchen-tap"
  | "washing-machine"
  | "boiler" // cv-ketel / boiler
  | "outdoor-tap";

export interface PlumbingItem extends Entity {
  levelId: string;
  type: PlumbingType;
  path?: Point[]; // bij leidingen
  position?: Point; // bij tappunt/sanitair
  diameter?: number; // mm
  fixture?: FixtureKind;
  heightZ?: number; // m
  note?: string;
}

export type FurnitureKind =
  | "bed-single" | "bed-double" | "bed-king"
  | "sofa-2" | "sofa-3" | "sofa-l"
  | "dining-table" | "dining-chair" | "desk" | "office-chair"
  | "wardrobe" | "bookshelf" | "tv-unit" | "coffee-table"
  | "bathtub" | "shower-cabin" | "kitchen-island"
  | "kitchen-base" | "kitchen-high" | "kitchen-upper" | "kitchen-corner";

export interface Furniture extends Entity {
  levelId: string;
  kind: FurnitureKind;
  position: Point;
  rotation: number;      // graden, vrij (0–360); presets 0/90/180/270 in de UI
  width?: number;        // m (override)
  depth?: number;        // m (override)
  color?: string;
}

export type HvacType =
  | "cv-pipe" // cv-leiding
  | "radiator"
  | "floor-heating" // vloerverwarming-verdeler/veld
  | "ventilation" // kanaal/rooster
  | "wtw"; // warmteterugwin-unit

export interface HvacItem extends Entity {
  levelId: string;
  type: HvacType;
  path?: Point[];
  position?: Point;
  heightZ?: number;
  note?: string;
}

// ── Bouwkundige elementen (constructie) ──────────────────────────────────────

export type StaircaseKind = "straight" | "l-shape" | "spiral";

export interface Staircase extends Entity {
  levelId: string;
  kind: StaircaseKind;
  position: Point; // linkerbovenhoek van de omhullende rechthoek
  width: number; // m (trapbreedte)
  run: number; // m (horizontale looplengte)
  steps: number; // aantal treden
  rotation: number; // graden
  direction: "up" | "down"; // looprichting (op/af)
}

export type ColumnShape = "round" | "square";

export interface Column extends Entity {
  levelId: string;
  position: Point;
  shape: ColumnShape;
  size: number; // diameter (rond) of zijde (vierkant), m
  height?: number; // m (default = verdiepingshoogte)
  material: WallMaterial;
  loadBearing: boolean;
}

export type BeamProfile = "HEA100" | "HEA140" | "HEA160" | "HEB200" | "custom";

export interface Beam extends Entity {
  levelId: string;
  start: Point;
  end: Point;
  profile: BeamProfile;
  height: number; // m boven vloer (positie in de gevel, voor 3D)
  width?: number; // flensbreedte m (override bij custom)
}

// ── Dak ───────────────────────────────────────────────────────────────────────

export type RoofType = "gable" | "hip" | "shed" | "flat" | "mansard";

export interface Roof extends Entity {
  levelId: string; // hoort bij de bovenste verdieping
  type: RoofType;
  pitch: number; // hellingshoek in graden
  ridgeDirection: number; // richting van de nok (graden, 0 = nok langs X)
  overhang: number; // dakoversteek in m
  polygon?: Point[]; // optioneel dakvoet-polygoon; anders bounding box van de muren
}

export interface SectionLine extends Entity {
  levelId: string;
  start: Point;
  end: Point;
  label: string; // "A-A", "B-B"…
}

export type DormerType = "gable-dormer" | "shed-dormer" | "velux";

export interface Dormer extends Entity {
  roofId: string;
  type: DormerType;
  position: Point; // positie op het dakvlak (plan-coördinaten)
  width: number; // m
  height: number; // m (kapelhoogte of velux-hoogte)
}

// ── Planning & uitvoering ─────────────────────────────────────────────────────

export type PhaseStatus = "todo" | "in-progress" | "done";

export interface Phase extends Entity {
  projectId: string;
  name: string;
  order: number;
  status: PhaseStatus;
  dependsOn: string[]; // phase ids die eerst klaar moeten zijn
  color?: string;
  note?: string;
  startDate?: string;    // ISO yyyy-mm-dd
  durationDays?: number;
}

export interface TaskItem extends Entity {
  projectId: string;
  phaseId: string;
  roomId?: string;
  title: string;
  done: boolean;
}

// ── Kosten ────────────────────────────────────────────────────────────────────

export interface BudgetLine extends Entity {
  projectId: string;
  phaseId?: string;
  category: string;
  amount: number; // begroot in euro
}

export interface Expense extends Entity {
  projectId: string;
  phaseId?: string;
  roomId?: string;
  description: string;
  amount: number; // euro
  date: string; // ISO yyyy-mm-dd
  vendor?: string;
  category: string;
  photoId?: string;
}

export type MaterialStatus = "needed" | "ordered" | "delivered";

export interface MaterialItem extends Entity {
  projectId: string;
  name: string;
  quantity: number;
  unit: string; // st, m, m2, zak...
  unitPrice?: number;
  status: MaterialStatus;
  phaseId?: string;
}

export interface Photo extends Entity {
  projectId: string;
  blob?: Blob;
  caption?: string;
  roomId?: string;
  levelId?: string;
}

// Layer-zichtbaarheid in de editor
export type EditorLayer =
  | "structure"
  | "construction"
  | "roof"
  | "electrical"
  | "plumbing"
  | "hvac"
  | "rooms"
  | "furniture";
