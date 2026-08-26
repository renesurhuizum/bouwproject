"use client";

// Live inkoopstaat + kosten. Loopt mee terwijl je tekent: dit is de directe
// terugkoppeling die een configurator zo bruikbaar maakt — je ziet meteen wat
// een keuze aan materiaal en geld betekent.
//
// Draait op dezelfde engine als het kostenscherm (lib/takeoff), dus de
// bedragen hier en in /kosten kunnen niet uiteenlopen.

import { useMemo } from "react";
import { Info } from "lucide-react";
import { useTakeoff } from "@/lib/hooks";
import { formatEuro } from "@/lib/format";
import type { TakeoffLine } from "@/lib/takeoff/engine";

export function LiveTakeoff() {
  const { level, lines, total, unpriced } = useTakeoff();

  const grouped = useMemo(() => {
    const byCategory = new Map<string, TakeoffLine[]>();
    for (const line of lines) {
      const list = byCategory.get(line.category);
      if (list) list.push(line);
      else byCategory.set(line.category, [line]);
    }
    return [...byCategory.entries()];
  }, [lines]);

  if (!level) {
    return (
      <p className="px-3 py-8 text-center text-xs text-ink-500">
        Nog geen verdieping. Maak eerst een plattegrond.
      </p>
    );
  }

  if (lines.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-xs text-ink-500">
        Teken muren en ruimtes — materiaal en kosten verschijnen hier vanzelf.
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      {/* Totaal bovenaan: het getal waar je tijdens het tekenen op stuurt. */}
      <div className="shrink-0 border-b border-line bg-paper-sunken px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="label-micro">Raming {level.name}</span>
          <span className="tabular text-xl font-black leading-none text-ink-900">
            {formatEuro(total)}
          </span>
        </div>
        <p className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-ink-500">
          <Info size={11} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Indicatieve richtprijzen incl. snijverlies en hele verpakkingen — een richtbedrag,
            geen offerte.
            {unpriced > 0 && ` ${unpriced} post(en) zonder prijs.`}
          </span>
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {grouped.map(([category, list]) => (
          <section key={category} className="border-b border-line last:border-b-0">
            <h3 className="label-micro sticky top-0 bg-paper-raised/95 px-3 py-1.5 backdrop-blur">
              {category}
            </h3>
            <ul>
              {list.map((line) => (
                <li
                  key={line.sourceId}
                  className="flex items-baseline gap-2 px-3 py-1.5 text-xs"
                  title={line.detail}
                >
                  <span className="min-w-0 flex-1 truncate text-ink-700">{line.name}</span>
                  <span className="tabular shrink-0 text-ink-900">
                    {line.buyQty}
                    <span className="ml-0.5 text-ink-400">
                      {line.packs != null ? (line.packName ?? "pak") : line.unit}
                    </span>
                  </span>
                  <span className="tabular w-16 shrink-0 text-right font-semibold text-ink-600">
                    {line.totalPrice != null ? (
                      formatEuro(line.totalPrice)
                    ) : (
                      <span className="text-ink-300" title="Geen richtprijs bekend">
                        n.v.t.
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
