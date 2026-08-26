"use client";

// 2D / 3D / Aanzicht binnen één werkruimte. Vervangt het springen tussen drie
// losse routes, waarbij je telkens je selectie en camera kwijtraakte.

import { LayoutTemplate, Box, Frame } from "lucide-react";
import { useEditor, type ViewMode } from "@/lib/store/editor";
import { SegmentedControl, type Segment } from "@/components/ui/SegmentedControl";

const SEGMENTS: readonly Segment<ViewMode>[] = [
  {
    key: "2d",
    label: (
      <span className="flex items-center justify-center gap-1.5">
        <LayoutTemplate size={14} aria-hidden />
        <span className="hidden sm:inline">Plattegrond</span>
      </span>
    ),
    title: "Plattegrond bewerken",
  },
  {
    key: "3d",
    label: (
      <span className="flex items-center justify-center gap-1.5">
        <Box size={14} aria-hidden />
        <span className="hidden sm:inline">3D</span>
      </span>
    ),
    title: "Door het huis kijken",
  },
  {
    key: "elevation",
    label: (
      <span className="flex items-center justify-center gap-1.5">
        <Frame size={14} aria-hidden />
        <span className="hidden sm:inline">Aanzicht</span>
      </span>
    ),
    title: "Wandaanzichten met maatvoering",
  },
];

export function ViewSwitch() {
  const viewMode = useEditor((s) => s.viewMode);
  const setViewMode = useEditor((s) => s.setViewMode);

  return (
    <div className="no-print pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-3">
      <SegmentedControl
        segments={SEGMENTS}
        value={viewMode}
        onChange={setViewMode}
        size="sm"
        ariaLabel="Weergave"
        className="pointer-events-auto w-full max-w-[11rem] sm:max-w-xs border border-line shadow-panel backdrop-blur supports-[backdrop-filter]:bg-paper-sunken/90"
      />
    </div>
  );
}
