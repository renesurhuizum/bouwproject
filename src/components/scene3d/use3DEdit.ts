import { create } from "zustand";
import type { FurnitureKind, ElectricalType } from "@/lib/domain/types";

export type Edit3DMode = "none" | "place-furniture" | "place-electrical";

export interface SelectedItem3D {
  kind: "furniture" | "electrical";
  id: string;
  label: string;
  screenX: number;
  screenY: number;
}

interface Edit3DState {
  mode: Edit3DMode;
  furnitureKind: FurnitureKind | null;
  electricalType: ElectricalType | null;
  selectedItem: SelectedItem3D | null;
  setFurnitureKind: (kind: FurnitureKind) => void;
  setElectricalType: (t: ElectricalType) => void;
  setSelectedItem: (item: SelectedItem3D) => void;
  clearSelection: () => void;
  reset: () => void;
}

export const use3DEdit = create<Edit3DState>((set) => ({
  mode: "none",
  furnitureKind: null,
  electricalType: null,
  selectedItem: null,
  setFurnitureKind: (furnitureKind) => set({ furnitureKind, mode: "place-furniture" }),
  setElectricalType: (electricalType) => set({ electricalType, mode: "place-electrical" }),
  setSelectedItem: (selectedItem) => set({ selectedItem }),
  clearSelection: () => set({ selectedItem: null }),
  reset: () => set({ mode: "none", furnitureKind: null, electricalType: null, selectedItem: null }),
}));
