import { create } from "zustand";
import type { FixtureKind, FurnitureKind, ElectricalType, HvacType } from "@/lib/domain/types";

export type Edit3DMode =
  | "none"
  | "place-furniture"
  | "place-electrical"
  | "place-plumbing"
  | "place-hvac";

export interface SelectedItem3D {
  kind: "furniture" | "electrical" | "plumbing" | "hvac";
  id: string;
  label: string;
  screenX: number;
  screenY: number;
}

interface Edit3DState {
  mode: Edit3DMode;
  furnitureKind: FurnitureKind | null;
  electricalType: ElectricalType | null;
  plumbingFixture: FixtureKind | null;
  hvacType: HvacType | null;
  selectedItem: SelectedItem3D | null;
  setFurnitureKind: (kind: FurnitureKind) => void;
  setElectricalType: (t: ElectricalType) => void;
  setPlumbingFixture: (f: FixtureKind) => void;
  setHvacType: (t: HvacType) => void;
  setSelectedItem: (item: SelectedItem3D) => void;
  clearSelection: () => void;
  reset: () => void;
}

export const use3DEdit = create<Edit3DState>((set) => ({
  mode: "none",
  furnitureKind: null,
  electricalType: null,
  plumbingFixture: null,
  hvacType: null,
  selectedItem: null,
  setFurnitureKind: (furnitureKind) => set({ furnitureKind, mode: "place-furniture" }),
  setElectricalType: (electricalType) => set({ electricalType, mode: "place-electrical" }),
  setPlumbingFixture: (plumbingFixture) => set({ plumbingFixture, mode: "place-plumbing" }),
  setHvacType: (hvacType) => set({ hvacType, mode: "place-hvac" }),
  setSelectedItem: (selectedItem) => set({ selectedItem }),
  clearSelection: () => set({ selectedItem: null }),
  reset: () =>
    set({
      mode: "none",
      furnitureKind: null,
      electricalType: null,
      plumbingFixture: null,
      hvacType: null,
      selectedItem: null,
    }),
}));
