import type { FurnitureKind } from "./types";

export const FURNITURE_DEFAULTS: Record<FurnitureKind, { w: number; d: number; h: number; label: string; color: string }> = {
  "bed-single":     { w: 0.90, d: 2.00, h: 0.55, label: "Eenpersoonsbed",  color: "#ddd5c8" },
  "bed-double":     { w: 1.40, d: 2.00, h: 0.55, label: "Tweepersoonsbed", color: "#ddd5c8" },
  "bed-king":       { w: 1.80, d: 2.10, h: 0.55, label: "Kingsize bed",    color: "#ddd5c8" },
  "sofa-2":         { w: 1.60, d: 0.85, h: 0.85, label: "Bank 2-zits",     color: "#c8b89a" },
  "sofa-3":         { w: 2.20, d: 0.90, h: 0.85, label: "Bank 3-zits",     color: "#c8b89a" },
  "sofa-l":         { w: 2.60, d: 1.60, h: 0.85, label: "Hoekbank",        color: "#c8b89a" },
  "dining-table":   { w: 1.60, d: 0.90, h: 0.76, label: "Eettafel",        color: "#b8a070" },
  "dining-chair":   { w: 0.45, d: 0.50, h: 0.90, label: "Stoel",           color: "#c4a882" },
  "desk":           { w: 1.40, d: 0.70, h: 0.76, label: "Bureau",          color: "#b8a070" },
  "office-chair":   { w: 0.60, d: 0.60, h: 1.10, label: "Bureaustoel",     color: "#c4a882" },
  "wardrobe":       { w: 1.20, d: 0.60, h: 2.20, label: "Kledingkast",     color: "#c4a882" },
  "bookshelf":      { w: 0.80, d: 0.30, h: 2.00, label: "Boekenkast",      color: "#c4a882" },
  "tv-unit":        { w: 1.80, d: 0.45, h: 0.50, label: "TV-meubel",       color: "#b8a070" },
  "coffee-table":   { w: 1.10, d: 0.60, h: 0.42, label: "Salontafel",      color: "#b8a070" },
  "bathtub":        { w: 1.70, d: 0.75, h: 0.55, label: "Bad",             color: "#e8f4f8" },
  "shower-cabin":   { w: 0.90, d: 0.90, h: 2.20, label: "Douchecabine",    color: "#d4eaf0" },
  "kitchen-island": { w: 1.20, d: 0.90, h: 0.90, label: "Keukeneiland",    color: "#e8e0d0" },
  "kitchen-base":   { w: 0.60, d: 0.60, h: 0.90, label: "Onderkast",       color: "#f0ece4" },
  "kitchen-high":   { w: 0.60, d: 0.60, h: 2.10, label: "Hoge kast",       color: "#f0ece4" },
  "kitchen-upper":  { w: 0.60, d: 0.35, h: 0.70, label: "Bovenkast",       color: "#f0ece4" },
  "kitchen-corner": { w: 0.90, d: 0.90, h: 0.90, label: "Hoekkast",        color: "#f0ece4" },
};

export const FURNITURE_CATEGORIES: { label: string; kinds: FurnitureKind[] }[] = [
  { label: "Wonen",    kinds: ["sofa-2", "sofa-3", "sofa-l", "coffee-table", "tv-unit", "bookshelf"] },
  { label: "Slapen",   kinds: ["bed-single", "bed-double", "bed-king", "wardrobe"] },
  { label: "Eten",     kinds: ["dining-table", "dining-chair", "desk", "office-chair"] },
  { label: "Badkamer", kinds: ["bathtub", "shower-cabin"] },
  { label: "Keuken",   kinds: ["kitchen-island", "kitchen-base", "kitchen-high", "kitchen-upper", "kitchen-corner"] },
];
