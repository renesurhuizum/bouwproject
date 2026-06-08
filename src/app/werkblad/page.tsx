"use client";

// Werkblad: afdrukbaar overzicht (plattegrond + maten, installatie-hoogtes,
// stappenplan) om mee te nemen naar de bouwplaats. Print → "Bewaar als PDF".

import Link from "next/link";
import { Printer, ArrowLeft } from "lucide-react";
import {
  useProject,
  useLevels,
  useWalls,
  useRooms,
  useElectrical,
  usePlumbing,
  usePhases,
  useTasks,
} from "@/lib/hooks";
import { useEditor } from "@/lib/store/editor";
import { WerkbladPlan } from "@/components/werkblad/WerkbladPlan";
import { polygonArea } from "@/lib/geometry";
import { formatArea, formatHeight } from "@/lib/format";
import {
  ELECTRICAL_LABEL,
  FIXTURE_LABEL,
  PHASE_STATUS_LABEL,
} from "@/lib/domain/constants";
import type { ElectricalType, FixtureKind } from "@/lib/domain/types";

export default function WerkbladPage() {
  const project = useProject();
  const levels = useLevels(project?.id) ?? [];
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const level = levels.find((l) => l.id === activeLevelId) ?? levels[0];

  const walls = useWalls(level?.id) ?? [];
  const rooms = useRooms(level?.id) ?? [];
  const electrical = useElectrical(level?.id) ?? [];
  const plumbing = usePlumbing(level?.id) ?? [];
  const phases = usePhases(project?.id) ?? [];
  const tasks = useTasks(project?.id) ?? [];

  // Elektra samenvatten per type.
  const elecByType = new Map<ElectricalType, { count: number; height: number }>();
  for (const e of electrical) {
    const cur = elecByType.get(e.type) ?? { count: 0, height: e.heightZ };
    elecByType.set(e.type, { count: cur.count + 1, height: e.heightZ });
  }
  const fixByType = new Map<FixtureKind, number>();
  for (const p of plumbing) if (p.fixture) fixByType.set(p.fixture, (fixByType.get(p.fixture) ?? 0) + 1);

  const datum = new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date());

  return (
    <div className="print-area h-full overflow-y-auto bg-paper">
      {/* Actiebalk (niet printen) */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-line bg-paper-raised px-4 py-2">
        <Link href="/" className="flex items-center gap-1.5 text-sm text-ink-700">
          <ArrowLeft size={16} /> Terug
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
        >
          <Printer size={16} /> Print / PDF
        </button>
      </div>

      <div className="mx-auto max-w-3xl space-y-6 p-5 pb-10">
        {/* Kop */}
        <header className="border-b-2 border-ink-900 pb-3">
          <div className="text-[11px] uppercase tracking-[0.2em] text-accent">Werkblad</div>
          <h1 className="text-2xl font-bold text-ink-900">{project?.name ?? "Bouwproject"}</h1>
          <div className="mt-1 flex justify-between text-xs text-ink-500">
            <span>Verdieping: {level?.name ?? "—"}</span>
            <span className="tabular">{datum}</span>
          </div>
        </header>

        {/* Plattegrond */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-500">
            Plattegrond &amp; maatvoering
          </h2>
          <div className="rounded-lg border border-line bg-white p-3">
            <WerkbladPlan walls={walls} rooms={rooms} electrical={electrical} plumbing={plumbing} />
          </div>
        </section>

        {/* Ruimtes */}
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

        {/* Installaties */}
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

        {/* Stappenplan */}
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
