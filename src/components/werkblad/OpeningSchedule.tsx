"use client";

// Kozijnstaat: tabel van alle deuren en ramen per verdieping.

import type { Opening, Wall } from "@/lib/domain/types";

interface Props {
  openings: Opening[];
  walls: Wall[];
}

function prefix(type: Opening["type"]) {
  if (type === "door") return "D";
  if (type === "window") return "R";
  return "P";
}

function label(type: Opening["type"]) {
  if (type === "door") return "Deur";
  if (type === "window") return "Raam";
  return "Doorgang";
}

export function OpeningSchedule({ openings, walls }: Props) {
  const wallById = new Map(walls.map((w) => [w.id, w]));

  // Sorteer: deuren eerst, ramen daarna, doorgang laatste
  const sorted = [...openings].sort((a, b) => {
    const order = { door: 0, window: 1, passage: 2 };
    return order[a.type] - order[b.type];
  });

  // Nummering per type
  const counters: Record<string, number> = {};
  const rows = sorted.map((op) => {
    const p = prefix(op.type);
    counters[p] = (counters[p] ?? 0) + 1;
    const nr = `${p}${String(counters[p]).padStart(2, "0")}`;
    const wall = wallById.get(op.wallId);
    const wallLen = wall
      ? Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y)
      : null;
    return { nr, op, wallLen };
  });

  if (rows.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-ink-300">Geen openingen gevonden.</p>
    );
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b-2 border-ink-900 text-left text-[10px] uppercase tracking-wide text-ink-500">
          <th className="py-1.5 pr-2">Nr.</th>
          <th className="py-1.5 pr-2">Type</th>
          <th className="py-1.5 pr-2 text-right tabular">B (mm)</th>
          <th className="py-1.5 pr-2 text-right tabular">H (mm)</th>
          <th className="py-1.5 pr-2 text-right tabular">Drempel (mm)</th>
          <th className="py-1.5 text-right tabular">Offset (mm)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ nr, op }) => (
          <tr key={op.id} className="border-b border-line/50">
            <td className="py-1 pr-2 font-mono font-semibold text-ink-900">{nr}</td>
            <td className="py-1 pr-2 text-ink-700">{label(op.type)}</td>
            <td className="py-1 pr-2 text-right tabular text-ink-900">{Math.round(op.width * 1000)}</td>
            <td className="py-1 pr-2 text-right tabular text-ink-900">{Math.round(op.height * 1000)}</td>
            <td className="py-1 pr-2 text-right tabular text-ink-500">
              {op.sillHeight > 0 ? Math.round(op.sillHeight * 1000) : "—"}
            </td>
            <td className="py-1 text-right tabular text-ink-500">{Math.round(op.offset * 1000)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-ink-900">
          <td colSpan={6} className="pt-1.5 text-right text-[10px] text-ink-400">
            {rows.filter((r) => r.op.type === "door").length} deur(en) ·{" "}
            {rows.filter((r) => r.op.type === "window").length} raam/ramen ·{" "}
            {rows.filter((r) => r.op.type === "passage").length} doorgang(en)
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
