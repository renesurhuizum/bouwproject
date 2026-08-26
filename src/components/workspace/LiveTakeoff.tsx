"use client";

// Live hoeveelheden + kostenraming. Loopt mee terwijl je tekent: dit is de
// directe terugkoppeling die een configurator zo bruikbaar maakt — je ziet
// meteen wat een keuze aan oppervlak en geld betekent.

import { Info } from "lucide-react";
import { useTakeoff } from "@/lib/hooks";
import { CATEGORY_LABEL } from "@/lib/pricing";
import { formatEuro } from "@/lib/format";
import type { QuantityItem } from "@/lib/quantityTakeoff";

const CATEGORY_ORDER: QuantityItem["category"][] = ["walls", "floors", "openings", "finishes"];

export function LiveTakeoff() {
  const { level, items, estimate } = useTakeoff();

  if (!level) {
    return (
      <p className="px-3 py-8 text-center text-xs text-ink-500">
        Nog geen verdieping. Maak eerst een plattegrond.
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-xs text-ink-500">
        Teken muren en ruimtes — hoeveelheden en kosten verschijnen hier vanzelf.
      </p>
    );
  }

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    lines: estimate.lines.filter((l) => l.item.category === cat),
  })).filter((g) => g.lines.length > 0);

  return (
    <div className="flex min-h-0 flex-col">
      {/* Totaal bovenaan: het getal waar je tijdens het tekenen op stuurt. */}
      <div className="shrink-0 border-b border-line bg-paper-sunken px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="label-micro">Raming {level.name}</span>
          <span className="tabular text-xl font-black leading-none text-ink-900">
            {formatEuro(estimate.total)}
          </span>
        </div>
        <p className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-ink-500">
          <Info size={11} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            Indicatieve kentallen incl. arbeid — een richtbedrag, geen offerte.
            {estimate.unpriced > 0 && ` ${estimate.unpriced} post(en) zonder kental.`}
          </span>
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {grouped.map((g) => (
          <section key={g.cat} className="border-b border-line last:border-b-0">
            <h3 className="label-micro sticky top-0 bg-paper-raised/95 px-3 py-1.5 backdrop-blur">
              {CATEGORY_LABEL[g.cat]}
            </h3>
            <ul>
              {g.lines.map((line, idx) => (
                <li
                  key={`${line.item.name}-${idx}`}
                  className="flex items-baseline gap-2 px-3 py-1.5 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate text-ink-700" title={line.item.name}>
                    {line.item.name}
                  </span>
                  <span className="tabular shrink-0 text-ink-900">
                    {line.item.quantity}
                    <span className="ml-0.5 text-ink-400">{line.item.unit}</span>
                  </span>
                  <span className="tabular w-16 shrink-0 text-right font-semibold text-ink-600">
                    {line.informative ? (
                      <span className="text-ink-300" title="Meetstaat — zit al in andere posten">
                        —
                      </span>
                    ) : line.total != null ? (
                      formatEuro(line.total)
                    ) : (
                      <span className="text-ink-300" title="Geen kental bekend">
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
