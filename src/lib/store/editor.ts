// Vluchtige editor-UI-state (gereedschap, selectie, zichtbare lagen, defaults).
// Persistente data leeft in Dexie; dit is alleen de bedieningsstaat.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  EditorLayer,
  ElectricalType,
  FixtureKind,
  FurnitureKind,
  HvacType,
  OpeningType,
  WallMaterial,
  WallStatus,
  StaircaseKind,
  ColumnShape,
  BeamProfile,
  RoofType,
} from "../domain/types";

export type Tool =
  | "select"
  | "wall"
  | "room"
  | "place"
  | "divide"
  | "place-furniture"
  | "draw-pipe"
  | "construction"
  | "roof"
  | "section";

export type GridSnap = "fine" | "normal" | "coarse";
// fine = 10 cm, normal = 50 cm, coarse = 100 cm
export const GRID_SNAP_M: Record<GridSnap, number> = {
  fine: 0.1,
  normal: 0.5,
  coarse: 1.0,
};

export type PlaceKind =
  | { domain: "electrical"; type: ElectricalType }
  | { domain: "opening"; type: OpeningType }
  | { domain: "plumbing"; fixture: FixtureKind }
  | { domain: "hvac"; type: HvacType };

// Constructie-gereedschap: trap, kolom of stalen balk plaatsen.
export type ConstructionKind =
  | { domain: "staircase"; kind: StaircaseKind }
  | { domain: "column"; shape: ColumnShape }
  | { domain: "beam"; profile: BeamProfile };

export type SelKind =
  | "wall"
  | "room"
  | "electrical"
  | "plumbing"
  | "hvac"
  | "opening"
  | "furniture"
  | "staircase"
  | "column"
  | "beam"
  | "roof"
  | "dormer"
  | "section";

export interface Selection {
  kind: SelKind;
  id: string;
}

// Eén item op het klembord: het soort + de losse velden (zonder id/levelId),
// klaar om als nieuwe entiteit geplakt te worden. `srcId` bewaart de originele
// id zodat gekoppelde entiteiten (opening → muur) bij plakken herverbonden worden.
export interface ClipItem {
  kind: SelKind;
  srcId: string;
  data: Record<string, unknown>;
}
export interface Clipboard {
  items: ClipItem[];
}

interface WallDefaults {
  thickness: number;
  height: number;
  material: WallMaterial;
  loadBearing: boolean;
  status: WallStatus;
}

interface EditorState {
  activeLevelId: string | null;
  tool: Tool;
  placeKind: PlaceKind | null;
  constructionKind: ConstructionKind | null;
  roofType: RoofType;
  furniturePaletteKind: FurnitureKind | null;
  pipeType: "supply-cold" | "supply-hot" | "drain" | "cv-pipe";
  selection: Selection | null;
  multi: Selection[]; // meervoudige selectie (lasso / shift-klik). Leeg = enkelvoudig.
  clipboard: Clipboard | null;
  visibleLayers: Record<EditorLayer, boolean>;
  lockedLayers: Record<EditorLayer, boolean>;
  wallDefaults: WallDefaults;
  showGrid: boolean;
  gridSnap: GridSnap;
  phaseOverlay: boolean;

  setActiveLevel: (id: string) => void;
  setTool: (t: Tool) => void;
  setPlaceKind: (p: PlaceKind | null) => void;
  setConstructionKind: (k: ConstructionKind | null) => void;
  setRoofType: (t: RoofType) => void;
  setFurniturePaletteKind: (kind: FurnitureKind | null) => void;
  setPipeType: (t: "supply-cold" | "supply-hot" | "drain" | "cv-pipe") => void;
  select: (s: Selection | null) => void;
  setMulti: (s: Selection[]) => void;
  setClipboard: (c: Clipboard | null) => void;
  toggleLayer: (l: EditorLayer) => void;
  toggleLock: (l: EditorLayer) => void;
  setWallDefaults: (d: Partial<WallDefaults>) => void;
  toggleGrid: () => void;
  cycleGridSnap: () => void;
  togglePhaseOverlay: () => void;
}

export const useEditor = create<EditorState>()(
  persist(
    (set) => ({
      activeLevelId: null,
      tool: "select",
      placeKind: null,
      constructionKind: null,
      roofType: "gable",
      furniturePaletteKind: null,
      pipeType: "supply-cold",
      selection: null,
      multi: [],
      clipboard: null,
      visibleLayers: {
        structure: true,
        construction: true,
        roof: true,
        electrical: true,
        plumbing: true,
        hvac: true,
        rooms: true,
        furniture: true,
      },
      lockedLayers: {
        structure: false,
        construction: false,
        roof: false,
        electrical: false,
        plumbing: false,
        hvac: false,
        rooms: false,
        furniture: false,
      },
      wallDefaults: {
        thickness: 0.1,
        height: 2.6,
        material: "brick",
        loadBearing: false,
        status: "new",
      },
      showGrid: true,
      gridSnap: "fine",
      phaseOverlay: false,

      setActiveLevel: (id) => set({ activeLevelId: id, selection: null, multi: [] }),
      setTool: (tool) =>
        set((s) => ({
          tool,
          placeKind: tool === "place" ? s.placeKind : null,
          constructionKind: tool === "construction" ? s.constructionKind : null,
          selection: null,
          multi: [],
        })),
      setPlaceKind: (placeKind) => set({ placeKind, tool: "place" }),
      setConstructionKind: (constructionKind) => set({ constructionKind, tool: "construction" }),
      setRoofType: (roofType) => set({ roofType, tool: "roof" }),
      setFurniturePaletteKind: (kind) =>
        set({ furniturePaletteKind: kind, tool: kind ? "place-furniture" : "select" }),
      setPipeType: (pipeType) => set({ pipeType }),
      select: (selection) => set({ selection, multi: [] }),
      setMulti: (multi) => set({ multi, selection: null }),
      setClipboard: (clipboard) => set({ clipboard }),
      toggleLayer: (l) =>
        set((s) => ({
          visibleLayers: { ...s.visibleLayers, [l]: !s.visibleLayers[l] },
        })),
      toggleLock: (l) =>
        set((s) => ({
          lockedLayers: { ...s.lockedLayers, [l]: !s.lockedLayers[l] },
        })),
      setWallDefaults: (d) =>
        set((s) => ({ wallDefaults: { ...s.wallDefaults, ...d } })),
      toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
      togglePhaseOverlay: () => set((s) => ({ phaseOverlay: !s.phaseOverlay })),
      cycleGridSnap: () =>
        set((s) => {
          const order: GridSnap[] = ["fine", "normal", "coarse"];
          const next = order[(order.indexOf(s.gridSnap) + 1) % order.length];
          return { gridSnap: next };
        }),
    }),
    {
      name: "bouw-editor",
      partialize: (s) => ({
        activeLevelId: s.activeLevelId,
        visibleLayers: s.visibleLayers,
        lockedLayers: s.lockedLayers,
        wallDefaults: s.wallDefaults,
        showGrid: s.showGrid,
        gridSnap: s.gridSnap,
      }),
    },
  ),
);
