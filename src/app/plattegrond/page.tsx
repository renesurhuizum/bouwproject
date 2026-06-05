"use client";

// Plattegrond-scherm: canvas-editor (client-only) + tools + selectie-paneel.

import dynamic from "next/dynamic";
import { Toolbar } from "@/components/editor2d/Toolbar";
import { SelectionPanel } from "@/components/editor2d/SelectionPanel";

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
  return (
    <div className="absolute inset-0 overflow-hidden">
      <PlanEditor />
      <SelectionPanel />
      <Toolbar />
    </div>
  );
}
