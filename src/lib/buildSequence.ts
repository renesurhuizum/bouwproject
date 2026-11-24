// 4D: wanneer verschijnt (of verdwijnt) een element in de bouwvolgorde?
//
// "Stap" = fase-volgorde (Phase.order). Een element met een eigen `phaseId`
// volgt die fase; anders geldt een logische NL-default gebaseerd op de
// standaardfasering (2 sloop · 3 constructief · 4 ruwbouw · 5 installaties
// 1e fase · 7 wanden dicht · 10 installaties 2e fase · 11 afwerking).
// Stap 0 = huidige situatie (vóór de verbouwing).

import { create } from "zustand";
import type { ElectricalItem, HvacItem, Phase, PlumbingItem, Wall } from "./domain/types";

export const STEP = {
  existing: 0,
  demolition: 2,
  structural: 3,
  shell: 4,
  firstFix: 5,
  drywall: 7,
  secondFix: 10,
  finishing: 11,
} as const;

export interface Span {
  appear: number;
  disappear?: number; // exclusief: bij deze stap is het weg
}

export function phaseOrderMap(phases: Phase[]): Map<string, number> {
  return new Map(phases.map((p) => [p.id, p.order]));
}

export function wallSpan(w: Wall, orders: Map<string, number>): Span {
  const own = w.phaseId ? orders.get(w.phaseId) : undefined;
  if (w.status === "existing") return { appear: STEP.existing };
  if (w.status === "demolish") return { appear: STEP.existing, disappear: own ?? STEP.demolition };
  const lightweight = w.material === "gypsum" || (w.material === "timber-frame" && !w.loadBearing);
  return { appear: own ?? (lightweight ? STEP.drywall : STEP.shell) };
}

export function electricalSpan(e: ElectricalItem): Span {
  return { appear: e.type === "panel" ? STEP.firstFix : STEP.secondFix };
}

export function plumbingSpan(p: PlumbingItem): Span {
  return { appear: p.type === "fixture" ? (p.fixture === "boiler" ? STEP.firstFix : STEP.secondFix) : STEP.firstFix };
}

export function hvacSpan(h: HvacItem): Span {
  if (h.path && h.path.length >= 2) return { appear: STEP.firstFix };
  return { appear: h.type === "wtw" || h.type === "floor-heating" ? STEP.firstFix : STEP.secondFix };
}

export function visibleAt(span: Span, step: number | null): boolean {
  if (step == null) return true;
  return span.appear <= step && (span.disappear == null || step < span.disappear);
}

/** Valt het element precies in de getoonde stap (om te markeren)? */
export function activeAt(span: Span, step: number | null): boolean {
  return step != null && step > 0 && span.appear === step;
}

// UI-state (niet persistent): null = volledig eindontwerp tonen.
interface BuildSequenceState {
  step: number | null;
  setStep: (s: number | null) => void;
}

export const useBuildSequence = create<BuildSequenceState>()((set) => ({
  step: null,
  setStep: (step) => set({ step }),
}));
