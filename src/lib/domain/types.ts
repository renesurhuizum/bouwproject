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

export interface Room extends Entity {
  levelId: string;
  name: string;
  func?: string; // functie: woonkamer, badkamer...
  polygon: Point[]; // gesloten contour
  color?: string;
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
}

export type PlumbingType =
  | "supply-cold" // koud water aanvoer (leiding)
  | "supply-hot" // warm water aanvoer (leiding)
  | "drain" // afvoer (leiding)
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
  note?: string;
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
export type EditorLayer = "structure" | "electrical" | "plumbing" | "hvac" | "rooms";
