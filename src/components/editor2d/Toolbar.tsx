"use client";

// Zwevende gereedschapsbalk onderin de editor. Mobiel-first, grote tikdoelen.

import { useState } from "react";
import { MousePointer2, Minus, Plug, Layers, Grid3x3, Plus } from "lucide-react";
import { useEditor } from "@/lib/store/editor";
import type {
  ElectricalType,
  EditorLayer,
  OpeningType,
  WallStatus,
} from "@/lib/domain/types";
import {
  ELECTRICAL_LABEL,
  OPENING_LABEL,
  WALL_STATUS_LABEL,
} from "@/lib/domain/constants";

const PLACE_TYPES: ElectricalType[] = [
  "socket",
  "socket-double",
  "switch",
  "light",
  "spot",
  "data",
  "panel",
  "outdoor",
];

const OPENING_TYPES: OpeningType[] = ["door", "window", "passage"];

const LAYERS: { key: EditorLayer; label: string }[] = [
  { key: "structure", label: "Muren" },
  { key: "rooms", label: "Ruimtes" },
  { key: "electrical", label: "Elektra" },
  { key: "plumbing", label: "Water" },
  { key: "hvac", label: "Verwarming" },
];

const STATUSES: WallStatus[] = ["new", "existing", "demolish"];

export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const placeKind = useEditor((s) => s.placeKind);
  const setPlaceKind = useEditor((s) => s.setPlaceKind);
  const wallDefaults = useEditor((s) => s.wallDefaults);
  const setWallDefaults = useEditor((s) => s.setWallDefaults);
  const visibleLayers = useEditor((s) => s.visibleLayers);
  const toggleLayer = useEditor((s) => s.toggleLayer);
  const showGrid = useEditor((s) => s.showGrid);
  const toggleGrid = useEditor((s) => s.toggleGrid);

  const [showLayers, setShowLayers] = useState(false);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 p-3">
      {/* Contextueel paneel: muur-opties */}
      {tool === "wall" && (
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-line bg-paper-raised/95 p-2 shadow-lg backdrop-blur">
          {STATUSES.map((st) => (
            <button
              key={st}
              onClick={() => setWallDefaults({ status: st })}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                wallDefaults.status === st
                  ? "bg-ink-900 text-paper-raised"
                  : "bg-paper-sunken text-ink-700"
              }`}
            >
              {WALL_STATUS_LABEL[st]}
            </button>
          ))}
          <button
            onClick={() => setWallDefaults({ loadBearing: !wallDefaults.loadBearing })}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
              wallDefaults.loadBearing
                ? "bg-danger text-white"
                : "bg-paper-sunken text-ink-700"
            }`}
          >
            Dragend
          </button>
          <Stepper
            label="dikte"
            value={wallDefaults.thickness}
            unit="cm"
            scale={100}
            step={0.01}
            min={0.05}
            onChange={(v) => setWallDefaults({ thickness: v })}
          />
          <Stepper
            label="hoogte"
            value={wallDefaults.height}
            unit="m"
            scale={1}
            step={0.1}
            min={1}
            onChange={(v) => setWallDefaults({ height: v })}
          />
        </div>
      )}

      {/* Contextueel paneel: plaatsen (elektra of deuren/ramen) */}
      {tool === "place" && (
        <div className="pointer-events-auto flex max-w-md flex-col gap-1.5 rounded-xl border border-line bg-paper-raised/95 p-2 shadow-lg backdrop-blur">
          <div className="flex gap-1.5">
            <button
              onClick={() => setPlaceKind({ domain: "electrical", type: "socket" })}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${
                placeKind?.domain === "electrical"
                  ? "bg-blueprint text-white"
                  : "bg-paper-sunken text-ink-700"
              }`}
            >
              Elektra
            </button>
            <button
              onClick={() => setPlaceKind({ domain: "opening", type: "door" })}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${
                placeKind?.domain === "opening"
                  ? "bg-accent text-white"
                  : "bg-paper-sunken text-ink-700"
              }`}
            >
              Deuren / ramen
            </button>
          </div>

          {placeKind?.domain === "opening" ? (
            <div className="grid grid-cols-3 gap-1.5">
              {OPENING_TYPES.map((t) => {
                const active = placeKind.type === t;
                return (
                  <button
                    key={t}
                    onClick={() => setPlaceKind({ domain: "opening", type: t })}
                    className={`rounded-lg px-2 py-1.5 text-[11px] font-medium ${
                      active ? "bg-accent text-white" : "bg-paper-sunken text-ink-700"
                    }`}
                  >
                    {OPENING_LABEL[t]}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {PLACE_TYPES.map((t) => {
                const active =
                  placeKind?.domain === "electrical" && placeKind.type === t;
                return (
                  <button
                    key={t}
                    onClick={() => setPlaceKind({ domain: "electrical", type: t })}
                    className={`rounded-lg px-2 py-1.5 text-[11px] font-medium leading-tight ${
                      active ? "bg-blueprint text-white" : "bg-paper-sunken text-ink-700"
                    }`}
                  >
                    {ELECTRICAL_LABEL[t]}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Lagen-paneel */}
      {showLayers && (
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-line bg-paper-raised/95 p-2 shadow-lg backdrop-blur">
          {LAYERS.map((l) => (
            <button
              key={l.key}
              onClick={() => toggleLayer(l.key)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                visibleLayers[l.key]
                  ? "bg-ink-900 text-paper-raised"
                  : "bg-paper-sunken text-ink-300"
              }`}
            >
              {l.label}
            </button>
          ))}
          <button
            onClick={toggleGrid}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
              showGrid ? "bg-ink-900 text-paper-raised" : "bg-paper-sunken text-ink-300"
            }`}
          >
            Raster
          </button>
        </div>
      )}

      {/* Hoofd-dock */}
      <div className="pointer-events-auto flex items-center gap-1 rounded-2xl border border-line bg-paper-raised/95 p-1.5 shadow-xl backdrop-blur">
        <ToolBtn active={tool === "select"} onClick={() => setTool("select")} label="Kies">
          <MousePointer2 size={20} />
        </ToolBtn>
        <ToolBtn active={tool === "wall"} onClick={() => setTool("wall")} label="Muur">
          <Minus size={20} strokeWidth={3} />
        </ToolBtn>
        <ToolBtn
          active={tool === "place"}
          onClick={() => {
            if (!placeKind) setPlaceKind({ domain: "electrical", type: "socket" });
            else setTool("place");
          }}
          label="Elektra"
        >
          <Plug size={20} />
        </ToolBtn>
        <div className="mx-0.5 h-7 w-px bg-line" />
        <ToolBtn active={showLayers} onClick={() => setShowLayers((v) => !v)} label="Lagen">
          <Layers size={20} />
        </ToolBtn>
        <ToolBtn active={showGrid} onClick={toggleGrid} label="Raster">
          <Grid3x3 size={20} />
        </ToolBtn>
      </div>
    </div>
  );
}

function ToolBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-11 w-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-medium transition-colors ${
        active ? "bg-accent text-white" : "text-ink-700 hover:bg-paper-sunken"
      }`}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

function Stepper({
  label,
  value,
  unit,
  scale,
  step,
  min,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  scale: number;
  step: number;
  min: number;
  onChange: (v: number) => void;
}) {
  const display = Math.round(value * scale);
  return (
    <div className="flex items-center gap-1 rounded-lg bg-paper-sunken px-1.5 py-1">
      <button
        onClick={() => onChange(Math.max(min, +(value - step).toFixed(3)))}
        className="flex h-6 w-6 items-center justify-center rounded text-ink-700"
        aria-label={`${label} minder`}
      >
        <Minus size={14} />
      </button>
      <span className="tabular min-w-[3.5rem] text-center text-[11px] text-ink-700">
        {label} {display}
        {unit}
      </span>
      <button
        onClick={() => onChange(+(value + step).toFixed(3))}
        className="flex h-6 w-6 items-center justify-center rounded text-ink-700"
        aria-label={`${label} meer`}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
