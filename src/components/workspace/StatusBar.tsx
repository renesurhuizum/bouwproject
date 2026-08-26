"use client";

// Statusbalk onder de werkruimte (alleen desktop): raster, snap, meldingen en
// het ramingstotaal. Alles wat je continu wilt zien maar nooit hoeft aan te
// klikken — voorheen verspreid over drie zwevende panelen.

import clsx from "clsx";
import { Grid3x3, Magnet, AlertTriangle, ShieldCheck } from "lucide-react";
import { useIssues, useTakeoff } from "@/lib/hooks";
import { useEditor, GRID_SNAP_M } from "@/lib/store/editor";
import { formatEuro } from "@/lib/format";

const SNAP_LABEL: Record<keyof typeof GRID_SNAP_M, string> = {
  fine: "10 cm",
  normal: "50 cm",
  coarse: "1 m",
};

export function StatusBar() {
  const showGrid = useEditor((s) => s.showGrid);
  const toggleGrid = useEditor((s) => s.toggleGrid);
  const gridSnap = useEditor((s) => s.gridSnap);
  const cycleGridSnap = useEditor((s) => s.cycleGridSnap);
  const setInspectorTab = useEditor((s) => s.setInspectorTab);
  const { counts, issues } = useIssues();
  const { level, total } = useTakeoff();

  const problems = counts.error + counts.warn;

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 text-[11px] text-ink-500">
      <button
        onClick={toggleGrid}
        className="flex items-center gap-1.5 rounded-control px-1.5 py-0.5 font-medium transition-colors hover:bg-paper-sunken hover:text-ink-900"
        title="Raster tonen of verbergen"
      >
        <Grid3x3 size={12} aria-hidden />
        Raster {showGrid ? "aan" : "uit"}
      </button>

      <button
        onClick={cycleGridSnap}
        className="flex items-center gap-1.5 rounded-control px-1.5 py-0.5 font-medium transition-colors hover:bg-paper-sunken hover:text-ink-900"
        title="Snapafstand wisselen"
      >
        <Magnet size={12} aria-hidden />
        Snap <span className="tabular">{SNAP_LABEL[gridSnap]}</span>
      </button>

      {level && <span className="truncate">{level.name}</span>}

      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={() => setInspectorTab("issues")}
          className={clsx(
            "flex items-center gap-1.5 rounded-control px-1.5 py-0.5 font-semibold transition-colors hover:bg-paper-sunken",
            problems > 0 ? "text-warn" : "text-ok",
          )}
          title="Meldingen tonen"
        >
          {problems > 0 ? (
            <>
              <AlertTriangle size={12} aria-hidden />
              {problems} melding{problems === 1 ? "" : "en"}
            </>
          ) : (
            <>
              <ShieldCheck size={12} aria-hidden />
              {issues.length === 0 ? "Geen meldingen" : `${issues.length} tip(s)`}
            </>
          )}
        </button>

        <button
          onClick={() => setInspectorTab("takeoff")}
          className="flex items-center gap-1.5 rounded-control px-1.5 py-0.5 transition-colors hover:bg-paper-sunken hover:text-ink-900"
          title="Kostenraming tonen"
        >
          Raming
          <span className="tabular font-bold text-ink-900">{formatEuro(total)}</span>
        </button>
      </div>
    </div>
  );
}
