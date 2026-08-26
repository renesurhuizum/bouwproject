"use client";

// Kozijnstaat: automatisch gegenereerde tabel van alle deuren en ramen met
// postnummer, type, maatvoering (mm) en telling per type.

import type { Opening } from "@/lib/domain/types";
import { OPENING_LABEL } from "@/lib/domain/constants";
import { buildOpeningSchedule } from "@/lib/openingSchedule";

const mm = (m: number) => Math.round(m * 1000);

export function OpeningSchedule({ openings }: { openings: Opening[] }) {
  const { rows } = buildOpeningSchedule(openings);

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-ink-300">
        Nog geen deuren of ramen geplaatst.
      </p>
    );
  }

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.type] = (acc[r.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b-2 border-ink-900 text-left text-[10px] uppercase tracking-wide text-ink-500">
            <th className="py-1.5">Postnr</th>
            <th className="py-1.5">Type</th>
            <th className="py-1.5 text-right">Breedte</th>
            <th className="py-1.5 text-right">Hoogte</th>
            <th className="py-1.5 text-right">Borstwering</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line/60">
              <td className="tabular py-1.5 font-semibold text-ink-900">{r.code}</td>
              <td className="py-1.5 text-ink-700">{OPENING_LABEL[r.type]}</td>
              <td className="tabular py-1.5 text-right text-ink-900">{mm(r.width)} mm</td>
              <td className="tabular py-1.5 text-right text-ink-900">{mm(r.height)} mm</td>
              <td className="tabular py-1.5 text-right text-ink-500">
                {r.type === "window" ? `${mm(r.sillHeight)} mm` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex gap-4 text-[11px] text-ink-500">
        {Object.entries(counts).map(([t, n]) => (
          <span key={t}>
            {OPENING_LABEL[t as keyof typeof OPENING_LABEL]}: <strong className="text-ink-900">{n}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
