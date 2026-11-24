"use client";

// Statische SVG-plattegrond voor het werkblad/print: muren met maten, ruimtes,
// openingen (deur-zwaaiboog / raam), installatiepunten met hoogtes, plus
// maatlijnen, schaalbalk, noordpijl en legenda. Geen Konva — schoon voor print.

import type { ReactNode } from "react";
import type {
  Wall,
  Room,
  Opening,
  ElectricalItem,
  PlumbingItem,
  Furniture,
  FurnitureKind,
  FixtureKind,
  Point,
} from "@/lib/domain/types";
import {
  WALL_STATUS_COLOR,
  ELECTRICAL_CODE,
  FIXTURE_CODE,
  FIXTURE_FOOTPRINT,
  PLUMBING_COLOR,
} from "@/lib/domain/constants";
import { FURNITURE_DEFAULTS } from "@/lib/domain/furniture";
import { bounds, dist, polygonArea, polygonCentroid } from "@/lib/geometry";
import { formatLength, formatArea, formatHeight } from "@/lib/format";

const ELEC_CODE = ELECTRICAL_CODE;
const FIXTURE_DIMS = FIXTURE_FOOTPRINT;

// Sanitair-symbool op ware grootte, gecentreerd rond (0,0). w/h in px.
// Stijl (stroke/fill) komt van de omhullende <g>; alleen afwijkingen lokaal.
function fixtureSymbol(kind: FixtureKind, w: number, h: number): ReactNode {
  switch (kind) {
    case "toilet": {
      const tank = h * 0.28; // stortbak bovenaan
      const cy = -h / 2 + tank + (h - tank) / 2;
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={tank} />
          <ellipse cx={0} cy={cy} rx={w * 0.45} ry={(h - tank) * 0.46} />
          <ellipse cx={0} cy={cy} rx={w * 0.3} ry={(h - tank) * 0.3} fill="none" />
        </>
      );
    }
    case "sink":
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} />
          <ellipse cx={0} cy={h * 0.06} rx={w * 0.32} ry={h * 0.3} />
          <circle cx={0} cy={-h / 2 + h * 0.16} r={1.5} fill="#0891b2" />
        </>
      );
    case "shower":
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} />
          <line x1={-w / 2} y1={-h / 2} x2={w / 2} y2={h / 2} />
          <line x1={w / 2} y1={-h / 2} x2={-w / 2} y2={h / 2} />
          <circle cx={0} cy={0} r={Math.max(2, w * 0.06)} fill="white" />
        </>
      );
    case "bath": {
      const ix = w * 0.1;
      const iy = h * 0.1;
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} />
          <rect
            x={-w / 2 + ix}
            y={-h / 2 + iy}
            width={w - ix * 2}
            height={h - iy * 2}
            rx={(h - iy * 2) / 3}
            fill="none"
          />
          <circle cx={-w / 2 + w * 0.18} cy={0} r={2} fill="none" />
        </>
      );
    }
    case "washing-machine":
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} />
          <line x1={-w / 2} y1={-h / 2 + h * 0.18} x2={w / 2} y2={-h / 2 + h * 0.18} />
          <circle cx={0} cy={h * 0.09} r={w * 0.3} fill="none" />
        </>
      );
    case "boiler":
      return (
        <>
          <circle cx={0} cy={0} r={w / 2} />
          <circle cx={0} cy={0} r={w * 0.34} fill="none" />
        </>
      );
    case "kitchen-tap":
    case "outdoor-tap":
      return (
        <>
          <circle cx={0} cy={0} r={w * 0.28} />
          <line x1={0} y1={0} x2={0} y2={h / 2} />
        </>
      );
  }
}

// Meubel-contour (architectenstijl), gecentreerd rond (0,0). w/h in px.
// Stijl (dunne grijze lijnen, fill none) komt van de omhullende <g>.
function furnitureOutline(kind: FurnitureKind, w: number, h: number): ReactNode {
  const box = <rect x={-w / 2} y={-h / 2} width={w} height={h} />;
  switch (kind) {
    case "bed-single":
    case "bed-double":
    case "bed-king":
      return (
        <>
          {box}
          {/* kussenlijn */}
          <line x1={-w / 2 + w * 0.08} y1={-h / 2 + h * 0.15} x2={w / 2 - w * 0.08} y2={-h / 2 + h * 0.15} />
          {/* dwarslijn (dekenvouw) op 30% */}
          <line x1={-w / 2} y1={-h / 2 + h * 0.3} x2={w / 2} y2={-h / 2 + h * 0.3} />
        </>
      );
    case "sofa-2":
    case "sofa-3":
    case "sofa-l":
    case "dining-chair":
    case "office-chair":
      return (
        <>
          {box}
          {/* ruglijn */}
          <line x1={-w / 2} y1={-h / 2 + h * 0.25} x2={w / 2} y2={-h / 2 + h * 0.25} />
        </>
      );
    case "dining-table":
    case "desk":
    case "coffee-table":
    case "tv-unit":
      return box;
    case "wardrobe":
    case "bookshelf":
      return (
        <>
          {box}
          <line x1={-w / 2} y1={-h / 2} x2={w / 2} y2={h / 2} />
          <line x1={w / 2} y1={-h / 2} x2={-w / 2} y2={h / 2} />
        </>
      );
    case "bathtub": {
      const ix = w * 0.1;
      const iy = h * 0.1;
      return (
        <>
          {box}
          <rect x={-w / 2 + ix} y={-h / 2 + iy} width={w - ix * 2} height={h - iy * 2} rx={(h - iy * 2) / 3} />
          <circle cx={-w / 2 + w * 0.18} cy={0} r={2} />
        </>
      );
    }
    case "shower-cabin":
      return (
        <>
          {box}
          <line x1={-w / 2} y1={-h / 2} x2={w / 2} y2={h / 2} />
          <line x1={w / 2} y1={-h / 2} x2={-w / 2} y2={h / 2} />
          <circle cx={0} cy={0} r={Math.max(2, w * 0.06)} />
        </>
      );
    case "kitchen-island": {
      const r = Math.min(w, h) * 0.1;
      const cx = w * 0.2;
      return (
        <>
          {box}
          {/* spoelbak links */}
          <rect x={-w / 2 + w * 0.08} y={-h * 0.22} width={w * 0.25} height={h * 0.44} />
          {/* 4 kookzones rechts */}
          <circle cx={cx} cy={-h * 0.2} r={r} />
          <circle cx={cx + w * 0.22} cy={-h * 0.2} r={r} />
          <circle cx={cx} cy={h * 0.2} r={r} />
          <circle cx={cx + w * 0.22} cy={h * 0.2} r={r} />
        </>
      );
    }
  }
}

interface Props {
  walls: Wall[];
  rooms: Room[];
  electrical: ElectricalItem[];
  plumbing: PlumbingItem[];
  openings?: Opening[];
  furniture?: Furniture[];
  northDegrees?: number;
  maxWidth?: number;
  openingCodes?: Map<string, string>; // kozijnstaat-referenties (D01/R01) bij openingen
  svgId?: string; // voor PNG-export
}

export function WerkbladPlan({
  walls,
  rooms,
  electrical,
  plumbing,
  openings = [],
  furniture = [],
  northDegrees = 0,
  maxWidth = 700,
  openingCodes,
  svgId,
}: Props) {
  const pts: Point[] = [
    ...walls.flatMap((w) => [w.start, w.end]),
    ...rooms.flatMap((r) => r.polygon),
  ];
  if (pts.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-300">Nog geen plattegrond getekend.</p>;
  }

  const b = bounds(pts);
  const wM = Math.max(0.1, b.max.x - b.min.x);
  const hM = Math.max(0.1, b.max.y - b.min.y);
  const scale = maxWidth / wM;
  const PAD = 30;
  const DIM = 30;    // ruimte voor maatlijnen (boven + rechts)
  const FOOT = 70;   // ruimte voor schaalbalk + legenda onderaan
  const W = wM * scale + PAD * 2 + DIM;
  const H = hM * scale + PAD * 2 + DIM + FOOT;

  const sx = (x: number) => (x - b.min.x) * scale + PAD;
  const sy = (y: number) => (y - b.min.y) * scale + PAD + DIM;

  const wallById = new Map(walls.map((w) => [w.id, w]));

  // Schaalbalk: kies een ronde meterwaarde die ~120px breed is.
  const targetM = 120 / scale;
  const niceSteps = [0.5, 1, 2, 5, 10, 20, 50];
  const barM = niceSteps.reduce((p, c) => (Math.abs(c - targetM) < Math.abs(p - targetM) ? c : p), niceSteps[0]);
  const barPx = barM * scale;
  const barY = H - FOOT + 26;
  const barX = PAD;

  return (
    <svg id={svgId} width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
      {/* Maatlijnen — totale breedte (boven) en hoogte (rechts) */}
      <g stroke="#ea580c" strokeWidth={0.7} fill="none">
        <line x1={sx(b.min.x)} y1={PAD + DIM - 14} x2={sx(b.max.x)} y2={PAD + DIM - 14} />
        <line x1={sx(b.min.x)} y1={PAD + DIM - 19} x2={sx(b.min.x)} y2={PAD + DIM - 9} />
        <line x1={sx(b.max.x)} y1={PAD + DIM - 19} x2={sx(b.max.x)} y2={PAD + DIM - 9} />
        <line x1={sx(b.max.x) + 14} y1={sy(b.min.y)} x2={sx(b.max.x) + 14} y2={sy(b.max.y)} />
        <line x1={sx(b.max.x) + 9} y1={sy(b.min.y)} x2={sx(b.max.x) + 19} y2={sy(b.min.y)} />
        <line x1={sx(b.max.x) + 9} y1={sy(b.max.y)} x2={sx(b.max.x) + 19} y2={sy(b.max.y)} />
      </g>
      <text
        x={(sx(b.min.x) + sx(b.max.x)) / 2}
        y={PAD + DIM - 17}
        textAnchor="middle"
        fontSize={9}
        fontFamily="monospace"
        fill="#ea580c"
      >
        {formatLength(wM)}
      </text>
      <text
        x={sx(b.max.x) + 17}
        y={(sy(b.min.y) + sy(b.max.y)) / 2}
        textAnchor="middle"
        fontSize={9}
        fontFamily="monospace"
        fill="#ea580c"
        transform={`rotate(90 ${sx(b.max.x) + 17} ${(sy(b.min.y) + sy(b.max.y)) / 2})`}
      >
        {formatLength(hM)}
      </text>

      {/* Ruimtes */}
      {rooms.map((r) => {
        if (r.polygon.length < 3) return null;
        const d = r.polygon.map((p, i) => `${i ? "L" : "M"}${sx(p.x)},${sy(p.y)}`).join(" ") + " Z";
        const c = polygonCentroid(r.polygon);
        return (
          <g key={r.id}>
            <path d={d} fill="rgba(234,88,12,0.06)" stroke="rgba(234,88,12,0.25)" strokeWidth={1} />
            <text x={sx(c.x)} y={sy(c.y)} textAnchor="middle" fontSize={11} fill="#1c1917">
              <tspan x={sx(c.x)} fontWeight="600">
                {r.name}
              </tspan>
              <tspan x={sx(c.x)} dy="13" fontSize={10} fill="#78716c">
                {formatArea(polygonArea(r.polygon))}
              </tspan>
            </text>
          </g>
        );
      })}

      {/* Muren + maten */}
      {walls.map((w) => {
        const len = dist(w.start, w.end);
        const mid = { x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 };
        const thick = Math.max(2, w.thickness * scale);
        return (
          <g key={w.id}>
            <line
              x1={sx(w.start.x)}
              y1={sy(w.start.y)}
              x2={sx(w.end.x)}
              y2={sy(w.end.y)}
              stroke={WALL_STATUS_COLOR[w.status]}
              strokeWidth={thick}
              strokeLinecap="square"
              strokeDasharray={w.status === "demolish" ? "8 5" : undefined}
            />
            {len * scale > 36 && (
              <text
                x={sx(mid.x)}
                y={sy(mid.y) - 3}
                textAnchor="middle"
                fontSize={9}
                fontFamily="monospace"
                fill="#44403c"
              >
                {formatLength(len)}
              </text>
            )}
          </g>
        );
      })}

      {/* Openingen: deur-zwaaiboog / raam-symbool */}
      {openings.map((op) => {
        const w = wallById.get(op.wallId);
        if (!w) return null;
        const len = dist(w.start, w.end);
        if (len < 0.01) return null;
        const dx = (w.end.x - w.start.x) / len;
        const dy = (w.end.y - w.start.y) / len;
        const nx = -dy, ny = dx; // normaal
        const cM = { x: w.start.x + dx * op.offset, y: w.start.y + dy * op.offset };
        const aM = { x: cM.x - dx * (op.width / 2), y: cM.y - dy * (op.width / 2) };
        const eM = { x: cM.x + dx * (op.width / 2), y: cM.y + dy * (op.width / 2) };
        const a = { x: sx(aM.x), y: sy(aM.y) };
        const e = { x: sx(eM.x), y: sy(eM.y) };
        const thick = Math.max(3, w.thickness * scale + 1);

        // Wand "doorknippen" met witte segment
        const cut = (
          <line
            x1={a.x} y1={a.y} x2={e.x} y2={e.y}
            stroke="#ffffff" strokeWidth={thick} strokeLinecap="butt"
          />
        );

        if (op.type === "window") {
          return (
            <g key={op.id}>
              {cut}
              <line x1={a.x + nx * 2} y1={a.y + ny * 2} x2={e.x + nx * 2} y2={e.y + ny * 2} stroke="#1d4ed8" strokeWidth={1} />
              <line x1={a.x - nx * 2} y1={a.y - ny * 2} x2={e.x - nx * 2} y2={e.y - ny * 2} stroke="#1d4ed8" strokeWidth={1} />
            </g>
          );
        }
        if (op.type === "passage") {
          return <g key={op.id}>{cut}</g>;
        }
        // Deur: blad + zwaaiboog (kwartcirkel) naar binnen (normaal-richting)
        const rPx = op.width * scale;
        const hinge = a;
        const leafEnd = { x: hinge.x + nx * rPx, y: hinge.y + ny * rPx };
        return (
          <g key={op.id}>
            {cut}
            <line x1={hinge.x} y1={hinge.y} x2={leafEnd.x} y2={leafEnd.y} stroke="#a16207" strokeWidth={1.2} />
            <path
              d={`M${leafEnd.x},${leafEnd.y} A${rPx},${rPx} 0 0 0 ${e.x},${e.y}`}
              fill="none" stroke="#a16207" strokeWidth={0.8} strokeDasharray="3 3"
            />
          </g>
        );
      })}

      {/* Meubilering — lichte contouren onder de installatielagen */}
      {furniture.map((f) => {
        const def = FURNITURE_DEFAULTS[f.kind];
        const fw = (f.width ?? def.w) * scale;
        const fd = (f.depth ?? def.d) * scale;
        return (
          <g
            key={f.id}
            transform={`translate(${sx(f.position.x)} ${sy(f.position.y)}) rotate(${f.rotation})`}
            stroke="#9ca3af"
            strokeWidth={0.8}
            fill="none"
          >
            {furnitureOutline(f.kind, fw, fd)}
          </g>
        );
      })}

      {/* Elektra */}
      {electrical.map((it) => (
        <g key={it.id}>
          <circle cx={sx(it.position.x)} cy={sy(it.position.y)} r={8} fill="#1d4ed8" />
          <text
            x={sx(it.position.x)}
            y={sy(it.position.y) + 3}
            textAnchor="middle"
            fontSize={8}
            fontWeight="700"
            fontFamily="monospace"
            fill="#fff"
          >
            {ELEC_CODE[it.type]}
          </text>
          <text
            x={sx(it.position.x)}
            y={sy(it.position.y) + 18}
            textAnchor="middle"
            fontSize={7}
            fontFamily="monospace"
            fill="#1d4ed8"
          >
            {formatHeight(it.heightZ)}
          </text>
        </g>
      ))}

      {/* Water — sanitair als bovenaanzicht-symbolen op ware grootte */}
      {plumbing.map((it) => {
        if (!it.position || !it.fixture) return null;
        const dims = FIXTURE_DIMS[it.fixture];
        const fw = dims.w * scale;
        const fh = dims.h * scale;
        return (
          <g key={it.id} transform={`translate(${sx(it.position.x)} ${sy(it.position.y)})`}>
            <g stroke={PLUMBING_COLOR} strokeWidth={1} fill="white">
              {fixtureSymbol(it.fixture, fw, fh)}
            </g>
            <text
              x={0}
              y={fh / 2 + 7}
              textAnchor="middle"
              fontSize={6}
              fontFamily="monospace"
              fill={PLUMBING_COLOR}
            >
              {FIXTURE_CODE[it.fixture]}
            </text>
          </g>
        );
      })}

      {/* Kozijnstaat-referenties (D01/R01) bij elke opening */}
      {openingCodes &&
        openings.map((op) => {
          const code = openingCodes.get(op.id);
          const w = wallById.get(op.wallId);
          if (!code || !w) return null;
          const len = dist(w.start, w.end);
          if (len < 0.01) return null;
          const dx = (w.end.x - w.start.x) / len;
          const dy = (w.end.y - w.start.y) / len;
          const nx = -dy, ny = dx;
          const off = 18 / scale; // ~18px naar buiten
          const cM = { x: w.start.x + dx * op.offset, y: w.start.y + dy * op.offset };
          const px = sx(cM.x + nx * off);
          const py = sy(cM.y + ny * off);
          return (
            <g key={`code-${op.id}`}>
              <circle cx={px} cy={py} r={7.5} fill="#fff" stroke="#1c1917" strokeWidth={0.8} />
              <text
                x={px}
                y={py + 2.5}
                textAnchor="middle"
                fontSize={7}
                fontWeight="700"
                fontFamily="monospace"
                fill="#1c1917"
              >
                {code}
              </text>
            </g>
          );
        })}

      {/* Noordpijl rechtsboven */}
      <g transform={`translate(${W - 26} ${PAD + DIM + 6})`}>
        <g transform={`rotate(${northDegrees})`}>
          <path d="M0,-13 L5,6 L0,1 L-5,6 Z" fill="#1c1917" />
        </g>
        <text x={0} y={20} textAnchor="middle" fontSize={9} fontWeight="700" fill="#1c1917">N</text>
      </g>

      {/* Schaalbalk */}
      <g>
        <line x1={barX} y1={barY} x2={barX + barPx} y2={barY} stroke="#1c1917" strokeWidth={2} />
        <line x1={barX} y1={barY - 4} x2={barX} y2={barY + 4} stroke="#1c1917" strokeWidth={1} />
        <line x1={barX + barPx} y1={barY - 4} x2={barX + barPx} y2={barY + 4} stroke="#1c1917" strokeWidth={1} />
        <line x1={barX + barPx / 2} y1={barY - 3} x2={barX + barPx / 2} y2={barY + 3} stroke="#1c1917" strokeWidth={0.7} />
        <text x={barX} y={barY + 14} fontSize={8} fontFamily="monospace" fill="#44403c">0</text>
        <text x={barX + barPx} y={barY + 14} textAnchor="end" fontSize={8} fontFamily="monospace" fill="#44403c">
          {barM} m
        </text>
      </g>

      {/* Legenda */}
      <g transform={`translate(${barX + barPx + 40} ${H - FOOT + 18})`} fontSize={8} fontFamily="system-ui">
        <g>
          <line x1={0} y1={0} x2={16} y2={0} stroke={WALL_STATUS_COLOR.new} strokeWidth={3} />
          <text x={20} y={3} fill="#44403c">Nieuw</text>
        </g>
        <g transform="translate(72 0)">
          <line x1={0} y1={0} x2={16} y2={0} stroke={WALL_STATUS_COLOR.existing} strokeWidth={3} />
          <text x={20} y={3} fill="#44403c">Bestaand</text>
        </g>
        <g transform="translate(150 0)">
          <line x1={0} y1={0} x2={16} y2={0} stroke={WALL_STATUS_COLOR.demolish} strokeWidth={3} strokeDasharray="4 3" />
          <text x={20} y={3} fill="#44403c">Slopen</text>
        </g>
        <g transform="translate(0 16)">
          <circle cx={8} cy={0} r={6} fill="#1d4ed8" />
          <text x={20} y={3} fill="#44403c">Elektra</text>
        </g>
        <g transform="translate(72 16)">
          <circle cx={8} cy={0} r={6} fill="white" stroke={PLUMBING_COLOR} strokeWidth={1} />
          <text x={20} y={3} fill="#44403c">Water/sanitair</text>
        </g>
        <g transform="translate(150 16)">
          <line x1={0} y1={0} x2={16} y2={0} stroke="#a16207" strokeWidth={1.2} />
          <text x={20} y={3} fill="#44403c">Deur/raam</text>
        </g>
        <g transform="translate(0 32)">
          <rect x={0} y={-5} width={16} height={10} fill="none" stroke="#9ca3af" strokeWidth={0.8} />
          <text x={20} y={3} fill="#44403c">Meubilering (grijs)</text>
        </g>
      </g>
    </svg>
  );
}
