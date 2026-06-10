"use client";

// Gantt-chart voor fasering. CSS-grid gebaseerd, geen externe lib.
// X-as: weken | Y-as: fases in volgorde | Afhankelijkheidspijlen via SVG-overlay.

import { useMemo, useState } from "react";
import type { Phase } from "@/lib/domain/types";
import { update } from "@/lib/db/repo";

const DAY_PX = 24;   // pixels per dag
const ROW_H = 44;    // pixels per fase-rij
const HEADER_H = 40; // pixels voor dag/week header

interface Props {
  phases: Phase[];
  projectStartDate?: string; // ISO yyyy-mm-dd
}

function parseDate(d: string): Date {
  return new Date(d + "T00:00:00");
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function fmt(d: Date): string {
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

export function GanttChart({ phases, projectStartDate }: Props) {
  const today = new Date();
  const startBase = projectStartDate ? parseDate(projectStartDate) : today;
  const [dragging, setDragging] = useState<{ phaseId: string; startDragX: number; origDur: number } | null>(null);
  const [preview, setPreview] = useState<{ phaseId: string; dur: number } | null>(null);

  // Bereken start/eind per fase op basis van afhankelijkheden + durationDays
  const schedule = useMemo(() => {
    const byId = new Map(phases.map((p) => [p.id, p]));
    const starts = new Map<string, Date>();
    const ends = new Map<string, Date>();

    const visiting = new Set<string>();

    function computeEnd(phase: Phase): Date {
      if (ends.has(phase.id)) return ends.get(phase.id)!;
      // Cyclus in dependsOn → afhankelijkheid negeren i.p.v. oneindig recursen.
      if (visiting.has(phase.id)) return startBase;
      visiting.add(phase.id);
      let depEnd = startBase;
      for (const depId of phase.dependsOn) {
        const dep = byId.get(depId);
        if (dep) {
          const de = computeEnd(dep);
          if (de > depEnd) depEnd = de;
        }
      }
      const start = phase.startDate ? parseDate(phase.startDate) : depEnd;
      starts.set(phase.id, start);
      const dur = phase.durationDays ?? 14;
      const end = addDays(start, dur);
      ends.set(phase.id, end);
      visiting.delete(phase.id);
      return end;
    }

    for (const p of phases) computeEnd(p);
    return { starts, ends };
  }, [phases, startBase]);

  // Totale tijdlijn breedte
  const maxEnd = phases.reduce((max, p) => {
    const e = schedule.ends.get(p.id);
    return e && e > max ? e : max;
  }, startBase);
  const totalDays = Math.max(diffDays(startBase, maxEnd) + 14, 60);
  const totalW = totalDays * DAY_PX;

  // Weekheaders
  const weeks: { x: number; label: string }[] = [];
  for (let d = 0; d < totalDays; d += 7) {
    const date = addDays(startBase, d);
    weeks.push({ x: d * DAY_PX, label: fmt(date) });
  }

  async function onResizeEnd(phaseId: string, newDur: number) {
    await update<Phase>("phases", phaseId, { durationDays: Math.max(1, newDur) });
    setDragging(null);
  }

  function STATUS_OPACITY(status: string) {
    if (status === "done") return 0.4;
    if (status === "in-progress") return 0.95;
    return 0.7;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-paper-raised">
      {/* Header rij met weekmarkers */}
      <div
        className="relative border-b border-line bg-paper-sunken"
        style={{ height: HEADER_H, width: totalW + 160 }}
      >
        <div className="sticky left-0 z-10 inline-block w-40 border-r border-line bg-paper-sunken px-3 py-2 text-[11px] font-semibold text-ink-500">
          Fase
        </div>
        {weeks.map((w) => (
          <div
            key={w.x}
            className="absolute top-0 flex h-full items-center text-[10px] text-ink-400"
            style={{ left: w.x + 160, paddingLeft: 4, borderLeft: "1px solid rgba(0,0,0,0.06)" }}
          >
            {w.label}
          </div>
        ))}
        {/* Vandaag-lijn */}
        {(() => {
          const todayX = diffDays(startBase, today) * DAY_PX;
          if (todayX < 0 || todayX > totalW) return null;
          return (
            <div
              className="absolute top-0 bottom-0 w-px bg-accent/70"
              style={{ left: todayX + 160 }}
            />
          );
        })()}
      </div>

      {/* Fase-rijen */}
      <div style={{ width: totalW + 160 }}>
        {phases.map((phase) => {
          const start = schedule.starts.get(phase.id) ?? startBase;
          const end = schedule.ends.get(phase.id) ?? addDays(start, 14);
          const x = diffDays(startBase, start) * DAY_PX;
          const previewDur = preview?.phaseId === phase.id ? preview.dur : null;
          const baseDays = diffDays(start, end);
          const effDays = previewDur ?? baseDays;
          const w = Math.max(effDays * DAY_PX, 40);
          const color = phase.color ?? "#78716c";
          const isDragging = dragging?.phaseId === phase.id;

          return (
            <div
              key={phase.id}
              className="relative flex items-center border-b border-line/50"
              style={{ height: ROW_H }}
            >
              {/* Naam (sticky links) */}
              <div
                className="sticky left-0 z-10 flex w-40 shrink-0 items-center gap-2 border-r border-line bg-paper-raised/95 px-3 py-1 backdrop-blur"
                style={{ height: ROW_H }}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: color }}
                />
                <span className="truncate text-[11px] font-medium text-ink-900">{phase.name}</span>
              </div>

              {/* Fase-balk */}
              <div
                className="absolute rounded-md text-[10px] font-semibold text-white shadow-sm select-none"
                style={{
                  left: x + 160,
                  width: w,
                  height: ROW_H - 12,
                  top: 6,
                  background: color,
                  opacity: STATUS_OPACITY(phase.status),
                  cursor: "ew-resize",
                  outline: isDragging ? "2px solid #ea580c" : "none",
                }}
                title={`${phase.name} · ${effDays} dagen · ${phase.status}`}
              >
                <div className="flex h-full items-center px-2 overflow-hidden">
                  <span className="truncate">{w > 50 ? phase.name : ""}</span>
                </div>

                {/* Resize handle rechts */}
                <div
                  className="absolute right-0 top-0 h-full w-3 cursor-ew-resize"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    const origDur = phase.durationDays ?? 14;
                    const startX = e.clientX;
                    setDragging({ phaseId: phase.id, startDragX: startX, origDur });
                    const onMove = (ev: MouseEvent) => {
                      const delta = Math.round((ev.clientX - startX) / DAY_PX);
                      setPreview({ phaseId: phase.id, dur: Math.max(1, origDur + delta) });
                    };
                    const onUp = async (ev: MouseEvent) => {
                      const delta = Math.round((ev.clientX - startX) / DAY_PX);
                      window.removeEventListener("mousemove", onMove);
                      window.removeEventListener("mouseup", onUp);
                      setPreview(null);
                      await onResizeEnd(phase.id, origDur + delta);
                    };
                    window.addEventListener("mousemove", onMove);
                    window.addEventListener("mouseup", onUp);
                  }}
                />
              </div>

              {/* Vandaag-lijn overlay */}
              {(() => {
                const todayX = diffDays(startBase, today) * DAY_PX;
                if (todayX < 0 || todayX > totalW) return null;
                return (
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 w-px bg-accent/40"
                    style={{ left: todayX + 160 }}
                  />
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[10px] text-ink-400">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-accent/70" /> Vandaag</span>
        <span>Sleep de rechterrand van een fase om de duur aan te passen</span>
      </div>
    </div>
  );
}
