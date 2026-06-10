// Wandaanzicht (elevatie-tekening) voor één wandvlak van een ruimte.
// SVG met exact positie en hoogte van alle installaties.
// Gebaseerd op NEN 1413-stijl elektrasymbolen.

import type { Wall, Opening, ElectricalItem, PlumbingItem, HvacItem } from "@/lib/domain/types";
import { dist, projectOnSegment } from "@/lib/geometry";
import { formatLength } from "@/lib/format";
import {
  ELECTRICAL_LABEL,
  OPENING_LABEL,
  FIXTURE_LABEL,
  HVAC_LABEL,
} from "@/lib/domain/constants";

const ELEC_CODE: Record<string, string> = {
  socket: "S", "socket-double": "S²", switch: "W", light: "L",
  spot: "·", "wall-light": "WL", data: "D", panel: "▣", outdoor: "B",
};
const ELEC_COLOR = "#1d4ed8";
const PLUMB_COLOR = "#0891b2";
const HVAC_COLOR = "#f97316";

// Maximale zijdelingse afstand (m) waarbinnen een item wordt geprojecteerd op de muur
const SNAP_DIST_M = 0.8;

interface Props {
  wall: Wall;
  openings: Opening[];
  electrical: ElectricalItem[];
  plumbing: PlumbingItem[];
  hvac: HvacItem[];
  wallName?: string;
  maxWidth?: number;
}

interface ProjectedItem {
  offset: number;    // m langs de muur
  height: number;    // m boven vloer
  label: string;
  code: string;
  color: string;
  kind: "elec" | "plumb" | "hvac";
  id: string;
}

function projectItems(
  wall: Wall,
  electrical: ElectricalItem[],
  plumbing: PlumbingItem[],
  hvac: HvacItem[],
): ProjectedItem[] {
  const items: ProjectedItem[] = [];
  const wallLen = dist(wall.start, wall.end);
  if (wallLen < 0.01) return items;

  const project = (pos: { x: number; y: number }, height: number) => {
    const { t, dist: d } = projectOnSegment(pos, wall.start, wall.end);
    if (d > SNAP_DIST_M) return null;
    return { offset: t * wallLen, height };
  };

  for (const it of electrical) {
    const p = project(it.position, it.heightZ);
    if (!p) continue;
    items.push({
      ...p,
      label: ELECTRICAL_LABEL[it.type] ?? it.type,
      code: ELEC_CODE[it.type] ?? "?",
      color: ELEC_COLOR,
      kind: "elec",
      id: it.id,
    });
  }

  for (const it of plumbing) {
    if (!it.position) continue;
    const p = project(it.position, it.heightZ ?? 0.9);
    if (!p) continue;
    items.push({
      ...p,
      label: it.fixture ? (FIXTURE_LABEL[it.fixture] ?? it.fixture) : "Leiding",
      code: it.fixture ? it.fixture.slice(0, 2).toUpperCase() : "L",
      color: PLUMB_COLOR,
      kind: "plumb",
      id: it.id,
    });
  }

  for (const it of hvac) {
    if (!it.position) continue;
    const p = project(it.position, it.heightZ ?? 0.3);
    if (!p) continue;
    items.push({
      ...p,
      label: HVAC_LABEL[it.type] ?? it.type,
      code: it.type.slice(0, 3).toUpperCase(),
      color: HVAC_COLOR,
      kind: "hvac",
      id: it.id,
    });
  }

  return items.sort((a, b) => a.offset - b.offset);
}

// Maatlijn met eindstreepjes en label (NEN-stijl).
function DimLine({ x1, y1, x2, y2, text, outside = false }: {
  x1: number; y1: number; x2: number; y2: number; text: string; outside?: boolean;
}) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const TICK = 6;
  const isH = Math.abs(y1 - y2) < 2;
  return (
    <g stroke="#ea580c" strokeWidth={0.8} fill="none">
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      {isH ? (
        <>
          <line x1={x1} y1={y1 - TICK} x2={x1} y2={y1 + TICK} />
          <line x1={x2} y1={y2 - TICK} x2={x2} y2={y2 + TICK} />
        </>
      ) : (
        <>
          <line x1={x1 - TICK} y1={y1} x2={x1 + TICK} y2={y1} />
          <line x1={x2 - TICK} y1={y2} x2={x2 + TICK} y2={y2} />
        </>
      )}
      <text
        x={mx + (isH ? 0 : (outside ? -20 : 4))}
        y={my + (isH ? -4 : 3)}
        textAnchor={isH ? "middle" : "start"}
        fontSize={9}
        fontFamily="monospace"
        fill="#ea580c"
        stroke="none"
      >
        {text}
      </text>
    </g>
  );
}

export function WallElevation({
  wall,
  openings,
  electrical,
  plumbing,
  hvac,
  wallName,
  maxWidth = 680,
}: Props) {
  const wallLen = dist(wall.start, wall.end);
  const wallH = wall.height > 0 ? wall.height : 2.6;
  if (wallLen < 0.05) return null;

  const PAD = 48;
  const DIM_OFFSET = 32; // px voor maatlijnen boven/rechts
  const scale = maxWidth / wallLen;
  const W = wallLen * scale + PAD * 2 + DIM_OFFSET;
  const H = wallH * scale + PAD * 2 + DIM_OFFSET;

  const sx = (x: number) => PAD + DIM_OFFSET + x * scale;
  const sy = (y: number) => PAD + (wallH - y) * scale; // y=0 = vloer = onderkant

  const items = projectItems(wall, electrical, plumbing, hvac);

  // Filter openings op deze muur
  const wallOpenings = openings.filter((o) => o.wallId === wall.id);

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      className="block"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      {/* Wandcontour */}
      <rect
        x={sx(0)} y={sy(wallH)}
        width={wallLen * scale} height={wallH * scale}
        fill="white" stroke="#1c1917" strokeWidth={2}
      />

      {/* Vloerlijn accent */}
      <line x1={sx(0)} y1={sy(0)} x2={sx(wallLen)} y2={sy(0)} stroke="#44403c" strokeWidth={3} />

      {/* Openings (deuren/ramen) */}
      {wallOpenings.map((op) => {
        const x1 = sx(op.offset - op.width / 2);
        const y1 = sy(op.sillHeight + op.height);
        const w = op.width * scale;
        const h = op.height * scale;
        const sy0 = sy(op.sillHeight);
        return (
          <g key={op.id}>
            {/* Uitsparing wit */}
            <rect x={x1} y={y1} width={w} height={h} fill="#e8f4fc" stroke="#1d4ed8" strokeWidth={1} />
            {op.type === "door" && (
              <>
                {/* Dorpel */}
                <line x1={x1} y1={sy0} x2={x1 + w} y2={sy0} stroke="#a16207" strokeWidth={1.5} />
                {/* Deurzwaai-aanduiding */}
                <path
                  d={`M${x1},${y1} A${w},${w} 0 0 1 ${x1 + w},${y1 + w}`}
                  fill="none" stroke="#a16207" strokeWidth={0.8} strokeDasharray="3 3"
                />
              </>
            )}
            {op.type === "window" && op.sillHeight > 0 && (
              <line x1={x1} y1={sy0} x2={x1 + w} y2={sy0} stroke="#1d4ed8" strokeWidth={1.5} />
            )}
            {/* Opening-label */}
            <text
              x={x1 + w / 2} y={y1 - 4}
              textAnchor="middle" fontSize={8} fill="#1d4ed8"
            >
              {formatLength(op.width)}
            </text>
          </g>
        );
      })}

      {/* Installaties */}
      {items.map((it) => {
        const cx = sx(it.offset);
        const cy = sy(it.height);
        const r = 11;
        return (
          <g key={it.id}>
            {/* Verticale stippellijn hoogte-aanduiding */}
            <line
              x1={cx} y1={cy + r}
              x2={cx} y2={sy(0)}
              stroke={it.color} strokeWidth={0.5} strokeDasharray="3 3" opacity={0.4}
            />
            {/* Symbool */}
            {it.kind === "elec" ? (
              <circle cx={cx} cy={cy} r={r} fill={it.color} />
            ) : (
              <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={3} fill={it.color} />
            )}
            <text
              x={cx} y={cy + 4}
              textAnchor="middle" fontSize={9} fontWeight="bold"
              fontFamily="monospace" fill="white"
            >
              {it.code}
            </text>
            {/* Hoogte-label */}
            <text
              x={cx} y={cy + r + 11}
              textAnchor="middle" fontSize={8}
              fontFamily="monospace" fill={it.color}
            >
              {(it.height * 100).toFixed(0)} cm
            </text>
          </g>
        );
      })}

      {/* Maatlijnen — totale wandbreedte (boven) */}
      <DimLine
        x1={sx(0)} y1={PAD} x2={sx(wallLen)} y2={PAD}
        text={formatLength(wallLen)}
      />

      {/* Maatlijn — wandhoogte (rechts) */}
      <DimLine
        x1={sx(wallLen) + DIM_OFFSET - 8} y1={sy(wallH)}
        x2={sx(wallLen) + DIM_OFFSET - 8} y2={sy(0)}
        text={formatLength(wallH)}
        outside
      />

      {/* Header label */}
      <text x={sx(0)} y={12} fontSize={11} fontWeight="600" fill="#1c1917">
        {wallName ?? `Wand (${formatLength(wallLen)} × ${formatLength(wallH)})`}
      </text>
    </svg>
  );
}
