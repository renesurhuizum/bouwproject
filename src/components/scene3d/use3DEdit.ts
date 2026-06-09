import { create } from "zustand";
import type { FurnitureKind, ElectricalType } from "@/lib/domain/types";

export type Edit3DMode = "none" | "place-furniture" | "place-electrical";

interface Edit3DState {
  mode: Edit3DMode;
  furnitureKind: FurnitureKind | null;
  electricalType: ElectricalType | null;
  setFurnitureKind: (kind: FurnitureKind) => void;
  setElectricalType: (t: ElectricalType) => void;
  reset: () => void;
}

export const use3DEdit = create<Edit3DState>((set) => ({
  mode: "none",
  furnitureKind: null,
  electricalType: null,
  setFurnitureKind: (furnitureKind) => set({ furnitureKind, mode: "place-furniture" }),
  setElectricalType: (electricalType) => set({ electricalType, mode: "place-electrical" }),
  reset: () => set({ mode: "none", furnitureKind: null, electricalType: null }),
}));
