"use client";

// BIM-eigenschappen in het selectiepaneel: bouwfysica (Rc/U), gevel ja/nee
// en de fase waarin het element wordt uitgevoerd. Lege velden = automatisch
// (default per materiaal/status), zodat niets verplicht is.

import { useState } from "react";
import type { Opening, Roof, Wall } from "@/lib/domain/types";
import { mUpdate as update } from "@/lib/db/mutate";
import { useProject, usePhases, useRooms, useWalls } from "@/lib/hooks";
import {
  isExternalWall,
  openingU,
  wallRc,
  roofRc,
  uFromRc,
  OPENING_U_PRESETS,
  RC_PRESETS,
  REQUIREMENT_ISDE,
  REQUIREMENT_NEW,
} from "@/lib/thermal";

function OptionalNumber({
  value,
  placeholder,
  unit,
  step = 0.1,
  onChange,
}: {
  value: number | undefined;
  placeholder: string;
  unit: string;
  step?: number;
  onChange: (v: number | undefined) => void;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  // Externe wijziging (preset-knop, undo) → invoer bijwerken tijdens render.
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(value == null ? "" : String(value));
  }
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={0}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const t = text.trim().replace(",", ".");
          onChange(t === "" || Number.isNaN(Number(t)) ? undefined : Math.max(0, Number(t)));
        }}
        className="tabular w-16 rounded-md border border-line bg-paper px-2 py-1 text-right text-xs text-ink-900 placeholder:text-ink-300"
      />
      <span className="w-12 text-[11px] text-ink-500">{unit}</span>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-ink-500">{label}</span>
      {children}
    </div>
  );
}

function Presets({ items, onPick }: { items: { label: string; value: number }[]; onPick: (v: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((p) => (
        <button key={p.label} onClick={() => onPick(p.value)} className="rounded bg-paper-sunken px-1.5 py-0.5 text-[10px] text-ink-700">
          {p.label} <span className="tabular text-ink-500">{p.value}</span>
        </button>
      ))}
    </div>
  );
}

function PhaseSelect({ value, onChange }: { value?: string; onChange: (v: string | undefined) => void }) {
  const project = useProject();
  const phases = usePhases(project?.id) ?? [];
  if (phases.length === 0) return null;
  return (
    <Row label="Fase">
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="max-w-[10rem] rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink-900"
      >
        <option value="">—</option>
        {phases.map((p) => (
          <option key={p.id} value={p.id}>
            {p.order}. {p.name}
          </option>
        ))}
      </select>
    </Row>
  );
}

const Section = ({ children }: { children: React.ReactNode }) => (
  <div className="space-y-2 border-t border-line/60 pt-2.5">
    <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Bouwfysica &amp; planning</div>
    {children}
  </div>
);

export function WallBimFields({ wall }: { wall: Wall }) {
  const walls = useWalls(wall.levelId) ?? [];
  const rooms = useRooms(wall.levelId) ?? [];
  const autoExternal = isExternalWall({ ...wall, isExternal: undefined }, rooms, walls);
  const external = wall.isExternal ?? autoExternal;
  const rc = wallRc(wall);

  return (
    <Section>
      <Row label="Gevel (buitenmuur)">
        <div className="flex gap-1">
          {([undefined, true, false] as const).map((v) => (
            <button
              key={String(v)}
              onClick={() => update("walls", wall.id, { isExternal: v })}
              className={`rounded-md px-2 py-1 text-[11px] font-medium ${wall.isExternal === v ? "bg-ink-900 text-paper-raised" : "bg-paper-sunken text-ink-700"}`}
            >
              {v === undefined ? `Auto (${autoExternal ? "ja" : "nee"})` : v ? "Ja" : "Nee"}
            </button>
          ))}
        </div>
      </Row>
      {external && (
        <>
          <Row label="Rc-waarde">
            <OptionalNumber value={wall.insulationRc} placeholder={rc.toFixed(2)} unit="m²K/W" onChange={(v) => update("walls", wall.id, { insulationRc: v })} />
          </Row>
          <Presets items={RC_PRESETS.filter((p) => p.label !== "Nieuwbouw dak")} onPick={(v) => update("walls", wall.id, { insulationRc: v })} />
          <p className={`text-[10px] ${rc >= REQUIREMENT_ISDE.wall ? "text-ok" : "text-ink-500"}`}>
            U = {uFromRc(rc).toFixed(2)} W/m²K{wall.insulationRc == null ? " (aangenomen)" : ""} · ISDE ≥ {REQUIREMENT_ISDE.wall} · nieuwbouw ≥ {REQUIREMENT_NEW.wall}
          </p>
        </>
      )}
      <PhaseSelect value={wall.phaseId} onChange={(v) => update("walls", wall.id, { phaseId: v })} />
    </Section>
  );
}

export function OpeningBimFields({ opening, wall }: { opening: Opening; wall?: Wall }) {
  if (opening.type === "passage") return null;
  const u = openingU(opening, wall);
  return (
    <Section>
      <Row label="U-waarde kozijn+glas">
        <OptionalNumber value={opening.uValue} placeholder={u.toFixed(1)} unit="W/m²K" onChange={(v) => update("openings", opening.id, { uValue: v })} />
      </Row>
      <Presets items={OPENING_U_PRESETS} onPick={(v) => update("openings", opening.id, { uValue: v })} />
      <p className={`text-[10px] ${u <= REQUIREMENT_ISDE.windowU_HRpp ? "text-ok" : "text-ink-500"}`}>
        ISDE: HR++ ≤ {REQUIREMENT_ISDE.windowU_HRpp}, triple ≤ {REQUIREMENT_ISDE.windowU_triple} · nieuwbouw ≤ {REQUIREMENT_NEW.windowU}
      </p>
    </Section>
  );
}

export function RoofBimFields({ roof }: { roof: Roof }) {
  const rc = roofRc(roof);
  return (
    <Section>
      <Row label="Rc dak">
        <OptionalNumber value={roof.insulationRc} placeholder={rc.toFixed(2)} unit="m²K/W" onChange={(v) => update("roofs", roof.id, { insulationRc: v })} />
      </Row>
      <Presets items={[{ label: "Ongeïsoleerd", value: 0.4 }, { label: "ISDE", value: REQUIREMENT_ISDE.roof }, { label: "Nieuwbouw", value: REQUIREMENT_NEW.roof }]} onPick={(v) => update("roofs", roof.id, { insulationRc: v })} />
    </Section>
  );
}
