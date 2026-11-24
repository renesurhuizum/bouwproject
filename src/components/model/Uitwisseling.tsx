"use client";

// Uitwisseling: het model als IFC (open BIM-standaard) exporteren, zodat
// architect, constructeur, installateur en gemeente het in hun eigen software
// kunnen openen. Werkt volledig offline — er wordt niets geüpload.

import { useState } from "react";
import { FileDown, Check } from "lucide-react";
import type { ProjectModel } from "@/lib/model";
import { exportIfc } from "@/lib/ifc/exportIfc";

export function Uitwisseling({ model }: { model: ProjectModel }) {
  const [furniture, setFurniture] = useState(true);
  const [mep, setMep] = useState(true);
  const [demolished, setDemolished] = useState(true);
  const [done, setDone] = useState<string | null>(null);

  const counts = model.levels.reduce(
    (c, lm) => ({
      walls: c.walls + lm.walls.length,
      openings: c.openings + lm.openings.length,
      rooms: c.rooms + lm.rooms.length,
      structure: c.structure + lm.beams.length + lm.columns.length + lm.stairs.length + lm.roofs.length,
      mep: c.mep + lm.electrical.length + lm.plumbing.length + lm.hvac.length,
      furniture: c.furniture + lm.furniture.length,
    }),
    { walls: 0, openings: 0, rooms: 0, structure: 0, mep: 0, furniture: 0 },
  );

  function download() {
    const text = exportIfc(model, { includeFurniture: furniture, includeMep: mep, includeDemolished: demolished });
    const blob = new Blob([text], { type: "application/x-step" });
    const safe = model.project.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "bouwproject";
    const name = `${safe}-${new Date().toISOString().slice(0, 10)}.ifc`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    setDone(`${name} · ${(blob.size / 1024).toFixed(0)} kB`);
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-card border border-line bg-paper-raised p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">IFC-export (open BIM)</h2>
        <p className="text-sm text-ink-700">
          Exporteer het complete model als <strong>IFC4</strong>-bestand. Dat is de open standaard waarmee
          architecten, constructeurs, installateurs en aannemers modellen uitwisselen — het opent in o.a.
          Revit, ArchiCAD, Bonsai (Blender), Solibri en gratis viewers zoals BIMcollab Zoom en usBIM.viewer.
        </p>

        <ul className="grid grid-cols-3 gap-2 text-center">
          <Count n={counts.walls} label="muren" />
          <Count n={counts.openings} label="kozijnen" />
          <Count n={counts.rooms} label="ruimtes" />
          <Count n={counts.structure} label="constructie" />
          <Count n={counts.mep} label="installaties" />
          <Count n={counts.furniture} label="meubels" />
        </ul>

        <div className="space-y-1.5">
          <Toggle checked={mep} onChange={setMep} label="Installaties meenemen (elektra, water, afvoer, cv, ventilatie)" />
          <Toggle checked={furniture} onChange={setFurniture} label="Meubilair meenemen" />
          <Toggle checked={demolished} onChange={setDemolished} label="Te slopen muren meenemen (status DEMOLISH)" />
        </div>

        <button
          onClick={download}
          disabled={counts.walls === 0}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          <FileDown size={16} /> Download .ifc
        </button>
        {done && (
          <p className="flex items-center gap-1.5 text-xs text-ok">
            <Check size={14} /> {done}
          </p>
        )}
      </section>

      <section className="space-y-2 rounded-card border border-line bg-paper-raised p-4 text-xs text-ink-700">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Wat zit erin?</h2>
        <ul className="list-disc space-y-1 pl-4">
          <li>Bouwlagen met peil, muren met echte sparingen, deuren en ramen met maten.</li>
          <li>
            Per muur: <em>dragend</em>, <em>gevel</em>, U-waarde en renovatiestatus{" "}
            <code className="rounded bg-paper-sunken px-1">EXISTING / NEW / DEMOLISH</code> — viewers kunnen
            daarop filteren (bijv. alleen sloopwerk tonen).
          </li>
          <li>Ruimtes met bruto en netto vloeroppervlak (NEN 2580) en inhoud.</li>
          <li>Stalen liggers als echt I-profiel, kolommen, trappen en daken.</li>
          <li>Elektra met montagehoogte en groep, sanitair, leidingen met diameter, kanalen en radiatoren.</li>
          <li>Hoeveelheden (m¹, m², m³) en de fase uit je planning, voor calculatie door de aannemer.</li>
          <li>Elk element houdt bij elke export dezelfde ID — de ontvanger kan versies dus vergelijken.</li>
        </ul>
      </section>
    </div>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <li className="rounded-lg bg-paper-sunken px-2 py-1.5">
      <div className="tabular text-base font-bold text-ink-900">{n}</div>
      <div className="text-[10px] text-ink-500">{label}</div>
    </li>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-xs text-ink-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-accent" />
      {label}
    </label>
  );
}
