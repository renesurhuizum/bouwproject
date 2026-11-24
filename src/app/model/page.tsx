"use client";

// Model (BIM) — controle, energie en uitwisseling over het hele gebouw.

import { useState } from "react";
import { useProjectModel } from "@/lib/hooks";
import { Controle } from "@/components/model/Controle";
import { Energie } from "@/components/model/Energie";
import { Uitwisseling } from "@/components/model/Uitwisseling";

type Tab = "controle" | "energie" | "uitwisseling";

const TABS: { key: Tab; label: string }[] = [
  { key: "controle", label: "Controle" },
  { key: "energie", label: "Energie" },
  { key: "uitwisseling", label: "IFC / BIM" },
];

export default function ModelPage() {
  const [tab, setTab] = useState<Tab>("controle");
  const model = useProjectModel();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-4 p-4 pb-8">
        <header className="px-1">
          <h1 className="text-xl font-bold text-ink-900">Model</h1>
          <p className="text-xs text-ink-500">Botsingscontrole, bouwfysica en BIM-uitwisseling voor het hele gebouw.</p>
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

        {model === undefined ? (
          <p className="px-1 text-sm text-ink-500">Model laden…</p>
        ) : model === null ? (
          <p className="px-1 text-sm text-ink-500">Nog geen project.</p>
        ) : (
          <>
            {tab === "controle" && <Controle model={model} />}
            {tab === "energie" && <Energie model={model} />}
            {tab === "uitwisseling" && <Uitwisseling model={model} />}
          </>
        )}
      </div>
    </div>
  );
}
