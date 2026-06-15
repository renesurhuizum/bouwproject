"use client";

// Doorsnede-tekening (SVG) langs een sectielijn. Toont per verdieping vloer en
// plafond, de doorsneden muren (met deur/raam-uitsparingen), het dakprofiel en
// een totale hoogtemaat. Benadering op basis van rechthoekige geometrie.

import type { Level, Wall, Opening, Room, Roof, SectionLine } from "@/lib/domain/types";
import { dist, segmentIntersection } from "@/lib/geometry";
import { formatLength } from "@/lib/format";

export interface SectionLevelData {
  level: Level;
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  roofs: Roof[];
}

interface Props {
  section: SectionLine;
  data: SectionLevelData[]; // alle verdiepingen, oplopend in hoogte
  maxWidth?: number;
}

interface Crossing {
  d: number; // afstand langs de sectielijn (m)
  level: Level;
  wall: Wall;
  cuts: { sill: number; head: number }[]; // openingen op deze kruising
}

export function CrossSection({ section, data, maxWidth = 700 }: Props) {
  const L = dist(section.start, section.end);
  if (L < 0.1 || data.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-300">Geen geldige doorsnede.</p>;
  }

  // Alle muur-kruisingen verzamelen.
  const crossings: Crossing[] = [];
  for (const { level, walls, openings } of data) {
    for (const w of walls) {
      const hit = segmentIntersection(section.start, section.end, w.start, w.end);
      if (!hit) continue;
      const wallLen = dist(w.start, w.end);
      const posAlong = hit.u * wallLen;
      const cuts = openings
        .filter((o) => o.wallId === w.id && Math.abs(posAlong - o.offset) <= o.width / 2)
        .map((o) => ({ sill: o.sillHeight, head: o.sillHeight + o.height }));
      crossings.push({ d: hit.t * L, level, wall: w, cuts });
    }
  }

  // Gebouwbreedte langs de doorsnede (buitenste kruisingen).
  const ds = crossings.map((c) => c.d);
  const spanMin = ds.length ? Math.min(...ds) : 0;
  const spanMax = ds.length ? Math.max(...ds) : L;

  // Verticale uitersten.
  const topLevel = data[data.length - 1].level;
  const baseElev = data[0].level.elevation;
  const topCeil = topLevel.elevation + topLevel.height;

  // Dakprofiel van de bovenste verdieping.
  const roof = data[data.length - 1].roofs[0] ?? null;
  const spanW = Math.max(0.5, spanMax - spanMin);
  let roofRise = 0;
  if (roof && roof.type !== "flat") {
    const p = (roof.pitch * Math.PI) / 180;
    roofRise = roof.type === "shed" ? Math.tan(p) * spanW : Math.tan(p) * (spanW / 2);
  } else if (roof) {
    roofRise = 0.15;
  }
  const totalTop = topCeil + roofRise;
  const totalH = totalTop - baseElev;

  // Schaal + canvas.
  const PADL = 54;
  const PADR = 24;
  const PADT = 24;
  const PADB = 30;
  const scale = Math.min((maxWidth - PADL - PADR) / Math.max(L, 0.5), 60);
  const W = L * scale + PADL + PADR;
  const H = totalH * scale + PADT + PADB;

  const dx = (d: number) => d * scale + PADL;
  const wy = (worldY: number) => (totalTop - worldY) * scale + PADT; // wereld-y omhoog → svg omlaag

  const grid = "#e7e2d8";

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
      {/* maaiveld / grondlijn */}
      <line x1={PADL} y1={wy(baseElev)} x2={W - PADR} y2={wy(baseElev)} stroke="#1c1917" strokeWidth={1.5} />

      {/* verdiepingen: vloer + plafond */}
      {data.map(({ level }) => {
        const fy = wy(level.elevation);
        const cy = wy(level.elevation + level.height);
        return (
          <g key={level.id}>
            <line x1={dx(spanMin)} y1={fy} x2={dx(spanMax)} y2={fy} stroke="#a8a094" strokeWidth={1} />
            <line x1={dx(spanMin)} y1={cy} x2={dx(spanMax)} y2={cy} stroke={grid} strokeWidth={1} />
            <text x={dx(spanMin) + 4} y={cy + 12} fontSize={9} fontFamily="monospace" fill="#78716c">
              {level.name}
            </text>
          </g>
        );
      })}

      {/* doorsneden muren */}
      {crossings.map((c, i) => {
        const barW = Math.max(3, c.wall.thickness * scale);
        const x = dx(c.d) - barW / 2;
        const floorY = wy(c.level.elevation);
        const ceilY = wy(c.level.elevation + c.level.height);
        return (
          <g key={`${c.wall.id}-${i}`}>
            <rect x={x} y={ceilY} width={barW} height={floorY - ceilY} fill="#cfc8ba" stroke="#8a8474" strokeWidth={0.5} />
            {/* deur/raam-uitsparingen */}
            {c.cuts.map((cut, j) => {
              const top = wy(c.level.elevation + cut.head);
              const bot = wy(c.level.elevation + cut.sill);
              return <rect key={j} x={x} y={top} width={barW} height={bot - top} fill="#ffffff" />;
            })}
          </g>
        );
      })}

      {/* dakprofiel */}
      {roof && (() => {
        const x0 = dx(spanMin);
        const x1 = dx(spanMax);
        const yC = wy(topCeil);
        const yTop = wy(totalTop);
        let pts: string;
        if (roof.type === "flat") {
          pts = `${x0},${yC} ${x1},${yC} ${x1},${wy(topCeil + 0.15)} ${x0},${wy(topCeil + 0.15)}`;
        } else if (roof.type === "shed") {
          pts = `${x0},${yC} ${x1},${yTop} ${x1},${yC}`;
        } else {
          pts = `${x0},${yC} ${(x0 + x1) / 2},${yTop} ${x1},${yC}`;
        }
        return <polygon points={pts} fill="rgba(155,74,58,0.18)" stroke="#9b4a3a" strokeWidth={1.2} />;
      })()}

      {/* totale hoogtemaat links */}
      <g stroke="#ea580c" strokeWidth={0.7} fill="none">
        <line x1={PADL - 16} y1={wy(baseElev)} x2={PADL - 16} y2={wy(totalTop)} />
        <line x1={PADL - 21} y1={wy(baseElev)} x2={PADL - 11} y2={wy(baseElev)} />
        <line x1={PADL - 21} y1={wy(totalTop)} x2={PADL - 11} y2={wy(totalTop)} />
      </g>
      <text
        x={PADL - 19}
        y={(wy(baseElev) + wy(totalTop)) / 2}
        textAnchor="middle"
        fontSize={9}
        fontFamily="monospace"
        fill="#ea580c"
        transform={`rotate(-90 ${PADL - 19} ${(wy(baseElev) + wy(totalTop)) / 2})`}
      >
        {formatLength(totalH)}
      </text>

      {/* sectielabel */}
      <text x={W - PADR} y={PADT - 8} textAnchor="end" fontSize={11} fontWeight={700} fill="#1c1917">
        Doorsnede {section.label}
      </text>
    </svg>
  );
}
