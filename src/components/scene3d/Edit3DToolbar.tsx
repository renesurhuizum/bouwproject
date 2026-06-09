"use client";

import { useState } from "react";
import { Sofa, Zap, X, ChevronDown } from "lucide-react";
import { use3DEdit } from "./use3DEdit";
import { FURNITURE_CATEGORIES, FURNITURE_DEFAULTS } from "@/lib/domain/furniture";
import type { ElectricalType } from "@/lib/domain/types";

const ELECTRICAL_OPTIONS: { type: ElectricalType; label: string }[] = [
  { type: "socket",        label: "Stopcontact" },
  { type: "socket-double", label: "Dubbel stop." },
  { type: "switch",        label: "Schakelaar" },
  { type: "light",         label: "Lichtpunt" },
  { type: "spot",          label: "Inbouwspot" },
  { type: "data",          label: "Data/UTP" },
];

export function Edit3DToolbar() {
  const { mode, furnitureKind, electricalType, setFurnitureKind, setElectricalType, reset } =
    use3DEdit();
  const [openPanel, setOpenPanel] = useState<"furniture" | "electrical" | null>(null);

  const active = mode !== "none";

  return (
    <div className="pointer-events-none absolute bottom-10 left-1/2 z-10 -translate-x-1/2">
      {active && (
        <div className="pointer-events-auto mb-2 flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-white shadow-lg">
          <span>
            {mode === "place-furniture" && furnitureKind
              ? `Plaatsen: ${FURNITURE_DEFAULTS[furnitureKind].label}`
              : mode === "place-electrical" && electricalType
              ? `Plaatsen: ${ELECTRICAL_OPTIONS.find((o) => o.type === electricalType)?.label ?? electricalType}`
              : "Klik op de vloer"}
          </span>
          <span className="opacity-60">· Shift = meerdere</span>
          <button
            onClick={reset}
            className="ml-1 rounded-full p-0.5 hover:bg-white/20"
            title="Annuleren"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/20 bg-ink-900/85 px-4 py-2.5 shadow-2xl backdrop-blur">
        {/* Meubels */}
        <div className="relative">
          <button
            onClick={() => setOpenPanel(openPanel === "furniture" ? null : "furniture")}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "place-furniture"
                ? "bg-accent text-white"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Sofa size={14} />
            Meubels
            <ChevronDown
              size={10}
              className={`transition-transform ${openPanel === "furniture" ? "rotate-180" : ""}`}
            />
          </button>

          {openPanel === "furniture" && (
            <div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-white/10 bg-ink-900/95 p-3 shadow-2xl backdrop-blur">
              {FURNITURE_CATEGORIES.map((cat) => (
                <div key={cat.label} className="mb-2">
                  <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-white/40">
                    {cat.label}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {cat.kinds.map((kind) => (
                      <button
                        key={kind}
                        onClick={() => {
                          setFurnitureKind(kind);
                          setOpenPanel(null);
                        }}
                        className={`rounded px-2 py-1 text-[10px] transition-colors ${
                          furnitureKind === kind && mode === "place-furniture"
                            ? "bg-accent text-white"
                            : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
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
        </div>

        <div className="h-5 w-px bg-white/15" />

        {/* Elektra */}
        <div className="relative">
          <button
            onClick={() => setOpenPanel(openPanel === "electrical" ? null : "electrical")}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === "place-electrical"
                ? "bg-yellow-400 text-ink-900"
                : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Zap size={14} />
            Elektra
            <ChevronDown
              size={10}
              className={`transition-transform ${openPanel === "electrical" ? "rotate-180" : ""}`}
            />
          </button>

          {openPanel === "electrical" && (
            <div className="absolute bottom-full left-0 mb-2 w-44 rounded-xl border border-white/10 bg-ink-900/95 p-2 shadow-2xl backdrop-blur">
              {ELECTRICAL_OPTIONS.map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => {
                    setElectricalType(type);
                    setOpenPanel(null);
                  }}
                  className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px] transition-colors ${
                    electricalType === type && mode === "place-electrical"
                      ? "bg-yellow-400 text-ink-900"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
