"use client";

// Kleine legenda die verschijnt als de elektra-laag zichtbaar is.
// Toont elk symbool + Nederlandse naam, als HTML-overlay (geen Konva).
// Inklapbaar; op mobiel standaard dicht zodat hij de canvas niet blokkeert.

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

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
  // Standaard dicht op smalle schermen (matchMedia is alleen client-side;
  // deze component rendert uitsluitend client-side).
  const [open, setOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches,
  );

  return (
    <div className="absolute bottom-4 left-3 z-10 w-44 overflow-hidden rounded-xl border border-line bg-paper-raised/95 shadow-lg backdrop-blur">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b border-line px-3 py-1.5"
        aria-expanded={open}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
          Elektra legenda
        </span>
        {open ? (
          <ChevronDown size={12} className="text-ink-400" />
        ) : (
          <ChevronUp size={12} className="text-ink-400" />
        )}
      </button>
      {open && (
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
      )}
    </div>
  );
}
