"use client";

// Het rechterpaneel. Op desktop een gedockte kolom met drie tabbladen; op
// mobiel exact de zwevende panelen van vóór de omzetting, plus een raming-chip.
//
// Elke onderliggende component wordt precies één keer gemonteerd — vandaar de
// splitsing op useIsDesktop() in plaats van twee varianten die elkaar met
// hidden/lg:block verbergen (dat zou alle Dexie-live-queries verdubbelen).

import { useState } from "react";
import { Receipt, X } from "lucide-react";
import { useIsDesktop } from "@/lib/hooks";
import { useEditor, type InspectorTab } from "@/lib/store/editor";
import { useTakeoff } from "@/lib/hooks";
import { formatEuro } from "@/lib/format";
import { SegmentedControl, type Segment } from "@/components/ui/SegmentedControl";
import { Button } from "@/components/ui/Button";
import { ComplianceBanner } from "@/components/editor2d/ComplianceBanner";
import { SelectionPanel } from "@/components/editor2d/SelectionPanel";
import { LiveTakeoff } from "./LiveTakeoff";
import { IssuesList } from "./IssuesList";

const TABS: readonly Segment<InspectorTab>[] = [
  { key: "selection", label: "Selectie" },
  { key: "takeoff", label: "Raming" },
  { key: "issues", label: "Meldingen" },
];

export function Inspector() {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DockedInspector /> : <FloatingInspector />;
}

function DockedInspector() {
  const tab = useEditor((s) => s.inspectorTab);
  const setTab = useEditor((s) => s.setInspectorTab);
  const selection = useEditor((s) => s.selection);
  const multi = useEditor((s) => s.multi);
  const tool = useEditor((s) => s.tool);

  // Dezelfde voorwaarde die SelectionPanel zelf hanteert om niets te tonen.
  const placing = tool === "place" || tool === "draw-pipe";
  const hasSelection = !placing && (Boolean(selection) || multi.length > 1);

  return (
    <>
      <SegmentedControl
        segments={TABS}
        value={tab}
        onChange={setTab}
        size="sm"
        className="shrink-0 rounded-none border-b border-line bg-paper-raised p-1.5"
        ariaLabel="Inspector"
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {tab === "selection" &&
          (hasSelection ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SelectionPanel />
            </div>
          ) : (
            <p className="px-3 py-10 text-center text-xs text-ink-500">
              {placing
                ? "Plaatsmodus actief — klik in de plattegrond om te plaatsen."
                : "Selecteer een muur, ruimte of installatie om de eigenschappen te zien."}
            </p>
          ))}
        {tab === "takeoff" && <LiveTakeoff />}
        {tab === "issues" && <IssuesList />}
      </div>
    </>
  );
}

function FloatingInspector() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { total } = useTakeoff();

  return (
    <>
      {/* Het selectiepaneel zit op mobiel in de onderste stapel van de
          werkruimte-pagina, samen met de gereedschapsbalk — hier dus niet. */}
      <ComplianceBanner />

      {/* Raming-chip rechtsboven — op mobiel het enige nieuwe element; de
          volledige staat opent als sheet zodat het canvas vrij blijft. */}
      <button
        onClick={() => setSheetOpen(true)}
        className="no-print absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-panel border border-line bg-paper-raised/95 px-3 py-2 text-xs font-semibold text-ink-700 shadow-panel backdrop-blur"
        title="Hoeveelheden en kostenraming"
      >
        <Receipt size={14} className="text-accent-ink" aria-hidden />
        <span className="tabular">{formatEuro(total)}</span>
      </button>

      {sheetOpen && (
        <>
          <button
            aria-label="Raming sluiten"
            onClick={() => setSheetOpen(false)}
            className="fixed inset-0 z-40 bg-ink-900/40"
          />
          <div className="safe-bottom fixed inset-x-0 bottom-0 z-50 flex max-h-[70vh] flex-col rounded-t-panel border-t border-line bg-paper-raised shadow-panel">
            <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
              <h2 className="label-micro">Hoeveelheden &amp; raming</h2>
              <Button size="sm" variant="ghost" iconOnly onClick={() => setSheetOpen(false)} aria-label="Sluiten">
                <X size={16} />
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <LiveTakeoff />
            </div>
          </div>
        </>
      )}
    </>
  );
}
