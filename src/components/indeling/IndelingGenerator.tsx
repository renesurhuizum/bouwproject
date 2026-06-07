"use client";

// Indeling-generator: afmetingen + wensen → meerdere voorstellen → toepassen
// op de actieve verdieping (muren + ruimtes).

import { useState } from "react";
import { Sparkles, X, Check } from "lucide-react";
import { getDB } from "@/lib/db/db";
import { create, remove } from "@/lib/db/repo";
import { useEditor } from "@/lib/store/editor";
import type { Wall, Room } from "@/lib/domain/types";
import {
  generateLayouts,
  outerWalls,
  rectPolygon,
  type DoorSide,
  type Layout,
} from "@/lib/layoutGenerator";
import { polygonArea } from "@/lib/geometry";
import { formatArea } from "@/lib/format";

const DOOR_SIDES: { key: DoorSide; label: string }[] = [
  { key: "voor", label: "Voor" },
  { key: "achter", label: "Achter" },
  { key: "links", label: "Links" },
  { key: "rechts", label: "Rechts" },
];

export function IndelingGenerator({ onClose }: { onClose: () => void }) {
  const activeLevelId = useEditor((s) => s.activeLevelId);

  const [width, setWidth] = useState("10");
  const [depth, setDepth] = useState("8");
  const [doorSide, setDoorSide] = useState<DoorSide>("voor");
  const [bedrooms, setBedrooms] = useState(2);
  const [wishes, setWishes] = useState("");
  const [layouts, setLayouts] = useState<Layout[]>([]);
  const [applying, setApplying] = useState(false);

  function generate() {
    const w = parseFloat(width.replace(",", "."));
    const d = parseFloat(depth.replace(",", "."));
    if (isNaN(w) || isNaN(d) || w < 3 || d < 3) return;
    setLayouts(generateLayouts({ width: w, depth: d, doorSide, bedrooms, wishes }));
  }

  async function apply(layout: Layout) {
    if (!activeLevelId || applying) return;
    setApplying(true);
    const db = getDB();
    // Bestaande structuur op deze verdieping wissen.
    const oldWalls = (await db.walls.where("levelId").equals(activeLevelId).toArray()).filter(
      (w) => !w.deleted,
    );
    const wallIds = new Set(oldWalls.map((w) => w.id));
    for (const w of oldWalls) await remove("walls", w.id);
    const oldRooms = (await db.rooms.where("levelId").equals(activeLevelId).toArray()).filter(
      (r) => !r.deleted,
    );
    for (const r of oldRooms) await remove("rooms", r.id);
    const allOpenings = (await db.openings.toArray()).filter((o) => !o.deleted);
    for (const o of allOpenings) if (wallIds.has(o.wallId)) await remove("openings", o.id);

    // Buitenmuren (dragend) + interne wanden.
    for (const seg of outerWalls(layout.outer)) {
      await create<Wall>("walls", {
        levelId: activeLevelId,
        start: seg.a,
        end: seg.b,
        thickness: 0.3,
        height: 2.6,
        material: "brick",
        loadBearing: true,
        status: "new",
      });
    }
    for (const seg of layout.cuts) {
      await create<Wall>("walls", {
        levelId: activeLevelId,
        start: seg.a,
        end: seg.b,
        thickness: 0.1,
        height: 2.6,
        material: "gypsum",
        loadBearing: false,
        status: "new",
      });
    }
    for (const r of layout.rooms) {
      await create<Room>("rooms", {
        levelId: activeLevelId,
        name: r.name,
        func: r.func,
        polygon: rectPolygon(r.rect),
      });
    }
    setApplying(false);
    onClose();
  }

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-paper/95 backdrop-blur">
      <div className="mx-auto max-w-2xl space-y-4 p-4 pb-10">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900">
            <Sparkles size={20} className="text-accent" /> Indeling genereren
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-500 hover:bg-paper-sunken"
            aria-label="Sluiten"
          >
            <X size={18} />
          </button>
        </div>

        {/* Formulier */}
        <section className="space-y-3 rounded-card border border-line bg-paper-raised p-4">
          <div className="flex gap-3">
            <Field label="Breedte (m)">
              <input
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                inputMode="decimal"
                className="tabular w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-900"
              />
            </Field>
            <Field label="Diepte (m)">
              <input
                value={depth}
                onChange={(e) => setDepth(e.target.value)}
                inputMode="decimal"
                className="tabular w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-900"
              />
            </Field>
          </div>

          <div>
            <span className="mb-1 block text-xs text-ink-500">Voordeur aan de zijde</span>
            <div className="flex gap-1.5">
              {DOOR_SIDES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setDoorSide(s.key)}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${
                    doorSide === s.key ? "bg-ink-900 text-paper-raised" : "bg-paper-sunken text-ink-700"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-xs text-ink-500">Aantal slaapkamers</span>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setBedrooms(n)}
                  className={`flex-1 rounded-lg py-1.5 text-sm font-medium ${
                    bedrooms === n ? "bg-ink-900 text-paper-raised" : "bg-paper-sunken text-ink-700"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <Field label="Wensen (vrije tekst)">
            <textarea
              value={wishes}
              onChange={(e) => setWishes(e.target.value)}
              rows={2}
              placeholder="bv. 3 slaapkamers, een kantoor en een bijkeuken, open keuken aan de achterkant"
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300"
            />
          </Field>

          <button
            onClick={generate}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-semibold text-white"
          >
            <Sparkles size={16} /> Genereer voorstellen
          </button>
        </section>

        {/* Varianten */}
        {layouts.length > 0 && (
          <section className="space-y-3">
            <h3 className="px-1 text-sm font-semibold text-ink-700">
              {layouts.length} voorstellen — tik op Toepassen
            </h3>
            {layouts.map((layout, i) => (
              <div key={i} className="rounded-card border border-line bg-paper-raised p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-ink-500">Voorstel {i + 1}</span>
                  <button
                    onClick={() => apply(layout)}
                    disabled={applying}
                    className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <Check size={14} /> Toepassen
                  </button>
                </div>
                <LayoutPreview layout={layout} doorSide={doorSide} />
              </div>
            ))}
            <p className="px-1 text-[11px] text-ink-400">
              Let op: toepassen vervangt de muren en ruimtes op de huidige verdieping. Daarna kun je
              alles vrij aanpassen in de plattegrond.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block flex-1">
      <span className="mb-1 block text-xs text-ink-500">{label}</span>
      {children}
    </label>
  );
}

function LayoutPreview({ layout, doorSide }: { layout: Layout; doorSide: DoorSide }) {
  const PAD = 8;
  const maxW = 320;
  const scale = maxW / layout.outer.w;
  const W = layout.outer.w * scale;
  const H = layout.outer.h * scale;
  const palette = [
    "#fde9d9",
    "#e8effc",
    "#e0f2f1",
    "#f3e8ff",
    "#fef3c7",
    "#dcfce7",
    "#fee2e2",
    "#e0e7ff",
  ];

  // Voordeur-marker op de juiste zijde (midden).
  const door =
    doorSide === "voor"
      ? { x: W / 2, y: H }
      : doorSide === "achter"
        ? { x: W / 2, y: 0 }
        : doorSide === "links"
          ? { x: 0, y: H / 2 }
          : { x: W, y: H / 2 };

  return (
    <svg
      width={W + PAD * 2}
      height={H + PAD * 2}
      viewBox={`${-PAD} ${-PAD} ${W + PAD * 2} ${H + PAD * 2}`}
      className="mx-auto block"
    >
      {layout.rooms.map((r, i) => {
        const x = r.rect.x * scale;
        const y = r.rect.y * scale;
        const w = r.rect.w * scale;
        const h = r.rect.h * scale;
        const area = polygonArea(rectPolygon(r.rect));
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={h} fill={palette[i % palette.length]} stroke="#fff" strokeWidth={1} />
            {w > 44 && h > 26 && (
              <text x={x + w / 2} y={y + h / 2} textAnchor="middle" fontSize={9} fill="#44403c">
                <tspan x={x + w / 2} dy="-1">
                  {r.name}
                </tspan>
                <tspan x={x + w / 2} dy="11" fontSize={8} fill="#78716c">
                  {formatArea(area)}
                </tspan>
              </text>
            )}
          </g>
        );
      })}
      <rect x={0} y={0} width={W} height={H} fill="none" stroke="#1c1917" strokeWidth={2.5} />
      <circle cx={door.x} cy={door.y} r={4.5} fill="#ea580c" stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}
