"use client";

// Kleine legenda die verschijnt als er elektra op de verdieping ligt.
// Ingeklapt tot een balkje, zodat hij het canvas niet bedekt tot je hem nodig
// hebt. Toont elk symbool + Nederlandse naam, als HTML-overlay (geen Konva).

import { useState } from "react";
import { ChevronDown } from "lucide-react";

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
  const [open, setOpen] = useState(false);

  return (
    <div className="no-print absolute bottom-[6.5rem] left-3 z-10 w-44 lg:bottom-4 overflow-hidden rounded-panel border border-line bg-paper-raised/95 shadow-panel backdrop-blur">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-paper-sunken"
      >
        <span className="label-micro">Elektra legenda</span>
        <ChevronDown
          size={13}
          aria-hidden
          className={`shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
      <ul className="divide-y divide-line border-t border-line">
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
