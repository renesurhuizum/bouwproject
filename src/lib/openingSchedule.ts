// Kozijnstaat: nummert alle deuren en ramen (D01, R01, P01…) en levert de
// rijen voor de tabel plus een id→code map voor de referentielabels in het plan.

import type { Opening, OpeningType } from "./domain/types";

export interface ScheduleRow {
  id: string;
  code: string;
  type: OpeningType;
  width: number; // m
  height: number; // m
  sillHeight: number; // m
  wallId: string;
}

const PREFIX: Record<OpeningType, string> = {
  door: "D",
  window: "R",
  passage: "P",
};

export function buildOpeningSchedule(openings: Opening[]): {
  rows: ScheduleRow[];
  codeById: Map<string, string>;
} {
  const counts: Record<OpeningType, number> = { door: 0, window: 0, passage: 0 };
  const codeById = new Map<string, string>();
  // Stabiele nummering: per type op offset gesorteerd.
  const sorted = [...openings].sort(
    (a, b) => a.type.localeCompare(b.type) || a.offset - b.offset,
  );
  const rows: ScheduleRow[] = [];
  for (const op of sorted) {
    counts[op.type] += 1;
    const code = `${PREFIX[op.type]}${String(counts[op.type]).padStart(2, "0")}`;
    codeById.set(op.id, code);
    rows.push({
      id: op.id,
      code,
      type: op.type,
      width: op.width,
      height: op.height,
      sillHeight: op.sillHeight,
      wallId: op.wallId,
    });
  }
  rows.sort((a, b) => a.code.localeCompare(b.code));
  return { rows, codeById };
}
