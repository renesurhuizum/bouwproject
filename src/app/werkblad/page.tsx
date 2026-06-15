"use client";

// Werkblad: afdrukbaar dossier voor de bouwplaats met tabbladen:
// Plan (plattegrond + maatvoering), Aanzichten (wand-elevaties) en
// Specificaties (ruimtes, installaties, hoeveelheidsstaat). Print → "Bewaar als PDF".

import { useMemo, useState } from "react";
import Link from "next/link";
import { Printer, ArrowLeft, Map as MapIcon, Frame, ListTree, Download, DoorOpen } from "lucide-react";
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
import { svgToPngBlob, downloadBlob } from "@/lib/exportImage";
import { formatArea, formatHeight } from "@/lib/format";
import {
  ELECTRICAL_LABEL,
  FIXTURE_LABEL,
  PHASE_STATUS_LABEL,
} from "@/lib/domain/constants";
import type { ElectricalType, FixtureKind } from "@/lib/domain/types";

type Tab = "plan" | "aanzichten" | "kozijnstaat" | "specs";

const TABS: { key: Tab; label: string; icon: typeof MapIcon }[] = [
  { key: "plan", label: "Plan", icon: MapIcon },
  { key: "aanzichten", label: "Aanzichten", icon: Frame },
  { key: "kozijnstaat", label: "Kozijnstaat", icon: DoorOpen },
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
  const phases = usePhases(project?.id) ?? [];
  const tasks = useTasks(project?.id) ?? [];

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

        {/* ── SPECIFICATIES ────────────────────────────────────── */}
        {tab === "specs" && (
          <div className="space-y-6">
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
