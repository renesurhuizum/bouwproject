"use client";

// Zwevende gereedschapsbalk onderin de editor. Mobiel-first, grote tikdoelen.
// Leidingen zitten in het Water-tabblad, niet als apart dockknopp.

import { useState } from "react";
import {
  MousePointer2,
  Minus,
  Pentagon,
  Plug,
  Layers,
  Grid3x3,
  Plus,
  LayoutDashboard,
  Sofa,
  Undo2,
  Redo2,
} from "lucide-react";
import { useEditor } from "@/lib/store/editor";
import { useHistory } from "@/lib/history";
import type {
  ElectricalType,
  EditorLayer,
  FixtureKind,
  FurnitureKind,
  HvacType,
  OpeningType,
  WallStatus,
} from "@/lib/domain/types";
import {
  ELECTRICAL_LABEL,
  OPENING_LABEL,
  FIXTURE_LABEL,
  HVAC_LABEL,
  WALL_STATUS_LABEL,
} from "@/lib/domain/constants";
import { FURNITURE_CATEGORIES, FURNITURE_DEFAULTS } from "@/lib/domain/furniture";

const PLACE_TYPES: ElectricalType[] = [
  "socket",
  "socket-double",
  "switch",
  "light",
  "spot",
  "data",
  "panel",
  "perilex",
  "outdoor",
];

const OPENING_TYPES: OpeningType[] = ["door", "window", "passage"];

const FIXTURE_TYPES: FixtureKind[] = [
  "toilet",
  "sink",
  "shower",
  "bath",
  "kitchen-tap",
  "washing-machine",
  "boiler",
  "outdoor-tap",
];

const HVAC_TYPES: HvacType[] = ["radiator", "floor-heating", "ventilation", "wtw"];

const PIPE_OPTIONS = [
  { key: "supply-cold" as const, label: "Koud water", color: "#3b82f6" },
  { key: "supply-hot" as const, label: "Warm water", color: "#ef4444" },
  { key: "drain" as const, label: "Afvoer", color: "#8b5cf6" },
  { key: "cv-pipe" as const, label: "CV-leiding", color: "#f97316" },
];

const LAYERS: { key: EditorLayer; label: string }[] = [
  { key: "structure", label: "Muren" },
  { key: "rooms", label: "Ruimtes" },
  { key: "electrical", label: "Elektra" },
  { key: "plumbing", label: "Water" },
  { key: "hvac", label: "Verwarming" },
  { key: "furniture", label: "Meubels" },
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
  const gridSnap = useEditor((s) => s.gridSnap);
  const cycleGridSnap = useEditor((s) => s.cycleGridSnap);
  const furniturePaletteKind = useEditor((s) => s.furniturePaletteKind);
  const setFurniturePaletteKind = useEditor((s) => s.setFurniturePaletteKind);
  const pipeType = useEditor((s) => s.pipeType);
  const setPipeType = useEditor((s) => s.setPipeType);

  const undo = useHistory((s) => s.undo);
  const redo = useHistory((s) => s.redo);

  const SNAP_LABEL = { fine: "10cm", normal: "50cm", coarse: "1m" };
  const [showLayers, setShowLayers] = useState(false);

  // Bepaal welk tabblad actief is in het "Installatie"-paneel.
  // draw-pipe hoort bij het Water-tabblad.
  const isPlaceOrPipe = tool === "place" || tool === "draw-pipe";
  const activeTab: "electrical" | "plumbing" | "opening" | "hvac" =
    tool === "draw-pipe"
      ? "plumbing"
      : placeKind?.domain === "opening"
        ? "opening"
        : placeKind?.domain === "hvac"
          ? "hvac"
          : placeKind?.domain === "plumbing"
            ? "plumbing"
            : "electrical";

  function switchTab(tab: "electrical" | "plumbing" | "opening" | "hvac") {
    if (tab === "electrical") {
      setPlaceKind({ domain: "electrical", type: "socket" });
    } else if (tab === "plumbing") {
      setPlaceKind({ domain: "plumbing", fixture: "sink" });
    } else if (tab === "opening") {
      setPlaceKind({ domain: "opening", type: "door" });
    } else if (tab === "hvac") {
      setPlaceKind({ domain: "hvac", type: "radiator" });
    }
  }

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
              wallDefaults.loadBearing ? "bg-danger text-white" : "bg-paper-sunken text-ink-700"
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

      {/* Installatie-paneel — Elektra / Water / Verwarming / Deuren */}
      {isPlaceOrPipe && (
        <div className="pointer-events-auto w-full max-w-sm rounded-xl border border-line bg-paper-raised/97 shadow-lg backdrop-blur">
          {/* Tabbladen */}
          <div className="flex border-b border-line">
            {(
              [
                { tab: "electrical" as const, label: "Elektra", color: "text-blueprint" },
                { tab: "plumbing" as const, label: "Water & leiding", color: "text-[#0891b2]" },
                { tab: "hvac" as const, label: "Verwarming", color: "text-[#f97316]" },
                { tab: "opening" as const, label: "Deuren", color: "text-accent" },
              ] as const
            ).map(({ tab, label, color }) => (
              <button
                key={tab}
                onClick={() => switchTab(tab)}
                className={`flex-1 py-2 text-[10px] font-semibold transition-colors ${
                  activeTab === tab
                    ? `border-b-2 border-current ${color} bg-paper-sunken`
                    : "text-ink-400 hover:text-ink-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tabinhoud */}
          <div className="p-2">
            {/* Elektra */}
            {activeTab === "electrical" && (
              <div className="grid grid-cols-4 gap-1">
                {PLACE_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setPlaceKind({ domain: "electrical", type: t })}
                    className={`rounded-lg px-1.5 py-1.5 text-[10px] font-medium leading-tight ${
                      placeKind?.domain === "electrical" && placeKind.type === t
                        ? "bg-blueprint text-white"
                        : "bg-paper-sunken text-ink-700"
                    }`}
                  >
                    {ELECTRICAL_LABEL[t]}
                  </button>
                ))}
              </div>
            )}

            {/* Water: sanitair + leidingen */}
            {activeTab === "plumbing" && (
              <div className="space-y-2">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-400">
                  Sanitair
                </p>
                <div className="grid grid-cols-4 gap-1">
                  {FIXTURE_TYPES.map((f) => (
                    <button
                      key={f}
                      onClick={() => setPlaceKind({ domain: "plumbing", fixture: f })}
                      className={`rounded-lg px-1.5 py-1.5 text-[10px] font-medium leading-tight ${
                        tool === "place" && placeKind?.domain === "plumbing" && placeKind.fixture === f
                          ? "bg-[#0891b2] text-white"
                          : "bg-paper-sunken text-ink-700"
                      }`}
                    >
                      {FIXTURE_LABEL[f]}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] font-semibold uppercase tracking-wide text-ink-400">
                  Leidingen tekenen
                  <span className="ml-1 font-normal normal-case text-ink-300">
                    · Enter = opslaan · Esc = annuleren
                  </span>
                </p>
                <div className="flex flex-wrap gap-1">
                  {PIPE_OPTIONS.map(({ key, label, color }) => (
                    <button
                      key={key}
                      onClick={() => {
                        setPipeType(key);
                        setTool("draw-pipe");
                      }}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-medium transition-colors ${
                        tool === "draw-pipe" && pipeType === key
                          ? "bg-ink-900 text-white"
                          : "bg-paper-sunken text-ink-600 hover:bg-paper-raised"
                      }`}
                    >
                      <span
                        className="h-2 w-2 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Verwarming */}
            {activeTab === "hvac" && (
              <div className="grid grid-cols-4 gap-1">
                {HVAC_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setPlaceKind({ domain: "hvac", type: t })}
                    className={`rounded-lg px-1.5 py-1.5 text-[10px] font-medium leading-tight ${
                      placeKind?.domain === "hvac" && placeKind.type === t
                        ? "bg-[#f97316] text-white"
                        : "bg-paper-sunken text-ink-700"
                    }`}
                  >
                    {HVAC_LABEL[t]}
                  </button>
                ))}
              </div>
            )}

            {/* Deuren & ramen */}
            {activeTab === "opening" && (
              <div className="flex gap-1.5">
                {OPENING_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setPlaceKind({ domain: "opening", type: t })}
                    className={`flex-1 rounded-lg py-2 text-xs font-medium ${
                      placeKind?.domain === "opening" && placeKind.type === t
                        ? "bg-accent text-white"
                        : "bg-paper-sunken text-ink-700"
                    }`}
                  >
                    {OPENING_LABEL[t]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Meubels-palet */}
      {tool === "place-furniture" && (
        <div className="pointer-events-auto w-full max-w-sm rounded-xl border border-line bg-paper-raised/97 p-2 shadow-lg backdrop-blur">
          {FURNITURE_CATEGORIES.map((cat) => (
            <div key={cat.label} className="mb-1.5">
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-ink-400">
                {cat.label}
              </p>
              <div className="flex flex-wrap gap-1">
                {cat.kinds.map((kind: FurnitureKind) => (
                  <button
                    key={kind}
                    onClick={() => setFurniturePaletteKind(kind)}
                    className={`rounded px-2 py-1 text-[10px] transition-colors ${
                      furniturePaletteKind === kind
                        ? "bg-accent text-white"
                        : "bg-paper-sunken text-ink-600 hover:bg-paper-raised"
                    }`}
                  >
                    {FURNITURE_DEFAULTS[kind].label}
                  </button>
                ))}
              </div>
            </div>
          ))}
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
        <button
          onClick={() => void undo()}
          aria-label="Ongedaan maken"
          className="flex h-11 w-10 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-medium text-ink-500 hover:bg-paper-sunken hover:text-ink-900"
        >
          <Undo2 size={17} />
          <span>Undo</span>
        </button>
        <button
          onClick={() => void redo()}
          aria-label="Opnieuw"
          className="flex h-11 w-10 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-medium text-ink-500 hover:bg-paper-sunken hover:text-ink-900"
        >
          <Redo2 size={17} />
          <span>Redo</span>
        </button>
        <div className="mx-0.5 h-7 w-px bg-line" />
        <ToolBtn active={tool === "select"} onClick={() => setTool("select")} label="Kies">
          <MousePointer2 size={20} />
        </ToolBtn>
        <ToolBtn active={tool === "wall"} onClick={() => setTool("wall")} label="Muur">
          <Minus size={20} strokeWidth={3} />
        </ToolBtn>
        <ToolBtn active={tool === "room"} onClick={() => setTool("room")} label="Ruimte">
          <Pentagon size={20} />
        </ToolBtn>
        <ToolBtn
          active={isPlaceOrPipe}
          onClick={() => {
            if (isPlaceOrPipe) {
              setTool("select");
            } else {
              setPlaceKind({ domain: "electrical", type: "socket" });
            }
          }}
          label="Installatie"
        >
          <Plug size={20} />
        </ToolBtn>
        <ToolBtn active={tool === "divide"} onClick={() => setTool("divide")} label="Verdeel">
          <LayoutDashboard size={20} />
        </ToolBtn>
        <ToolBtn
          active={tool === "place-furniture"}
          onClick={() => {
            if (tool === "place-furniture") {
              setTool("select");
            } else {
              setFurniturePaletteKind(furniturePaletteKind ?? "sofa-2");
            }
          }}
          label="Meubels"
        >
          <Sofa size={20} />
        </ToolBtn>
        <div className="mx-0.5 h-7 w-px bg-line" />
        <ToolBtn active={showLayers} onClick={() => setShowLayers((v) => !v)} label="Lagen">
          <Layers size={20} />
        </ToolBtn>
        <ToolBtn active={showGrid} onClick={toggleGrid} label="Raster">
          <Grid3x3 size={20} />
        </ToolBtn>
        <button
          onClick={cycleGridSnap}
          className="flex h-11 w-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[9px] font-medium text-ink-700 hover:bg-paper-sunken"
          aria-label="Wijzig snap-maat"
        >
          <span className="text-[10px] font-bold text-ink-900">{SNAP_LABEL[gridSnap]}</span>
          <span>Snap</span>
        </button>
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
