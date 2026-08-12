"use client";

// Groepenkast: eindgroepen beheren en elektra-punten eraan toewijzen.
//
// Voorheen was "groep" een vrij tekstveld per stopcontact. Daardoor was er
// niets over een groep te zeggen: geen zekering, geen kabeltype en vooral geen
// aantal meters. Hier krijgt elke groep een zekering (die de kabel bepaalt),
// een kleur op de plattegrond en een berekende trekkabellengte.

import { useState } from "react";
import { Plus, Trash2, X, Zap } from "lucide-react";
import { mBatch, mCreate, mRemove, mUpdate } from "@/lib/db/mutate";
import { useEditor } from "@/lib/store/editor";
import { useProject, useLevels, useCircuits, useAllElectrical } from "@/lib/hooks";
import {
  BREAKER_SPECS,
  CIRCUIT_PALETTE,
  ELECTRICAL_LABEL,
} from "@/lib/domain/constants";
import { useWalls } from "@/lib/hooks";
import { computeCircuitRoutes } from "@/lib/routing/cableRouting";
import type { BreakerKind, ElectricalCircuit } from "@/lib/domain/types";
import { formatLength } from "@/lib/format";

const BREAKERS = Object.keys(BREAKER_SPECS) as BreakerKind[];

export function GroepenkastPanel({ onClose }: { onClose: () => void }) {
  const project = useProject();
  const levels = useLevels(project?.id) ?? [];
  const levelIds = levels.map((l) => l.id);
  const circuits = useCircuits(project?.id) ?? [];
  const electrical = useAllElectrical(levelIds) ?? [];
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const walls = useWalls(activeLevelId) ?? [];
  const assignCircuitId = useEditor((s) => s.assignCircuitId);
  const setAssignCircuitId = useEditor((s) => s.setAssignCircuitId);

  const [busy, setBusy] = useState(false);

  // Routes worden over alle verdiepingen berekend: een groep loopt vaak door.
  const allWalls = walls;
  const routes = computeCircuitRoutes({
    circuits,
    items: electrical,
    walls: allWalls,
    levels,
  });
  const routeById = new Map(routes.map((r) => [r.circuitId, r]));

  const unassigned = electrical.filter((e) => e.type !== "panel" && !e.circuitId);
  const hasPanel = electrical.some((e) => e.type === "panel");

  async function addCircuit() {
    if (!project?.id || busy) return;
    setBusy(true);
    try {
      const next = circuits.length + 1;
      const panel = electrical.find((e) => e.type === "panel");
      await mCreate<ElectricalCircuit>("circuits", {
        projectId: project.id,
        number: String(next),
        name: `Groep ${next}`,
        breaker: "B16",
        cableSpec: BREAKER_SPECS.B16.cableSpec,
        color: CIRCUIT_PALETTE[circuits.length % CIRCUIT_PALETTE.length],
        panelId: panel?.id,
        routeAt: "ceiling",
      });
    } finally {
      setBusy(false);
    }
  }

  // Groep weg: de punten worden losgekoppeld, niet verwijderd.
  async function deleteCircuit(id: string) {
    await mBatch(async () => {
      for (const item of electrical.filter((e) => e.circuitId === id)) {
        await mUpdate("electrical", item.id, { circuitId: undefined });
      }
      await mRemove("circuits", id);
    });
    if (assignCircuitId === id) setAssignCircuitId(null);
  }

  async function setBreaker(circuit: ElectricalCircuit, breaker: BreakerKind) {
    // De kabel volgt uit de zekering; handmatig afwijken kan daarna nog.
    await mUpdate("circuits", circuit.id, {
      breaker,
      cableSpec: BREAKER_SPECS[breaker].cableSpec,
    });
  }

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-paper/95 backdrop-blur">
      <div className="mx-auto max-w-2xl space-y-4 p-4 pb-24">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900">
              <Zap size={18} className="text-blueprint" /> Groepenkast
            </h2>
            <p className="text-xs text-ink-500">
              Verdeel de punten over eindgroepen; de app rekent per groep uit
              hoeveel meter kabel je moet trekken.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Sluiten"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-paper-sunken hover:text-ink-900"
          >
            <X size={18} />
          </button>
        </header>

        {!hasPanel && (
          <p className="rounded-card border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Er staat nog geen meterkast op de plattegrond. Plaats er één
            (Installatie → Elektra → Groepenkast); de kabellengtes worden vanaf
            dat punt gemeten.
          </p>
        )}

        {assignCircuitId && (
          <div className="sticky top-0 z-10 flex items-center justify-between rounded-card border border-accent bg-accent/10 px-3 py-2">
            <span className="text-xs font-medium text-ink-900">
              Tik punten op de plattegrond aan om ze aan{" "}
              {circuits.find((c) => c.id === assignCircuitId)?.name} toe te wijzen.
            </span>
            <button
              onClick={() => setAssignCircuitId(null)}
              className="rounded-lg bg-ink-900 px-2.5 py-1 text-[11px] font-medium text-white"
            >
              Klaar
            </button>
          </div>
        )}

        <div className="space-y-3">
          {circuits.map((circuit) => {
            const members = electrical.filter(
              (e) => e.circuitId === circuit.id && e.type !== "panel",
            );
            const route = routeById.get(circuit.id);
            const spec = BREAKER_SPECS[circuit.breaker];
            const overloaded = members.length > spec.maxPoints;
            return (
              <section
                key={circuit.id}
                className="space-y-2.5 rounded-card border border-line bg-paper-raised p-3"
                style={{ borderLeftWidth: 4, borderLeftColor: circuit.color }}
              >
                <div className="flex items-center gap-2">
                  <input
                    value={circuit.number}
                    onChange={(e) => mUpdate("circuits", circuit.id, { number: e.target.value })}
                    className="tabular w-10 rounded-md border border-line bg-paper px-1.5 py-1 text-center text-xs font-bold text-ink-900"
                    aria-label="Groepnummer"
                  />
                  <input
                    value={circuit.name}
                    onChange={(e) => mUpdate("circuits", circuit.id, { name: e.target.value })}
                    className="min-w-0 flex-1 rounded-md border border-line bg-paper px-2 py-1 text-sm font-medium text-ink-900"
                    aria-label="Groepnaam"
                  />
                  <button
                    onClick={() => void deleteCircuit(circuit.id)}
                    aria-label={`${circuit.name} verwijderen`}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-ink-400 hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={circuit.breaker}
                    onChange={(e) => void setBreaker(circuit, e.target.value as BreakerKind)}
                    className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink-900"
                  >
                    {BREAKERS.map((b) => (
                      <option key={b} value={b}>{BREAKER_SPECS[b].label}</option>
                    ))}
                  </select>
                  <span className="tabular rounded-md bg-paper-sunken px-2 py-1 text-xs font-medium text-ink-700">
                    {circuit.cableSpec}
                  </span>
                  <select
                    value={circuit.routeAt ?? "ceiling"}
                    onChange={(e) =>
                      mUpdate("circuits", circuit.id, {
                        routeAt: e.target.value as "ceiling" | "floor",
                      })
                    }
                    className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink-900"
                    title="Loopt de kabel via het plafond of door de vloer?"
                  >
                    <option value="ceiling">via plafond</option>
                    <option value="floor">via vloer</option>
                  </select>
                </div>

                <div className="flex items-baseline justify-between rounded-lg bg-paper-sunken px-2.5 py-2">
                  <span className="text-[11px] text-ink-500">
                    {members.length} {members.length === 1 ? "punt" : "punten"}
                    {route && route.measuredM > 0 && (
                      <> · gemeten {formatLength(route.measuredM)}</>
                    )}
                  </span>
                  <span className="tabular text-sm font-bold text-ink-900">
                    {route ? formatLength(route.purchaseM) : "—"}
                    <span className="ml-1 text-[10px] font-normal text-ink-400">inkoop</span>
                  </span>
                </div>

                {overloaded && (
                  <p className="text-[11px] text-danger">
                    {members.length} punten op een {circuit.breaker}-groep — NEN 1010
                    houdt {spec.maxPoints} aan als praktijkgrens.
                  </p>
                )}
                {route && route.unroutedItemIds.length > 0 && (
                  <p className="text-[11px] text-amber-700">
                    {route.unroutedItemIds.length} punt(en) konden niet langs muren
                    gerouteerd worden; daar is hemelsbreed gerekend.
                  </p>
                )}

                <div className="flex flex-wrap gap-1">
                  {members.map((m) => (
                    <span
                      key={m.id}
                      className="rounded bg-paper-sunken px-1.5 py-0.5 text-[10px] text-ink-600"
                    >
                      {ELECTRICAL_LABEL[m.type]}
                    </span>
                  ))}
                </div>

                <button
                  onClick={() =>
                    setAssignCircuitId(assignCircuitId === circuit.id ? null : circuit.id)
                  }
                  className={`w-full rounded-lg py-1.5 text-xs font-medium ${
                    assignCircuitId === circuit.id
                      ? "bg-accent text-white"
                      : "bg-paper-sunken text-ink-700 hover:bg-paper"
                  }`}
                >
                  {assignCircuitId === circuit.id ? "Bezig met toewijzen…" : "Punten toewijzen"}
                </button>
              </section>
            );
          })}
        </div>

        <button
          onClick={() => void addCircuit()}
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-card border border-dashed border-line py-2.5 text-sm font-medium text-ink-600 hover:text-ink-900 disabled:opacity-40"
        >
          <Plus size={15} /> Groep toevoegen
        </button>

        {unassigned.length > 0 && (
          <p className="rounded-card border border-line bg-paper-raised px-3 py-2 text-xs text-ink-500">
            {unassigned.length} punt(en) zitten nog in geen enkele groep en tellen
            dus niet mee in de kabellijst.
          </p>
        )}
      </div>
    </div>
  );
}
