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
  Point,
  WallMaterial,
  WallStatus,
  StaircaseKind,
} from "../domain/types";

export type Tool =
  | "select"
  | "wall"
  | "room"
  | "place"
  | "divide"
  | "place-furniture"
  | "draw-pipe"
  | "trim"
  | "place-staircase"
  | "place-column"
  | "place-beam"
  | "place-roof"
  | "draw-section";

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
  | { domain: "hvac"; type: HvacType }
  | { domain: "staircase"; kind: StaircaseKind }
  | { domain: "column" }
  | { domain: "beam" }
  | { domain: "roof" }
  | { domain: "section" };

export interface ClipboardEntry {
  walls: Array<Record<string, unknown>>;
  openings: Array<Record<string, unknown>>;
  rooms: Array<Record<string, unknown>>;
  electrical: Array<Record<string, unknown>>;
  plumbing: Array<Record<string, unknown>>;
  hvac: Array<Record<string, unknown>>;
  furniture: Array<Record<string, unknown>>;
  bbox: { min: Point; max: Point };
}

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
  | "section";

export interface Selection {
  kind: SelKind;
  id: string;
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
  furniturePaletteKind: FurnitureKind | null;
  pipeType: "supply-cold" | "supply-hot" | "drain" | "cv-pipe";
  selection: Selection | null;
  multiSelection: Selection[];
  lasso: { start: Point; current: Point } | null;
  clipboard: ClipboardEntry | null;
  visibleLayers: Record<EditorLayer, boolean>;
  lockedLayers: Partial<Record<EditorLayer, boolean>>;
  wallDefaults: WallDefaults;
  showGrid: boolean;
  gridSnap: GridSnap;
  phaseOverlay: boolean;

  setActiveLevel: (id: string) => void;
  setTool: (t: Tool) => void;
  setPlaceKind: (p: PlaceKind | null) => void;
  setFurniturePaletteKind: (kind: FurnitureKind | null) => void;
  setPipeType: (t: "supply-cold" | "supply-hot" | "drain" | "cv-pipe") => void;
  select: (s: Selection | null) => void;
  setMultiSelection: (items: Selection[]) => void;
  toggleMultiItem: (s: Selection) => void;
  setLasso: (l: { start: Point; current: Point } | null) => void;
  setClipboard: (c: ClipboardEntry | null) => void;
  toggleLayer: (l: EditorLayer) => void;
  toggleLayerLock: (l: EditorLayer) => void;
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
      furniturePaletteKind: null,
      pipeType: "supply-cold",
      selection: null,
      multiSelection: [],
      lasso: null,
      clipboard: null,
      visibleLayers: {
        structure: true,
        electrical: true,
        plumbing: true,
        hvac: true,
        rooms: true,
        furniture: true,
        roof: true,
      },
      lockedLayers: {},
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

      setActiveLevel: (id) => set({ activeLevelId: id, selection: null, multiSelection: [] }),
      setTool: (tool) =>
        set((s) => ({
          tool,
          placeKind: tool === "place" ? s.placeKind : null,
          selection: null,
          multiSelection: [],
          lasso: null,
        })),
      setPlaceKind: (placeKind) => set({ placeKind, tool: "place" }),
      setFurniturePaletteKind: (kind) =>
        set({ furniturePaletteKind: kind, tool: kind ? "place-furniture" : "select" }),
      setPipeType: (pipeType) => set({ pipeType }),
      select: (selection) => set({
        selection,
        multiSelection: selection ? [selection] : [],
      }),
      setMultiSelection: (items) => set({
        multiSelection: items,
        selection: items.length === 1 ? items[0] : null,
      }),
      toggleMultiItem: (s) => set((state) => {
        const exists = state.multiSelection.some((x) => x.id === s.id);
        const next = exists
          ? state.multiSelection.filter((x) => x.id !== s.id)
          : [...state.multiSelection, s];
        return {
          multiSelection: next,
          selection: next.length === 1 ? next[0] : null,
        };
      }),
      setLasso: (lasso) => set({ lasso }),
      setClipboard: (clipboard) => set({ clipboard }),
      toggleLayer: (l) =>
        set((s) => ({
          visibleLayers: { ...s.visibleLayers, [l]: !s.visibleLayers[l] },
        })),
      toggleLayerLock: (l) =>
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
