"use client";

// Kleine legenda die verschijnt als de elektra-laag zichtbaar is.
// Toont elk symbool + Nederlandse naam, als HTML-overlay (geen Konva).
// Wegklikbaar: op een klein scherm concurreert hij met de gereedschapsbalk.

import { X } from "lucide-react";
import { useEditor } from "@/lib/store/editor";

const ITEMS: { symbol: string; label: string }[] = [
  { symbol: "S",  label: "Stopcontact" },
  { symbol: "S²", label: "Dubbel stopcontact" },
  { symbol: "W",  label: "Schakelaar" },
  { symbol: "L",  label: "Lichtpunt (plafond)" },
  { symbol: "·",  label: "Inbouwspot" },
  { symbol: "WL", label: "Wandlamp" },
  { symbol: "D",  label: "Data / UTP" },
  { symbol: "▣",  label: "Meterkast" },
  { symbol: "B",  label: "Buitenpunt" },
];

export function ElectricalLegend() {
  const showLegend = useEditor((s) => s.showLegend);
  const toggleLegend = useEditor((s) => s.toggleLegend);

  if (!showLegend) {
    return (
      <button
        onClick={toggleLegend}
        className="absolute bottom-4 left-3 z-10 rounded-xl border border-line bg-paper-raised/95 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500 shadow-lg backdrop-blur hover:text-ink-900"
      >
        Legenda
      </button>
    );
  }

  return (
    <div className="absolute bottom-4 left-3 z-10 w-44 overflow-hidden rounded-xl border border-line bg-paper-raised/95 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between border-b border-line py-1.5 pl-3 pr-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
          Elektra legenda
        </span>
        <button
          onClick={toggleLegend}
          aria-label="Legenda verbergen"
          className="flex h-5 w-5 items-center justify-center rounded text-ink-400 hover:bg-paper-sunken hover:text-ink-900"
        >
          <X size={12} />
        </button>
      </div>
      <ul className="divide-y divide-line">
        {ITEMS.map(({ symbol, label }) => (
          <li key={symbol} className="flex items-center gap-2.5 px-3 py-1">
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-amber-100 font-mono text-[11px] font-bold text-amber-700">
              {symbol}
            </span>
            <span className="text-[11px] text-ink-600">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
