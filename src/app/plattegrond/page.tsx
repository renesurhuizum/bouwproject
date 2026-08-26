"use client";

// De werkruimte: één scherm waarin je ontwerpt, waar eerder drie losse routes
// (plattegrond, 3D, aanzichten) stonden. De weergave in het midden wisselt,
// de rail links en de inspector rechts blijven staan — zodat je je selectie,
// je stap en je raming niet kwijtraakt bij het wisselen.

import dynamic from "next/dynamic";
import { PanelLeft } from "lucide-react";
import { useEditor } from "@/lib/store/editor";
import { useWalls, useActiveLevel } from "@/lib/hooks";
import { WorkspaceLayout } from "@/components/workspace/WorkspaceLayout";
import { ViewSwitch } from "@/components/workspace/ViewSwitch";
import { PhaseRail } from "@/components/workspace/PhaseRail";
import { Inspector } from "@/components/workspace/Inspector";
import { StatusBar } from "@/components/workspace/StatusBar";
import { Toolbar } from "@/components/editor2d/Toolbar";
import { LevelSwitcher } from "@/components/editor2d/LevelSwitcher";
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

  return (
    <WorkspaceLayout
      rail={
        <>
          <PhaseRail />
          {/* De tekengereedschappen horen bij de plattegrond; in 3D staat de
              eigen 3D-toolbar over het beeld en in aanzicht is er niets te
              tekenen. */}
          {viewMode === "2d" && <Toolbar />}
        </>
      }
      viewport={
        <>
          {viewMode === "2d" && (
            <>
              <PlanEditor />
              <LevelSwitcher />
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

          {/* Alleen mobiel: de faserail is daar een uitschuifbaar paneel. */}
          <button
            onClick={() => setRailOpen(true)}
            aria-label="Bouwvolgorde openen"
            className="no-print absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-panel border border-line bg-paper-raised/95 text-ink-600 shadow-panel backdrop-blur lg:hidden"
          >
            <PanelLeft size={16} aria-hidden />
          </button>
        </>
      }
      inspector={<Inspector />}
      statusbar={<StatusBar />}
    />
  );
}
