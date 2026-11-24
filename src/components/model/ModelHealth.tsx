"use client";

// Compacte "modelgezondheid" voor het dashboard: botsingen + warmteverlies.

import Link from "next/link";
import { useDeferredValue, useMemo } from "react";
import { ScanSearch, Flame, ArrowRight } from "lucide-react";
import { useProjectModel } from "@/lib/hooks";
import { collectIssues } from "./Controle";
import { computeHeatLoss } from "@/lib/thermal";

export function ModelHealth() {
  const model = useDeferredValue(useProjectModel());
  const stats = useMemo(() => {
    if (!model) return null;
    const issues = collectIssues(model);
    const heat = computeHeatLoss(model);
    const walls = model.levels.reduce((s, l) => s + l.walls.length, 0);
    return {
      walls,
      errors: issues.filter((i) => i.severity === "error").length,
      warns: issues.filter((i) => i.severity === "warn").length,
      heat,
    };
  }, [model]);

  if (!stats || stats.walls === 0) return null;
  const clean = stats.errors + stats.warns === 0;

  return (
    <Link
      href="/model"
      className="group flex items-center gap-4 rounded-xl border border-line bg-paper-raised px-5 py-4 transition-all hover:border-line-strong hover:shadow-sm"
    >
      <div className="grid flex-1 grid-cols-2 gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-400">
            <ScanSearch size={12} /> Modelcontrole
          </div>
          <div className={`mt-0.5 text-base font-semibold ${stats.errors ? "text-danger" : clean ? "text-ok" : "text-warn"}`}>
            {clean ? "Geen botsingen" : `${stats.errors} fout${stats.errors === 1 ? "" : "en"} · ${stats.warns} let op`}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-400">
            <Flame size={12} /> Warmteverlies
          </div>
          <div className="mt-0.5 text-base font-semibold text-ink-900">
            {stats.heat.floorArea > 0 ? (
              <>
                {(stats.heat.total / 1000).toFixed(1).replace(".", ",")} kW{" "}
                <span className="text-xs font-normal text-ink-500">({Math.round(stats.heat.wPerM2)} W/m²)</span>
              </>
            ) : (
              <span className="text-sm font-normal text-ink-500">teken ruimtes</span>
            )}
          </div>
        </div>
      </div>
      <ArrowRight size={18} className="shrink-0 text-ink-400 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
