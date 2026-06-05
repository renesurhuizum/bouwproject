"use client";

// Eigenschappen-paneel (onder, boven de tool-dock) voor de huidige selectie.

import { useLiveQuery } from "dexie-react-hooks";
import { Trash2, X } from "lucide-react";
import { getDB } from "@/lib/db/db";
import { update, remove } from "@/lib/db/repo";
import { useEditor } from "@/lib/store/editor";
import { dist } from "@/lib/geometry";
import { formatLength } from "@/lib/format";
import {
  WALL_MATERIAL_LABEL,
  WALL_STATUS_LABEL,
  WALL_STATUS_COLOR,
  ELECTRICAL_LABEL,
  ELECTRICAL_HEIGHT_PRESETS,
  OPENING_LABEL,
  OPENING_COLOR,
} from "@/lib/domain/constants";
import type { WallMaterial, WallStatus, OpeningType } from "@/lib/domain/types";

const STATUSES: WallStatus[] = ["new", "existing", "demolish"];
const MATERIALS = Object.keys(WALL_MATERIAL_LABEL) as WallMaterial[];
const OPENING_TYPES: OpeningType[] = ["door", "window", "passage"];

export function SelectionPanel() {
  const selection = useEditor((s) => s.selection);
  const select = useEditor((s) => s.select);

  const wall = useLiveQuery(
    async () => (selection?.kind === "wall" ? await getDB().walls.get(selection.id) : null),
    [selection?.kind, selection?.id],
  );
  const elec = useLiveQuery(
    async () =>
      selection?.kind === "electrical" ? await getDB().electrical.get(selection.id) : null,
    [selection?.kind, selection?.id],
  );
  const opening = useLiveQuery(
    async () =>
      selection?.kind === "opening" ? await getDB().openings.get(selection.id) : null,
    [selection?.kind, selection?.id],
  );

  if (!selection) return null;

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-[76px] z-10 px-3">
      <div className="mx-auto max-w-md rounded-xl border border-line bg-paper-raised/97 p-3 shadow-xl backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-900">
            {selection.kind === "wall"
              ? "Muur"
              : selection.kind === "opening"
                ? "Deur / raam"
                : "Elektra"}
          </h2>
          <button
            onClick={() => select(null)}
            className="rounded-lg p-1 text-ink-500 hover:bg-paper-sunken"
            aria-label="Sluiten"
          >
            <X size={16} />
          </button>
        </div>

        {wall && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs text-ink-500">
              <span>Lengte</span>
              <span className="tabular text-ink-900">
                {formatLength(dist(wall.start, wall.end))}
              </span>
            </div>

            <Row label="Status">
              <div className="flex gap-1">
                {STATUSES.map((st) => (
                  <button
                    key={st}
                    onClick={() => update("walls", wall.id, { status: st })}
                    className="rounded-md px-2 py-1 text-[11px] font-medium"
                    style={{
                      background: wall.status === st ? WALL_STATUS_COLOR[st] : "#ece8df",
                      color: wall.status === st ? "#fff" : "#44403c",
                    }}
                  >
                    {WALL_STATUS_LABEL[st]}
                  </button>
                ))}
              </div>
            </Row>

            <Row label="Materiaal">
              <select
                value={wall.material}
                onChange={(e) =>
                  update("walls", wall.id, { material: e.target.value as WallMaterial })
                }
                className="rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink-900"
              >
                {MATERIALS.map((m) => (
                  <option key={m} value={m}>
                    {WALL_MATERIAL_LABEL[m]}
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Dikte">
              <NumberField
                value={Math.round(wall.thickness * 100)}
                unit="cm"
                onChange={(v) => update("walls", wall.id, { thickness: v / 100 })}
              />
            </Row>

            <Row label="Hoogte">
              <NumberField
                value={Math.round(wall.height * 100)}
                unit="cm"
                onChange={(v) => update("walls", wall.id, { height: v / 100 })}
              />
            </Row>

            <Row label="Dragend">
              <button
                onClick={() => update("walls", wall.id, { loadBearing: !wall.loadBearing })}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                  wall.loadBearing ? "bg-danger text-white" : "bg-paper-sunken text-ink-700"
                }`}
              >
                {wall.loadBearing ? "Ja" : "Nee"}
              </button>
            </Row>

            <DeleteButton onClick={() => removeAnd("walls", wall.id, () => select(null))} />
          </div>
        )}

        {elec && (
          <div className="space-y-2.5">
            <Row label="Type">
              <span className="text-xs font-medium text-ink-900">
                {ELECTRICAL_LABEL[elec.type]}
              </span>
            </Row>
            <Row label="Hoogte">
              <NumberField
                value={Math.round(elec.heightZ * 100)}
                unit="cm"
                onChange={(v) => update("electrical", elec.id, { heightZ: v / 100 })}
              />
            </Row>
            <div className="flex flex-wrap gap-1">
              {ELECTRICAL_HEIGHT_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => update("electrical", elec.id, { heightZ: p.value })}
                  className="rounded-md bg-paper-sunken px-2 py-1 text-[10px] text-ink-700"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <Row label="Groep">
              <input
                type="text"
                defaultValue={elec.group ?? ""}
                placeholder="bv. 3"
                onBlur={(e) => update("electrical", elec.id, { group: e.target.value })}
                className="w-20 rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink-900"
              />
            </Row>
            <DeleteButton onClick={() => removeAnd("electrical", elec.id, () => select(null))} />
          </div>
        )}

        {opening && (
          <div className="space-y-2.5">
            <Row label="Type">
              <div className="flex gap-1">
                {OPENING_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => update("openings", opening.id, { type: t })}
                    className="rounded-md px-2 py-1 text-[11px] font-medium"
                    style={{
                      background: opening.type === t ? OPENING_COLOR[t] : "#ece8df",
                      color: opening.type === t ? "#fff" : "#44403c",
                    }}
                  >
                    {OPENING_LABEL[t]}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Breedte">
              <NumberField
                value={Math.round(opening.width * 100)}
                unit="cm"
                onChange={(v) => update("openings", opening.id, { width: v / 100 })}
              />
            </Row>
            <Row label="Hoogte">
              <NumberField
                value={Math.round(opening.height * 100)}
                unit="cm"
                onChange={(v) => update("openings", opening.id, { height: v / 100 })}
              />
            </Row>
            <Row label="Borsthoogte">
              <NumberField
                value={Math.round(opening.sillHeight * 100)}
                unit="cm"
                onChange={(v) => update("openings", opening.id, { sillHeight: v / 100 })}
              />
            </Row>
            <DeleteButton onClick={() => removeAnd("openings", opening.id, () => select(null))} />
          </div>
        )}
      </div>
    </div>
  );
}

async function removeAnd(
  table: "walls" | "electrical" | "openings",
  id: string,
  after: () => void,
) {
  await remove(table, id);
  after();
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-ink-500">{label}</span>
      {children}
    </div>
  );
}

function NumberField({
  value,
  unit,
  onChange,
}: {
  value: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="tabular w-20 rounded-md border border-line bg-paper px-2 py-1 text-right text-xs text-ink-900"
      />
      <span className="text-[11px] text-ink-500">{unit}</span>
    </div>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-danger/10 py-2 text-xs font-medium text-danger"
    >
      <Trash2 size={14} /> Verwijderen
    </button>
  );
}
