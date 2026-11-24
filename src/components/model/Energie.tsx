"use client";

// Bouwfysica: indicatief warmteverlies per ruimte, verdeling over de schil,
// warmtepomp-geschiktheid en isolatieadvies (incl. ISDE-subsidiegrenzen).
// Met "wat als"-scenario's om maatregelen te vergelijken zonder iets op te slaan.

import { useDeferredValue, useMemo, useState } from "react";
import { Flame, Thermometer, MapPin, TriangleAlert, Info } from "lucide-react";
import type { ProjectModel } from "@/lib/model";
import {
  applyScenario,
  computeHeatLoss,
  floorRc,
  radiatorFactor,
  SCENARIOS,
  DEFAULT_AIR_CHANGES,
  DEFAULT_EXISTING_FLOOR_RC,
  DESIGN_TEMP_OUTSIDE,
  DESIGN_TEMP_INSIDE,
  type ScenarioKey,
} from "@/lib/thermal";
import { update } from "@/lib/db/repo";
import { useShowOnPlan } from "./useShowOnPlan";

const fmtW = (w: number) => (w >= 1000 ? `${(w / 1000).toFixed(1).replace(".", ",")} kW` : `${Math.round(w)} W`);

const ENVELOPE: { key: keyof ReturnType<typeof computeHeatLoss>["envelope"]; label: string; color: string }[] = [
  { key: "walls", label: "Gevels", color: "#b08968" },
  { key: "windows", label: "Ramen & deuren", color: "#38bdf8" },
  { key: "roof", label: "Dak", color: "#9b4a3a" },
  { key: "floor", label: "Vloer", color: "#78716c" },
  { key: "ventilation", label: "Ventilatie/kieren", color: "#a3e635" },
];

export function Energie({ model }: { model: ProjectModel }) {
  const deferred = useDeferredValue(model);
  const [scenario, setScenario] = useState<ScenarioKey>("huidig");
  const [airChanges, setAirChanges] = useState(DEFAULT_AIR_CHANGES);
  const [supply, setSupply] = useState<45 | 55 | 70>(55);
  const showOnPlan = useShowOnPlan(model);

  const base = useMemo(() => computeHeatLoss(deferred, airChanges), [deferred, airChanges]);
  const result = useMemo(() => {
    if (scenario === "huidig") return base;
    const s = applyScenario(deferred, scenario);
    return computeHeatLoss(s.model, s.airChanges);
  }, [deferred, scenario, base]);

  const lowest = model.levels[0]?.level;

  if (result.rooms.length === 0) {
    return (
      <div className="rounded-card border border-line bg-paper-raised p-5 text-sm text-ink-700">
        Teken eerst <strong>ruimtes</strong> en <strong>gevelmuren</strong> op de plattegrond. Daarna
        berekent dit scherm per ruimte hoeveel warmte er weglekt en wat isoleren oplevert.
      </div>
    );
  }

  const saving = base.total > 0 ? 1 - result.total / base.total : 0;
  const tone = result.heatPumpVerdict.tone;
  const toneCls = tone === "good" ? "border-ok/40 bg-ok/10 text-ok" : tone === "ok" ? "border-warn/40 bg-warn/10 text-warn" : "border-danger/40 bg-danger/10 text-danger";
  const envTotal = ENVELOPE.reduce((s, e) => s + result.envelope[e.key], 0) || 1;
  const factor = radiatorFactor(supply);

  return (
    <div className="space-y-4">
      {/* Scenario */}
      <div className="flex gap-1 rounded-full bg-paper-sunken p-1">
        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            onClick={() => setScenario(s.key)}
            className={`flex-1 rounded-full py-1.5 text-xs font-medium ${scenario === s.key ? "bg-ink-900 text-paper-raised" : "text-ink-500"}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="-mt-2 px-1 text-[11px] text-ink-500">{SCENARIOS.find((s) => s.key === scenario)?.description}</p>

      {/* Kerncijfers */}
      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-card border border-line bg-paper-raised p-3">
          <div className="flex items-center gap-1.5 text-xs text-ink-500">
            <Flame size={14} /> Ontwerpvermogen
          </div>
          <div className="tabular text-2xl font-bold text-ink-900">{fmtW(result.total)}</div>
          <div className="text-[11px] text-ink-500">
            bij {DESIGN_TEMP_OUTSIDE} °C buiten / {DESIGN_TEMP_INSIDE} °C binnen
            {scenario !== "huidig" && saving > 0 && <span className="ml-1 font-semibold text-ok">−{Math.round(saving * 100)}%</span>}
          </div>
        </div>
        <div className="rounded-card border border-line bg-paper-raised p-3">
          <div className="flex items-center gap-1.5 text-xs text-ink-500">
            <Thermometer size={14} /> Per m² vloer
          </div>
          <div className="tabular text-2xl font-bold text-ink-900">{Math.round(result.wPerM2)} W/m²</div>
          <div className="text-[11px] text-ink-500">{result.floorArea.toFixed(0)} m² verwarmde ruimtes</div>
        </div>
      </section>

      <div className={`rounded-card border px-3 py-2.5 ${toneCls}`}>
        <div className="text-sm font-semibold">{result.heatPumpVerdict.label}</div>
        <div className="text-xs text-ink-700">{result.heatPumpVerdict.explanation}</div>
      </div>

      {/* Schil */}
      <section className="space-y-2 rounded-card border border-line bg-paper-raised p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Waar lekt de warmte weg?</h2>
        <div className="flex h-4 overflow-hidden rounded-full">
          {ENVELOPE.map((e) => (
            <div key={e.key} style={{ width: `${(result.envelope[e.key] / envTotal) * 100}%`, background: e.color }} title={e.label} />
          ))}
        </div>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
          {ENVELOPE.map((e) => (
            <li key={e.key} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: e.color }} />
              <span className="text-ink-700">{e.label}</span>
              <span className="tabular ml-auto text-ink-900">{Math.round((result.envelope[e.key] / envTotal) * 100)}%</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Per ruimte */}
      <section className="space-y-2 rounded-card border border-line bg-paper-raised p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Per ruimte</h2>
          <label className="flex items-center gap-1 text-[11px] text-ink-500">
            Aanvoer
            <select value={supply} onChange={(e) => setSupply(Number(e.target.value) as 45 | 55 | 70)} className="rounded border border-line bg-paper px-1 py-0.5 text-[11px] text-ink-900">
              <option value={45}>45 °C (warmtepomp)</option>
              <option value={55}>55 °C (LT)</option>
              <option value={70}>70 °C (cv-ketel)</option>
            </select>
          </label>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[11px] text-ink-500">
              <th className="py-1 font-medium">Ruimte</th>
              <th className="py-1 pl-2 text-right font-medium">Verlies</th>
              <th className="py-1 pl-2 text-right font-medium">W/m²</th>
              <th className="py-1 text-right font-medium" title="Benodigd radiatorvermogen volgens typeplaatje (75/65 °C) bij de gekozen aanvoertemperatuur">
                Radiator nom.
              </th>
            </tr>
          </thead>
          <tbody>
            {result.rooms.map((r) => (
              <tr key={r.room.id} className="border-t border-line/60">
                <td className="py-1.5">
                  <button onClick={() => showOnPlan([r.room.id])} className="text-left text-ink-900">
                    {r.room.name}
                  </button>
                  <div className="text-[10px] text-ink-500">
                    {r.levelName} · {r.floorArea.toFixed(1)} m²{r.radiators > 0 ? ` · ${r.radiators} rad.` : " · geen radiator getekend"}
                  </div>
                </td>
                <td className="tabular whitespace-nowrap py-1.5 text-right text-ink-900">{fmtW(r.total)}</td>
                <td className={`tabular py-1.5 text-right ${r.wPerM2 > 80 ? "text-danger" : r.wPerM2 > 50 ? "text-warn" : "text-ok"}`}>{Math.round(r.wPerM2)}</td>
                <td className="tabular whitespace-nowrap py-1.5 text-right text-ink-700">{fmtW(r.total / factor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] leading-snug text-ink-500">
          &ldquo;Radiator nom.&rdquo; = vermogen op het typeplaatje (bij 75/65 °C) dat je nodig hebt om de ruimte bij
          {` ${supply} °C`} aanvoer warm te krijgen. Bij lage temperatuur zijn dus grotere radiatoren of vloerverwarming nodig.
        </p>
      </section>

      {/* Advies */}
      {scenario === "huidig" && base.advice.length > 0 && (
        <section className="space-y-2 rounded-card border border-line bg-paper-raised p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Isolatieadvies (grootste winst eerst)</h2>
          <ul className="space-y-1.5">
            {base.advice.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                {a.severity === "info" ? <Info size={14} className="mt-0.5 shrink-0 text-blueprint" /> : <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warn" />}
                <span className="flex-1 text-xs leading-snug text-ink-900">{a.message}</span>
                {a.elementId && (
                  <button onClick={() => showOnPlan([a.elementId!])} className="shrink-0 rounded bg-paper-sunken p-1 text-ink-700" title="Toon op plattegrond">
                    <MapPin size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-ink-500">
            &ldquo;Aangenomen&rdquo; = er is nog geen Rc/U-waarde ingevuld; dan gaat de app uit van een ongeïsoleerde
            bestaande constructie. Vul de echte waarden in bij het element (selecteer het op de plattegrond).
          </p>
        </section>
      )}

      {/* Uitgangspunten */}
      <section className="space-y-3 rounded-card border border-line bg-paper-raised p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Uitgangspunten</h2>
        {lowest && (
          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="text-ink-700">
              Rc begane-grondvloer <span className="text-ink-500">({lowest.name})</span>
            </span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                step={0.1}
                min={0}
                defaultValue={lowest.floorRc ?? ""}
                placeholder={String(DEFAULT_EXISTING_FLOOR_RC)}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  void update("levels", lowest.id, { floorRc: v === "" ? undefined : Math.max(0, Number(v.replace(",", "."))) });
                }}
                className="tabular w-16 rounded-md border border-line bg-paper px-2 py-1 text-right text-xs text-ink-900"
              />
              <span className="text-[11px] text-ink-500">m²K/W</span>
            </span>
          </label>
        )}
        <label className="block text-xs">
          <span className="flex justify-between text-ink-700">
            Ventilatie/infiltratie <span className="tabular text-ink-900">{airChanges.toFixed(1).replace(".", ",")}×/uur</span>
          </span>
          <input type="range" min={0.2} max={1.5} step={0.1} value={airChanges} onChange={(e) => setAirChanges(Number(e.target.value))} className="w-full accent-accent" />
          <span className="text-[10px] text-ink-500">Oude boerderij met kieren ≈ 0,7–1,0 · kierdicht met roosters ≈ 0,5 · met WTW ≈ 0,3</span>
        </label>
        <p className="text-[10px] leading-snug text-ink-500">
          Indicatieve berekening (vereenvoudigd ISSO 51): transmissie door de schil + ventilatieverlies, zonder
          koudebruggen, opwarmtoeslag of zoninstraling. Geschikt om maatregelen te vergelijken; voor het dimensioneren
          van een warmtepomp of een energielabel is een officiële berekening door een adviseur nodig. Huidige vloer-Rc:{" "}
          {lowest ? floorRc(lowest).toFixed(2) : "–"}.
        </p>
      </section>
    </div>
  );
}
