"use client";

// De werkruimte: één scherm waarin je ontwerpt, waar eerder drie losse routes
// (plattegrond, 3D, aanzichten) stonden. De weergave in het midden wisselt,
// de rail links en de inspector rechts blijven staan — zodat je je selectie,
// je stap en je raming niet kwijtraakt bij het wisselen.

import { useState } from "react";
import dynamic from "next/dynamic";
import { PanelLeft, Zap } from "lucide-react";
import { useEditor } from "@/lib/store/editor";
import { useWalls, useActiveLevel, useIsDesktop } from "@/lib/hooks";
import { WorkspaceLayout } from "@/components/workspace/WorkspaceLayout";
import { ViewSwitch } from "@/components/workspace/ViewSwitch";
import { PhaseRail } from "@/components/workspace/PhaseRail";
import { Inspector } from "@/components/workspace/Inspector";
import { StatusBar } from "@/components/workspace/StatusBar";
import { Toolbar } from "@/components/editor2d/Toolbar";
import { SelectionPanel } from "@/components/editor2d/SelectionPanel";
import { LevelSwitcher } from "@/components/editor2d/LevelSwitcher";
import { GroepenkastPanel } from "@/components/editor2d/GroepenkastPanel";
import { ElevationViewer } from "@/components/werkblad/ElevationViewer";

// Konva en Three hebben window nodig → alleen in de browser laden.
const PlanEditor = dynamic(
  () => import("@/components/editor2d/PlanEditor").then((m) => m.PlanEditor),
  { ssr: false, loading: () => <ViewportLoading label="Plattegrond laden…" /> },
);

const Scene3D = dynamic(() => import("@/components/scene3d/Scene3D").then((m) => m.Scene3D), {
  ssr: false,
  loading: () => <ViewportLoading label="3D laden…" />,
});

const Edit3DToolbar = dynamic(
  () => import("@/components/scene3d/Edit3DToolbar").then((m) => m.Edit3DToolbar),
  { ssr: false },
);

function ViewportLoading({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-ink-500">{label}</div>
  );
}

export default function WerkruimtePage() {
  const viewMode = useEditor((s) => s.viewMode);
  const setRailOpen = useEditor((s) => s.setRailOpen);
  const level = useActiveLevel();
  const walls = useWalls(level?.id) ?? [];
  const [showGroepenkast, setShowGroepenkast] = useState(false);
  const isDesktop = useIsDesktop();

  return (
    <WorkspaceLayout
      rail={
        <>
          <PhaseRail />
          {/* De tekengereedschappen horen bij de plattegrond; in 3D staat de
              eigen 3D-toolbar over het beeld en in aanzicht is er niets te
              tekenen. */}
          {viewMode === "2d" && isDesktop && <Toolbar />}
        </>
      }
      viewport={
        <>
          {viewMode === "2d" && (
            <>
              <PlanEditor />
              <LevelSwitcher />
              {/* Op mobiel stapelen selectie en gereedschap in normale flow
                  onderin, zodat een hoog contextueel paneel het selectiepaneel
                  nooit overlapt — dezelfde opzet als vóór de werkruimte. Op
                  desktop staan ze elk in hun eigen kolom. */}
              {!isDesktop && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center">
                  <SelectionPanel />
                  <Toolbar />
                </div>
              )}
            </>
          )}

          {viewMode === "3d" && (
            <>
              <Scene3D />
              <LevelSwitcher />
              <Edit3DToolbar />
              {walls.length === 0 && (
                <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center px-4">
                  <p className="pointer-events-auto rounded-panel border border-line bg-paper-raised/95 px-4 py-2.5 text-center text-sm text-ink-700 shadow-panel backdrop-blur">
                    Teken eerst muren op de{" "}
                    <span className="font-semibold text-accent-ink">plattegrond</span> — ze
                    verschijnen hier automatisch in 3D.
                  </p>
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                <span className="rounded-full bg-ink-900/80 px-3 py-1 text-[11px] text-paper-raised backdrop-blur">
                  Sleep om te draaien · knijp/scroll om te zoomen
                </span>
              </div>
            </>
          )}

          {viewMode === "elevation" && (
            <div className="print-area absolute inset-0 overflow-y-auto pt-14">
              <ElevationViewer />
            </div>
          )}

          <ViewSwitch />

          <div className="no-print absolute left-3 top-3 z-10 flex gap-2">
            {/* Alleen mobiel: de faserail is daar een uitschuifbaar paneel. */}
            <button
              onClick={() => setRailOpen(true)}
              aria-label="Bouwvolgorde openen"
              className="flex h-9 w-9 items-center justify-center rounded-panel border border-line bg-paper-raised/95 text-ink-600 shadow-panel backdrop-blur lg:hidden"
            >
              <PanelLeft size={16} aria-hidden />
            </button>
            <button
              onClick={() => setShowGroepenkast(true)}
              title="Eindgroepen beheren en kabellengtes bekijken"
              className="flex h-9 items-center justify-center gap-1.5 rounded-panel border border-blueprint/40 bg-paper-raised/95 px-2.5 text-xs font-semibold text-blueprint shadow-panel backdrop-blur sm:px-3"
            >
              <Zap size={15} aria-hidden />
              <span className="hidden sm:inline">Groepen</span>
            </button>
          </div>

          {showGroepenkast && <GroepenkastPanel onClose={() => setShowGroepenkast(false)} />}
        </>
      }
      inspector={<Inspector />}
      statusbar={<StatusBar />}
    />
  );
}
