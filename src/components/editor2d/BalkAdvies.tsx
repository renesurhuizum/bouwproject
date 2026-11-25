"use client";

// Indicatief balk- en lateiadvies bij een geselecteerde balk of een opening in
// een dragende muur.
//
// De app kende alleen een vinkje "dragend" en een tekst "laat een constructeur
// rekenen". Dat helpt niet bij het bepalen wat je moet bestellen. Hier komt er
// een onderbouwd voorstel uit — mét de aannames erbij, en met een disclaimer
// die niet weg te klikken is.

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { estimateLineLoad, SUPPORTED_LOAD_LABEL, type SupportedLoad } from "@/lib/structural/loads";
import { suggestProfiles, checkProfile, STRUCTURAL_DISCLAIMER } from "@/lib/structural/sizing";
import { findSection, type SectionMaterial } from "@/lib/structural/sections";
import type { WallMaterial } from "@/lib/domain/types";

const SUPPORT_OPTIONS: SupportedLoad[] = [
  "wall-only",
  "floor",
  "floor-and-wall",
  "roof",
  "roof-and-wall",
];

interface Props {
  /** Vrije overspanning in m. */
  spanM: number;
  wallMaterial?: WallMaterial;
  wallThicknessM?: number;
  wallHeightM?: number;
  /** Al gekozen profiel, om te controleren i.p.v. voor te stellen. */
  currentProfileKey?: string;
  /** Aanroeper slaat de keuze op. */
  onPick?: (profileKey: string) => void;
}

export function BalkAdvies({
  spanM,
  wallMaterial = "brick",
  wallThicknessM = 0.1,
  wallHeightM = 2.6,
  currentProfileKey,
  onPick,
}: Props) {
  const [supports, setSupports] = useState<SupportedLoad>("floor-and-wall");
  const [tributaryWidthM, setTributaryWidthM] = useState(2.5);
  const [material, setMaterial] = useState<SectionMaterial>("steel");

  const load = estimateLineLoad({
    supports,
    tributaryWidthM,
    wallHeightM,
    wallThicknessM,
    wallMaterial,
  });

  const result = suggestProfiles({
    spanM,
    designKnM: load.designKnM,
    serviceKnM: load.serviceKnM,
    material,
  });

  const current = currentProfileKey ? findSection(currentProfileKey) : undefined;
  const currentCheck = current
    ? checkProfile(current, {
        spanM,
        designKnM: load.designKnM,
        serviceKnM: load.serviceKnM,
      })
    : null;

  return (
    <div className="space-y-3 rounded-lg border border-line bg-paper-sunken p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
        Indicatief profieladvies
      </p>

      <label className="block space-y-1">
        <span className="text-[11px] text-ink-500">Wat draagt deze balk?</span>
        <select
          value={supports}
          onChange={(e) => setSupports(e.target.value as SupportedLoad)}
          className="w-full rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink-900"
        >
          {SUPPORT_OPTIONS.map((s) => (
            <option key={s} value={s}>{SUPPORTED_LOAD_LABEL[s]}</option>
          ))}
        </select>
      </label>

      {supports !== "wall-only" && (
        <label className="block space-y-1">
          <span className="text-[11px] text-ink-500">
            Belastingbreedte (halve overspanning aan weerszijden)
          </span>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              step={0.1}
              value={tributaryWidthM}
              onChange={(e) => setTributaryWidthM(Math.max(0, Number(e.target.value)))}
              className="tabular w-20 rounded-md border border-line bg-paper px-2 py-1 text-right text-xs text-ink-900"
            />
            <span className="text-[11px] text-ink-500">m</span>
          </div>
        </label>
      )}

      <div className="flex gap-1">
        {(["steel", "timber"] as SectionMaterial[]).map((m) => (
          <button
            key={m}
            onClick={() => setMaterial(m)}
            className={`flex-1 rounded-md py-1 text-[11px] font-medium ${
              material === m ? "bg-ink-900 text-paper-raised" : "bg-paper text-ink-600"
            }`}
          >
            {m === "steel" ? "Staal" : "Hout"}
          </button>
        ))}
      </div>

      <div className="space-y-0.5 rounded-md bg-paper px-2 py-1.5">
        {load.breakdown.map((b) => (
          <div key={b.label} className="flex justify-between text-[11px]">
            <span className="text-ink-500">{b.label}</span>
            <span className="tabular text-ink-700">{b.knM.toFixed(2)} kN/m</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-line pt-0.5 text-[11px] font-semibold">
          <span className="text-ink-700">Rekenbelasting</span>
          <span className="tabular text-ink-900">{load.designKnM.toFixed(2)} kN/m</span>
        </div>
        <div className="flex justify-between text-[11px] text-ink-500">
          <span>Overspanning {spanM.toFixed(2)} m · moment</span>
          <span className="tabular">{result.designMomentKnm.toFixed(1)} kNm</span>
        </div>
      </div>

      {currentCheck && (
        <div
          className={`rounded-md px-2 py-1.5 text-[11px] ${
            currentCheck.adequate ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"
          }`}
        >
          {current!.label} —{" "}
          {currentCheck.adequate
            ? `voldoet indicatief (benutting ${Math.round(Math.max(currentCheck.strengthUtilisation, currentCheck.deflectionUtilisation) * 100)}%, doorbuiging ${currentCheck.deflectionMm.toFixed(1)} mm)`
            : `voldoet níet bij deze aannames (nodig: ${result.requiredWyCm3.toFixed(0)} cm³ Wy)`}
        </div>
      )}

      {result.suggestions.length === 0 ? (
        <p className="rounded-md bg-danger/10 px-2 py-1.5 text-[11px] text-danger">
          Geen profiel uit de tabel haalt deze overspanning bij deze belasting.
          Dit vraagt echt om een constructeur (samengestelde ligger, kolom
          tussenin, of een ander constructieprincipe).
        </p>
      ) : (
        <div className="space-y-1">
          <p className="text-[11px] text-ink-500">
            Lichtste passende profielen (maatgevend + doorbuiging):
          </p>
          {result.suggestions.slice(0, 3).map((s) => (
            <button
              key={s.profile.key}
              onClick={() => onPick?.(s.profile.key)}
              disabled={!onPick}
              className="flex w-full items-center justify-between rounded-md bg-paper px-2 py-1.5 text-left hover:bg-paper-raised disabled:cursor-default"
            >
              <span className="text-xs font-medium text-ink-900">{s.profile.label}</span>
              <span className="tabular text-[10px] text-ink-500">
                {Math.round(Math.max(s.strengthUtilisation, s.deflectionUtilisation) * 100)}% ·{" "}
                {s.deflectionMm.toFixed(1)} mm · {s.governing}
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] leading-snug text-amber-800">
        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
        <span>{STRUCTURAL_DISCLAIMER}</span>
      </p>
    </div>
  );
}
