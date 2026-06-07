"use client";

// Plattegrond-scherm: canvas-editor (client-only) + tools + selectie-paneel.

import { useState } from "react";
import dynamic from "next/dynamic";
import { Sparkles } from "lucide-react";
import { Toolbar } from "@/components/editor2d/Toolbar";
import { SelectionPanel } from "@/components/editor2d/SelectionPanel";
import { IndelingGenerator } from "@/components/indeling/IndelingGenerator";

// Konva heeft window nodig → alleen in de browser laden.
const PlanEditor = dynamic(
  () => import("@/components/editor2d/PlanEditor").then((m) => m.PlanEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-ink-500">
        Plattegrond laden…
      </div>
    ),
  },
);

export default function PlattegrondPage() {
  const [showGen, setShowGen] = useState(false);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <PlanEditor />
      <SelectionPanel />
      <Toolbar />

      {/* Indeling-generator starten */}
      <button
        onClick={() => setShowGen(true)}
        className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-xl border border-accent/40 bg-paper-raised/95 px-3 py-2 text-xs font-semibold text-accent shadow-lg backdrop-blur"
      >
        <Sparkles size={15} /> Indeling
      </button>

      {showGen && <IndelingGenerator onClose={() => setShowGen(false)} />}
    </div>
  );
}
