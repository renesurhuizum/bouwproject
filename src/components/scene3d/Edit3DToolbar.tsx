"use client";

import { useState } from "react";
import { Sofa, Zap, Droplets, Flame, X, ChevronDown } from "lucide-react";
import { use3DEdit } from "./use3DEdit";
import { FURNITURE_CATEGORIES, FURNITURE_DEFAULTS } from "@/lib/domain/furniture";
import type { ElectricalType, FixtureKind, HvacType } from "@/lib/domain/types";
import { FIXTURE_LABEL, HVAC_LABEL } from "@/lib/domain/constants";

const ELECTRICAL_OPTIONS: { type: ElectricalType; label: string }[] = [
  { type: "socket",        label: "Stopcontact" },
  { type: "socket-double", label: "Dubbel stop." },
  { type: "switch",        label: "Schakelaar" },
  { type: "light",         label: "Lichtpunt" },
  { type: "spot",          label: "Inbouwspot" },
  { type: "data",          label: "Data/UTP" },
];

const FIXTURE_OPTIONS: FixtureKind[] = [
  "toilet", "sink", "shower", "bath", "kitchen-tap", "washing-machine", "boiler",
];

const HVAC_OPTIONS: HvacType[] = ["radiator", "floor-heating", "ventilation", "wtw"];

type Panel = "furniture" | "electrical" | "plumbing" | "hvac" | null;

export function Edit3DToolbar() {
  const {
    mode, furnitureKind, electricalType, plumbingFixture, hvacType,
    setFurnitureKind, setElectricalType, setPlumbingFixture, setHvacType, reset,
  } = use3DEdit();
  const [openPanel, setOpenPanel] = useState<Panel>(null);

  const active = mode !== "none";

  function toggle(p: Exclude<Panel, null>) {
    setOpenPanel(openPanel === p ? null : p);
  }

  function modeLabel() {
    if (mode === "place-furniture" && furnitureKind) return `Plaatsen: ${FURNITURE_DEFAULTS[furnitureKind].label}`;
    if (mode === "place-electrical" && electricalType) return `Plaatsen: ${ELECTRICAL_OPTIONS.find(o => o.type === electricalType)?.label ?? electricalType}`;
    if (mode === "place-plumbing" && plumbingFixture) return `Plaatsen: ${FIXTURE_LABEL[plumbingFixture]}`;
    if (mode === "place-hvac" && hvacType) return `Plaatsen: ${HVAC_LABEL[hvacType]}`;
    return "Klik op de vloer";
  }

  return (
    <div className="pointer-events-none absolute bottom-10 left-1/2 z-10 -translate-x-1/2">
      {active && (
        <div className="pointer-events-auto mb-2 flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-white shadow-lg">
          <span>{modeLabel()}</span>
          <span className="opacity-60">· Shift = meerdere</span>
          <button onClick={reset} className="ml-1 rounded-full p-0.5 hover:bg-white/20" title="Annuleren">
            <X size={12} />
          </button>
        </div>
      )}

      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/20 bg-ink-900/85 px-4 py-2.5 shadow-2xl backdrop-blur">

        {/* Meubels */}
        <DropdownSection
          icon={<Sofa size={14} />}
          label="Meubels"
          open={openPanel === "furniture"}
          active={mode === "place-furniture"}
          activeClass="bg-accent text-white"
          onToggle={() => toggle("furniture")}
        >
          {FURNITURE_CATEGORIES.map((cat) => (
            <div key={cat.label} className="mb-2">
              <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-white/40">{cat.label}</p>
              <div className="flex flex-wrap gap-1">
                {cat.kinds.map((kind) => (
                  <button
                    key={kind}
                    onClick={() => { setFurnitureKind(kind); setOpenPanel(null); }}
                    className={`rounded px-2 py-1 text-[10px] ${furnitureKind === kind && mode === "place-furniture" ? "bg-accent text-white" : "bg-white/10 text-white/70 hover:bg-white/20"}`}
                  >
                    {FURNITURE_DEFAULTS[kind].label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </DropdownSection>

        <Divider />

        {/* Elektra */}
        <DropdownSection
          icon={<Zap size={14} />}
          label="Elektra"
          open={openPanel === "electrical"}
          active={mode === "place-electrical"}
          activeClass="bg-yellow-400 text-ink-900"
          onToggle={() => toggle("electrical")}
          width="w-40"
        >
          {ELECTRICAL_OPTIONS.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => { setElectricalType(type); setOpenPanel(null); }}
              className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px] ${electricalType === type && mode === "place-electrical" ? "bg-yellow-400 text-ink-900" : "text-white/70 hover:bg-white/10"}`}
            >
              {label}
            </button>
          ))}
        </DropdownSection>

        <Divider />

        {/* Water */}
        <DropdownSection
          icon={<Droplets size={14} />}
          label="Water"
          open={openPanel === "plumbing"}
          active={mode === "place-plumbing"}
          activeClass="bg-[#0891b2] text-white"
          onToggle={() => toggle("plumbing")}
          width="w-40"
        >
          {FIXTURE_OPTIONS.map((f) => (
            <button
              key={f}
              onClick={() => { setPlumbingFixture(f); setOpenPanel(null); }}
              className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px] ${plumbingFixture === f && mode === "place-plumbing" ? "bg-[#0891b2] text-white" : "text-white/70 hover:bg-white/10"}`}
            >
              {FIXTURE_LABEL[f]}
            </button>
          ))}
        </DropdownSection>

        <Divider />

        {/* Verwarming */}
        <DropdownSection
          icon={<Flame size={14} />}
          label="Verwarming"
          open={openPanel === "hvac"}
          active={mode === "place-hvac"}
          activeClass="bg-[#f97316] text-white"
          onToggle={() => toggle("hvac")}
          width="w-40"
        >
          {HVAC_OPTIONS.map((t) => (
            <button
              key={t}
              onClick={() => { setHvacType(t); setOpenPanel(null); }}
              className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px] ${hvacType === t && mode === "place-hvac" ? "bg-[#f97316] text-white" : "text-white/70 hover:bg-white/10"}`}
            >
              {HVAC_LABEL[t]}
            </button>
          ))}
        </DropdownSection>

      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-5 w-px bg-white/15" />;
}

function DropdownSection({
  icon, label, open, active, activeClass, onToggle, children, width = "w-56",
}: {
  icon: React.ReactNode;
  label: string;
  open: boolean;
  active: boolean;
  activeClass: string;
  onToggle: () => void;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
          active ? activeClass : "text-white/70 hover:bg-white/10 hover:text-white"
        }`}
      >
        {icon}
        {label}
        <ChevronDown size={10} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className={`absolute bottom-full left-0 mb-2 ${width} rounded-xl border border-white/10 bg-ink-900/95 p-3 shadow-2xl backdrop-blur`}>
          {children}
        </div>
      )}
    </div>
  );
}
