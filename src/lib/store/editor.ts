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
} from "../domain/types";

export type Tool = "select" | "wall" | "room" | "place" | "divide" | "place-furniture" | "draw-pipe";

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

export type SelKind =
  | "wall"
  | "room"
  | "electrical"
  | "plumbing"
  | "hvac"
  | "opening"
  | "furniture";

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
  visibleLayers: Record<EditorLayer, boolean>;
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
  toggleLayer: (l: EditorLayer) => void;
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
      visibleLayers: {
        structure: true,
        electrical: true,
        plumbing: true,
        hvac: true,
        rooms: true,
        furniture: true,
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

      setActiveLevel: (id) => set({ activeLevelId: id, selection: null }),
      setTool: (tool) =>
        set((s) => ({
          tool,
          placeKind: tool === "place" ? s.placeKind : null,
          selection: null,
        })),
      setPlaceKind: (placeKind) => set({ placeKind, tool: "place" }),
      setFurniturePaletteKind: (kind) =>
        set({ furniturePaletteKind: kind, tool: kind ? "place-furniture" : "select" }),
      setPipeType: (pipeType) => set({ pipeType }),
      select: (selection) => set({ selection }),
      toggleLayer: (l) =>
        set((s) => ({
          visibleLayers: { ...s.visibleLayers, [l]: !s.visibleLayers[l] },
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
        wallDefaults: s.wallDefaults,
        showGrid: s.showGrid,
        gridSnap: s.gridSnap,
      }),
    },
  ),
);
