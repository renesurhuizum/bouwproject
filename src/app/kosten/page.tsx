"use client";

// Kosten-scherm met tabbladen: Uitgaven · Begroting · Materiaal.

import { useState } from "react";
import { Uitgaven } from "@/components/kosten/Uitgaven";
import { Begroting } from "@/components/kosten/Begroting";
import { Materiaal } from "@/components/kosten/Materiaal";
import { Hoeveelheden } from "@/components/kosten/Hoeveelheden";

type Tab = "uitgaven" | "begroting" | "hoeveelheden" | "materiaal";

const TABS: { key: Tab; label: string }[] = [
  { key: "uitgaven", label: "Uitgaven" },
  { key: "begroting", label: "Begroting" },
  { key: "hoeveelheden", label: "Hoeveelheden" },
  { key: "materiaal", label: "Materiaal" },
];

export default function KostenPage() {
  const [tab, setTab] = useState<Tab>("uitgaven");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-4 p-4 pb-8">
        <header className="px-1">
          <h1 className="text-xl font-bold text-ink-900">Kosten &amp; materiaal</h1>
        </header>

        <div className="flex gap-1 rounded-full bg-paper-sunken p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-full py-1.5 text-sm font-medium transition-colors ${
                tab === t.key ? "bg-ink-900 text-paper-raised" : "text-ink-500"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "uitgaven" && <Uitgaven />}
        {tab === "begroting" && <Begroting />}
        {tab === "hoeveelheden" && <Hoeveelheden />}
        {tab === "materiaal" && <Materiaal />}
      </div>
    </div>
  );
}
