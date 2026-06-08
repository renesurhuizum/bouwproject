"use client";

// Statische SVG-plattegrond voor het werkblad/print: muren met maten, ruimtes,
// en installatiepunten met hoogtes. Geen Konva — schoon voor print/PDF.

import type {
  Wall,
  Room,
  ElectricalItem,
  ElectricalType,
  PlumbingItem,
  Point,
} from "@/lib/domain/types";
import { WALL_STATUS_COLOR, FIXTURE_CODE, PLUMBING_COLOR } from "@/lib/domain/constants";
import { bounds, dist, polygonArea, polygonCentroid } from "@/lib/geometry";
import { formatLength, formatArea, formatHeight } from "@/lib/format";

const ELEC_CODE: Record<ElectricalType, string> = {
  socket: "S",
  "socket-double": "S²",
  switch: "W",
  light: "L",
  spot: "·",
  "wall-light": "WL",
  data: "D",
  panel: "▣",
  outdoor: "B",
};

interface Props {
  walls: Wall[];
  rooms: Room[];
  electrical: ElectricalItem[];
  plumbing: PlumbingItem[];
  maxWidth?: number;
}

export function WerkbladPlan({ walls, rooms, electrical, plumbing, maxWidth = 700 }: Props) {
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
  const PAD = 28;
  const W = wM * scale + PAD * 2;
  const H = hM * scale + PAD * 2;

  const sx = (x: number) => (x - b.min.x) * scale + PAD;
  const sy = (y: number) => (y - b.min.y) * scale + PAD;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
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

      {/* Water */}
      {plumbing.map((it) =>
        it.position && it.fixture ? (
          <g key={it.id}>
            <circle cx={sx(it.position.x)} cy={sy(it.position.y)} r={9} fill={PLUMBING_COLOR} />
            <text
              x={sx(it.position.x)}
              y={sy(it.position.y) + 3}
              textAnchor="middle"
              fontSize={7}
              fontWeight="700"
              fontFamily="monospace"
              fill="#fff"
            >
              {FIXTURE_CODE[it.fixture]}
            </text>
          </g>
        ) : null,
      )}
    </svg>
  );
}
