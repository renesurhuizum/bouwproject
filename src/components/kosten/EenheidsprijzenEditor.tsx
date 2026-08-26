"use client";

// Eigen eenheidsprijzen voor de kostenraming. De kentallen uit lib/pricing zijn
// landelijke richtbedragen; wie offertes van zijn eigen aannemer heeft, vult ze
// hier in. Leeg laten = het kental gebruiken.

import { useProject } from "@/lib/hooks";
import { update } from "@/lib/db/repo";
import { DEFAULT_UNIT_PRICES } from "@/lib/pricing";
import { formatEuro } from "@/lib/format";

const ENTRIES = Object.entries(DEFAULT_UNIT_PRICES).sort(([a], [b]) => a.localeCompare(b, "nl"));

export function EenheidsprijzenEditor() {
  const project = useProject();
  const overrides = project?.unitPrices ?? {};

  async function setPrice(name: string, value: string) {
    if (!project) return;
    const next = { ...overrides };
    const parsed = parseFloat(value);
    if (value.trim() === "" || !Number.isFinite(parsed) || parsed < 0) {
      delete next[name];
    } else {
      next[name] = parsed;
    }
    await update("projects", project.id, { unitPrices: next });
  }

  const changed = Object.keys(overrides).length;

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-ink-500">
        Richtbedragen incl. arbeid. Vul een eigen prijs in om ervan af te wijken — leeg laten
        gebruikt het kental.
        {changed > 0 && ` ${changed} eigen prijs${changed === 1 ? "" : "en"} ingesteld.`}
      </p>

      <ul className="divide-y divide-line">
        {ENTRIES.map(([name, fallback]) => (
          <li key={name} className="flex items-center gap-3 py-1.5">
            <label htmlFor={`prijs-${name}`} className="min-w-0 flex-1 truncate text-xs text-ink-700">
              {name}
            </label>
            <div className="flex h-[var(--control-h-sm)] shrink-0 items-center gap-1 rounded-control border border-line bg-paper px-2 focus-within:border-blueprint">
              <span className="text-[11px] text-ink-400">€</span>
              <input
                id={`prijs-${name}`}
                type="number"
                inputMode="decimal"
                min={0}
                step={1}
                value={overrides[name] ?? ""}
                placeholder={String(fallback)}
                onChange={(e) => void setPrice(name, e.target.value)}
                className="tabular w-16 bg-transparent text-right text-xs font-semibold text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-300"
              />
            </div>
            <span className="w-14 shrink-0 text-right text-[11px] text-ink-400">
              kental {formatEuro(fallback)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
