"use client";

// Werkblad: afdrukbaar dossier voor de bouwplaats met tabbladen:
// Plan (plattegrond + maatvoering), Aanzichten (wand-elevaties) en
// Specificaties (ruimtes, installaties, hoeveelheidsstaat). Print → "Bewaar als PDF".

import { useMemo, useState } from "react";
import Link from "next/link";
import { Printer, ArrowLeft, Map as MapIcon, Frame, ListTree, Download, DoorOpen, Zap } from "lucide-react";
import {
  useProject,
  useLevels,
  useWalls,
  useRooms,
  useOpenings,
  useElectrical,
  usePlumbing,
  useFurniture,
  useHvac,
  usePhases,
  useTasks,
  useCircuits,
  useAllElectrical,
  useBeams,
} from "@/lib/hooks";
import { useEditor } from "@/lib/store/editor";
import { update } from "@/lib/db/repo";
import { WerkbladPlan } from "@/components/werkblad/WerkbladPlan";
import { WallElevation } from "@/components/werkblad/WallElevation";
import { OpeningSchedule } from "@/components/werkblad/OpeningSchedule";
import { roomWalls } from "@/lib/roomWalls";
import { computeQuantities } from "@/lib/quantityTakeoff";
import { polygonArea } from "@/lib/geometry";
import { buildOpeningSchedule } from "@/lib/openingSchedule";
import { computeCircuitRoutes } from "@/lib/routing/cableRouting";
import { BREAKER_SPECS, CABLE_DRUM_M } from "@/lib/domain/constants";
import { findSection, LINTEL_BEARING_M } from "@/lib/structural/sections";
import { dist } from "@/lib/geometry";
import { formatLength } from "@/lib/format";
import { svgToPngBlob, downloadBlob } from "@/lib/exportImage";
import { formatArea, formatHeight } from "@/lib/format";
import {
  ELECTRICAL_LABEL,
  FIXTURE_LABEL,
  PHASE_STATUS_LABEL,
} from "@/lib/domain/constants";
import type { ElectricalType, FixtureKind } from "@/lib/domain/types";

type Tab = "plan" | "aanzichten" | "kozijnstaat" | "elektra" | "specs";

const TABS: { key: Tab; label: string; icon: typeof MapIcon }[] = [
  { key: "plan", label: "Plan", icon: MapIcon },
  { key: "aanzichten", label: "Aanzichten", icon: Frame },
  { key: "kozijnstaat", label: "Kozijnstaat", icon: DoorOpen },
  { key: "elektra", label: "Trekplan", icon: Zap },
  { key: "specs", label: "Specificaties", icon: ListTree },
];

const PLAN_SVG_ID = "werkblad-plan-svg";
const DRAWING_SCALES = [50, 100, 200];

const QTY_CAT_LABEL: Record<string, string> = {
  walls: "Wanden",
  floors: "Vloeren & plafonds",
  openings: "Deuren & ramen",
  finishes: "Afwerking",
};

export default function WerkbladPage() {
  const project = useProject();
  const levels = useLevels(project?.id) ?? [];
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const level = levels.find((l) => l.id === activeLevelId) ?? levels[0];

  const walls = useWalls(level?.id) ?? [];
  const rooms = useRooms(level?.id) ?? [];
  const openings = useOpenings(level?.id) ?? [];
  const electrical = useElectrical(level?.id) ?? [];
  const plumbing = usePlumbing(level?.id) ?? [];
  const furniture = useFurniture(level?.id ?? null) ?? [];
  const hvac = useHvac(level?.id) ?? [];
  const beams = useBeams(level?.id) ?? [];
  const phases = usePhases(project?.id) ?? [];
  const tasks = useTasks(project?.id) ?? [];

  // Trekplan: kabelroutes worden over het hele project berekend, want een
  // eindgroep loopt vaak door meerdere verdiepingen.
  const circuits = useCircuits(project?.id) ?? [];
  const levelIds = useMemo(() => levels.map((l) => l.id), [levels]);
  const allElectrical = useAllElectrical(levelIds) ?? [];
  const cableRoutes = useMemo(
    () =>
      circuits.length > 0
        ? computeCircuitRoutes({ circuits, items: allElectrical, walls, levels })
        : [],
    [circuits, allElectrical, walls, levels],
  );
  const routeById = useMemo(
    () => new Map(cableRoutes.map((r) => [r.circuitId, r])),
    [cableRoutes],
  );
  // Inkoop per kabeltype: draad komt per rol van 100 m, dus afronden op rollen.
  const cableTotals = useMemo(() => {
    const byCable = new Map<string, number>();
    for (const c of circuits) {
      const route = routeById.get(c.id);
      if (!route || route.purchaseM <= 0) continue;
      byCable.set(c.cableSpec, (byCable.get(c.cableSpec) ?? 0) + route.purchaseM);
    }
    return [...byCable.entries()]
      .map(([cableSpec, meters]) => ({
        cableSpec,
        meters: Math.round(meters * 10) / 10,
        drums: Math.ceil(meters / CABLE_DRUM_M),
      }))
      .sort((a, b) => a.cableSpec.localeCompare(b.cableSpec));
  }, [circuits, routeById]);

  // Constructiestaat: balken en lateien per profiel, met lengte en gewicht.
  const structuralItems = useMemo(() => {
    const rows = new Map<string, { label: string; count: number; meters: number; kg: number }>();
    const add = (key: string, lengthM: number) => {
      const section = findSection(key);
      if (!section) return;
      const cur = rows.get(key) ?? { label: section.label, count: 0, meters: 0, kg: 0 };
      cur.count += 1;
      cur.meters += lengthM;
      cur.kg += lengthM * section.weightKgPerM;
      rows.set(key, cur);
    };
    for (const b of beams) add(b.profile, dist(b.start, b.end));
    for (const o of openings) {
      if (o.lintelProfile) add(o.lintelProfile, o.width + 2 * LINTEL_BEARING_M);
    }
    return [...rows.values()]
      .map((r) => ({ ...r, meters: Math.round(r.meters * 100) / 100, kg: Math.round(r.kg) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [beams, openings]);

  const [tab, setTab] = useState<Tab>("plan");

  const { codeById } = useMemo(() => buildOpeningSchedule(openings), [openings]);
  const drawingScale = project?.drawingScale ?? 100;
  const planMaxWidth = Math.round(700 * (100 / drawingScale));

  async function downloadPng() {
    const svg = document.getElementById(PLAN_SVG_ID) as SVGSVGElement | null;
    if (!svg) return;
    const blob = await svgToPngBlob(svg, 2);
    downloadBlob(
      blob,
      `${(project?.name ?? "plattegrond").replace(/\s+/g, "_")}_${level?.name ?? ""}.png`,
    );
  }
  async function bumpRevision() {
    if (!project?.id) return;
    await update("projects", project.id, {
      revisionNumber: (project.revisionNumber ?? 0) + 1,
      revisionDate: new Date().toISOString().slice(0, 10),
    });
  }

  // Elektra samenvatten per type.
  const elecByType = new Map<ElectricalType, { count: number; height: number }>();
  for (const e of electrical) {
    const cur = elecByType.get(e.type) ?? { count: 0, height: e.heightZ };
    elecByType.set(e.type, { count: cur.count + 1, height: e.heightZ });
  }
  const fixByType = new Map<FixtureKind, number>();
  for (const p of plumbing) if (p.fixture) fixByType.set(p.fixture, (fixByType.get(p.fixture) ?? 0) + 1);

  const quantities = useMemo(
    () => (level ? computeQuantities(walls, rooms, openings, level) : []),
    [walls, rooms, openings, level],
  );

  const datum = new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date());

  return (
    <div className="print-area h-full overflow-y-auto bg-paper">
      {/* Actiebalk (niet printen) */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-line bg-paper-raised px-4 py-2">
        <Link href="/" className="flex items-center gap-1.5 text-sm text-ink-700">
          <ArrowLeft size={16} /> Terug
        </Link>
        <div className="flex gap-1 rounded-full bg-paper-sunken p-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.key ? "bg-ink-900 text-paper-raised" : "text-ink-500"
                }`}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          {tab === "plan" && (
            <button
              onClick={() => void downloadPng()}
              className="flex items-center gap-2 rounded-lg bg-paper-sunken px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-line"
            >
              <Download size={16} /> PNG
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            <Printer size={16} /> Print / PDF
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 p-5 pb-10">
        {/* Titelblok */}
        <header className="border-2 border-ink-900">
          <div className="flex items-stretch justify-between">
            <div className="flex-1 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-accent">Werkblad</div>
              <h1 className="text-2xl font-bold leading-tight text-ink-900">
                {project?.name ?? "Bouwproject"}
              </h1>
              {project?.description && (
                <p className="mt-0.5 text-xs text-ink-500">{project.description}</p>
              )}
            </div>
            <div className="grid grid-cols-2 border-l border-ink-900 text-[10px] tabular">
              <TitleCell label="Datum" value={datum} />
              <TitleCell label="Verdieping" value={level?.name ?? "—"} />
              <TitleCell label="Schaal" value={`1:${drawingScale}`} />
              <TitleCell
                label="Revisie"
                value={
                  project?.revisionDate
                    ? `${project.revisionNumber ?? 0} · ${project.revisionDate}`
                    : String(project?.revisionNumber ?? 0)
                }
              />
            </div>
          </div>
        </header>

        {/* ── PLAN ─────────────────────────────────────────────── */}
        {tab === "plan" && (
          <section>
            <div className="no-print mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-500">
                Plattegrond &amp; maatvoering
              </h2>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-ink-500">
                  Schaal
                  <select
                    value={drawingScale}
                    onChange={(e) => void update("projects", project!.id, { drawingScale: Number(e.target.value) })}
                    disabled={!project}
                    className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink-900"
                  >
                    {DRAWING_SCALES.map((s) => (
                      <option key={s} value={s}>1:{s}</option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => void bumpRevision()}
                  disabled={!project}
                  className="rounded-md bg-paper-sunken px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-line disabled:opacity-40"
                >
                  Revisie +1
                </button>
              </div>
            </div>
            <div className="rounded-lg border border-line bg-white p-3">
              <WerkbladPlan
                svgId={PLAN_SVG_ID}
                walls={walls}
                rooms={rooms}
                openings={openings}
                electrical={electrical}
                plumbing={plumbing}
                furniture={furniture}
                northDegrees={project?.northDegrees ?? 0}
                maxWidth={planMaxWidth}
                openingCodes={codeById}
              />
            </div>
          </section>
        )}

        {/* ── AANZICHTEN ───────────────────────────────────────── */}
        {tab === "aanzichten" && (
          <section className="space-y-6">
            {rooms.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-300">
                Nog geen ruimtes. Teken eerst een plattegrond met kamers.
              </p>
            ) : (
              rooms.map((room) => {
                const rWalls = roomWalls(room.polygon, walls);
                if (rWalls.length === 0) return null;
                return (
                  <div key={room.id} className="break-inside-avoid space-y-3">
                    <h2 className="text-sm font-bold text-ink-900">{room.name}</h2>
                    {rWalls.map((w, i) => (
                      <div key={w.id} className="break-inside-avoid rounded-lg border border-line bg-white p-3">
                        <WallElevation
                          wall={w}
                          openings={openings}
                          electrical={electrical}
                          plumbing={plumbing}
                          hvac={hvac}
                          wallName={`${room.name} — Muur ${i + 1}`}
                        />
                      </div>
                    ))}
                  </div>
                );
              })
            )}
          </section>
        )}

        {/* ── KOZIJNSTAAT ──────────────────────────────────────── */}
        {tab === "kozijnstaat" && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-500">
              Kozijnstaat — deuren &amp; ramen
            </h2>
            <div className="rounded-lg border border-line bg-white p-4">
              <OpeningSchedule openings={openings} />
            </div>
            <p className="mt-2 text-[11px] text-ink-400">
              De postnummers (D01, R01…) verschijnen als referentielabels in het Plan-tabblad.
            </p>
          </section>
        )}

        {/* ── TREKPLAN (elektra) ───────────────────────────────── */}
        {tab === "elektra" && (
          <div className="space-y-6">
            {circuits.length === 0 ? (
              <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-sm text-ink-500">
                Nog geen eindgroepen. Maak ze aan via{" "}
                <Link href="/plattegrond" className="font-medium text-accent underline">
                  Plattegrond → Groepen
                </Link>{" "}
                en wijs de punten toe; hier verschijnt dan per groep hoeveel meter
                kabel je moet trekken.
              </p>
            ) : (
              <>
                <Section title="Trekkabellijst">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-500">
                        <th className="py-1.5">Groep</th>
                        <th className="py-1.5">Zekering</th>
                        <th className="py-1.5">Kabel</th>
                        <th className="py-1.5 text-right">Punten</th>
                        <th className="py-1.5 text-right">Gemeten</th>
                        <th className="py-1.5 text-right">Inkoop</th>
                      </tr>
                    </thead>
                    <tbody>
                      {circuits.map((c) => {
                        const route = routeById.get(c.id);
                        const points = allElectrical.filter(
                          (e) => e.circuitId === c.id && e.type !== "panel",
                        ).length;
                        return (
                          <tr key={c.id} className="border-b border-line/60">
                            <td className="py-1.5 font-medium text-ink-900">
                              <span
                                aria-hidden
                                className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                                style={{ background: c.color }}
                              />
                              {c.number} · {c.name}
                            </td>
                            <td className="py-1.5 text-ink-500">{c.breaker}</td>
                            <td className="tabular py-1.5 text-ink-700">{c.cableSpec}</td>
                            <td className="tabular py-1.5 text-right text-ink-700">{points}</td>
                            <td className="tabular py-1.5 text-right text-ink-500">
                              {route ? formatLength(route.measuredM) : "—"}
                            </td>
                            <td className="tabular py-1.5 text-right font-semibold text-ink-900">
                              {route ? formatLength(route.purchaseM) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[11px] leading-snug text-ink-400">
                    Gemeten = route langs de muren plus de stijgstukken naar
                    montagehoogte. Inkoop = gemeten plus speling per punt, een
                    staart in de meterkast en 10% snijverlies.
                  </p>
                </Section>

                <Section title="Inkoop per kabeltype">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-500">
                        <th className="py-1.5">Kabel</th>
                        <th className="py-1.5 text-right">Meters</th>
                        <th className="py-1.5 text-right">Rollen à {CABLE_DRUM_M} m</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cableTotals.map((t) => (
                        <tr key={t.cableSpec} className="border-b border-line/60">
                          <td className="tabular py-1.5 font-medium text-ink-900">{t.cableSpec}</td>
                          <td className="tabular py-1.5 text-right text-ink-700">
                            {t.meters.toFixed(1)} m
                          </td>
                          <td className="tabular py-1.5 text-right font-semibold text-ink-900">
                            {t.drums}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Section>

                <Section title="Aansluitpunten per groep">
                  <div className="space-y-3">
                    {circuits.map((c) => {
                      const members = allElectrical.filter(
                        (e) => e.circuitId === c.id && e.type !== "panel",
                      );
                      if (members.length === 0) return null;
                      const byType = new Map<ElectricalType, number>();
                      for (const m of members) {
                        byType.set(m.type, (byType.get(m.type) ?? 0) + 1);
                      }
                      const spec = BREAKER_SPECS[c.breaker];
                      return (
                        <div key={c.id} className="rounded-lg bg-paper-sunken px-3 py-2">
                          <p className="text-xs font-semibold text-ink-900">
                            Groep {c.number} — {c.name}{" "}
                            <span className="font-normal text-ink-500">
                              ({spec.cableSpec}, {spec.cores}×{spec.crossSection} mm²)
                            </span>
                          </p>
                          <p className="mt-1 text-xs text-ink-600">
                            {[...byType.entries()]
                              .map(([t, n]) => `${n}× ${ELECTRICAL_LABEL[t]}`)
                              .join(" · ")}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </Section>
              </>
            )}
          </div>
        )}

        {/* ── SPECIFICATIES ────────────────────────────────────── */}
        {tab === "specs" && (
          <div className="space-y-6">
            {structuralItems.length > 0 && (
              <Section title="Constructiestaat (indicatief)">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-500">
                      <th className="py-1.5">Profiel</th>
                      <th className="py-1.5 text-right">Aantal</th>
                      <th className="py-1.5 text-right">Totale lengte</th>
                      <th className="py-1.5 text-right">Gewicht</th>
                    </tr>
                  </thead>
                  <tbody>
                    {structuralItems.map((r) => (
                      <tr key={r.label} className="border-b border-line/60">
                        <td className="py-1.5 font-medium text-ink-900">{r.label}</td>
                        <td className="tabular py-1.5 text-right text-ink-700">{r.count}</td>
                        <td className="tabular py-1.5 text-right text-ink-700">
                          {r.meters.toFixed(2)} m
                        </td>
                        <td className="tabular py-1.5 text-right text-ink-900">{r.kg} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[11px] leading-snug text-amber-800">
                  Indicatief — geen constructieberekening. Laat de maatvoering
                  toetsen door een constructeur voordat je bestelt of bouwt.
                </p>
              </Section>
            )}
            {rooms.length > 0 && (
              <Section title="Ruimtes">
                <table className="w-full text-sm">
                  <tbody>
                    {rooms.map((r) => (
                      <tr key={r.id} className="border-b border-line/60">
                        <td className="py-1.5 font-medium text-ink-900">{r.name}</td>
                        <td className="py-1.5 text-ink-500">{r.func ?? ""}</td>
                        <td className="tabular py-1.5 text-right text-ink-900">
                          {formatArea(polygonArea(r.polygon))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {(elecByType.size > 0 || fixByType.size > 0) && (
              <Section title="Installaties — hoogtes">
                <div className="grid grid-cols-2 gap-4">
                  {elecByType.size > 0 && (
                    <div>
                      <h3 className="mb-1 text-xs font-semibold text-blueprint">Elektra</h3>
                      <table className="w-full text-xs">
                        <tbody>
                          {[...elecByType.entries()].map(([t, v]) => (
                            <tr key={t} className="border-b border-line/50">
                              <td className="py-1 text-ink-700">{ELECTRICAL_LABEL[t]}</td>
                              <td className="tabular py-1 text-center text-ink-500">{v.count}×</td>
                              <td className="tabular py-1 text-right text-ink-900">
                                {formatHeight(v.height)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {fixByType.size > 0 && (
                    <div>
                      <h3 className="mb-1 text-xs font-semibold text-[#0891b2]">Water</h3>
                      <table className="w-full text-xs">
                        <tbody>
                          {[...fixByType.entries()].map(([f, n]) => (
                            <tr key={f} className="border-b border-line/50">
                              <td className="py-1 text-ink-700">{FIXTURE_LABEL[f]}</td>
                              <td className="tabular py-1 text-right text-ink-500">{n}×</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {quantities.length > 0 && (
              <Section title="Hoeveelheidsstaat">
                <table className="w-full text-xs">
                  <tbody>
                    {quantities.map((q, i) => (
                      <tr key={`${q.name}-${i}`} className="border-b border-line/50">
                        <td className="py-1 text-ink-400">{QTY_CAT_LABEL[q.category]}</td>
                        <td className="py-1 text-ink-700">{q.name}</td>
                        <td className="tabular py-1 text-right text-ink-900">
                          {q.quantity} {q.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {tasks.length > 0 && (
              <Section title="Stappenplan">
                <div className="space-y-3">
                  {phases
                    .filter((p) => tasks.some((t) => t.phaseId === p.id))
                    .map((p) => (
                      <div key={p.id} className="break-inside-avoid">
                        <div className="mb-1 flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: p.color ?? "#78716c" }}
                          />
                          <span className="text-sm font-semibold text-ink-900">{p.name}</span>
                          <span className="text-[10px] text-ink-400">
                            {PHASE_STATUS_LABEL[p.status]}
                          </span>
                        </div>
                        <ul className="ml-4 space-y-0.5">
                          {tasks
                            .filter((t) => t.phaseId === p.id)
                            .map((t) => (
                              <li key={t.id} className="flex items-center gap-2 text-xs text-ink-700">
                                <span
                                  className={`inline-block h-3 w-3 rounded-sm border ${
                                    t.done ? "border-ok bg-ok" : "border-line-strong"
                                  }`}
                                />
                                <span className={t.done ? "line-through text-ink-400" : ""}>
                                  {t.title}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TitleCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-l border-ink-900/30 px-2 py-1 first:border-l-0">
      <div className="text-[8px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className="font-semibold text-ink-900">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-500">{title}</h2>
      {children}
    </section>
  );
}
