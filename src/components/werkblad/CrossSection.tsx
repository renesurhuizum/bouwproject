"use client";

// Doorsnede-SVG: snijdt het gebouw langs een SectionLine en toont de doorsnede als aanzicht.

import { useMemo } from "react";
import type { Wall, Opening, Level, SectionLine, Room } from "@/lib/domain/types";

interface Props {
  section: SectionLine;
  levels: Level[];
  walls: Wall[];       // alle wanden (alle verdiepingen)
  openings: Opening[];
  rooms: Room[];
}

type IntersectedWall = {
  wall: Wall;
  level: Level;
  t: number;  // parametrisch snijpunt op de sectielijn (0..1)
  openings: Opening[];
};

// Snijpunt van twee lijnstukken (parametrisch).
function segIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): { t: number; u: number } | null {
  const denom = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denom;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / denom;
  if (t < -0.001 || t > 1.001 || u < -0.001 || u > 1.001) return null;
  return { t, u };
}

const SVG_W = 700;
const SCALE = 40; // pixels per meter
const MARGIN = 30;

export function CrossSection({ section, levels, walls, openings, rooms }: Props) {
  const openingsByWall = useMemo(() => {
    const m = new Map<string, Opening[]>();
    for (const op of openings) {
      const list = m.get(op.wallId) ?? [];
      list.push(op);
      m.set(op.wallId, list);
    }
    return m;
  }, [openings]);

  const levelById = useMemo(() => new Map(levels.map((l) => [l.id, l])), [levels]);

  // Zoek alle wanden die de sectielijn kruisen
  const hits = useMemo<IntersectedWall[]>(() => {
    const result: IntersectedWall[] = [];
    const sx = section.start.x, sy = section.start.y;
    const ex = section.end.x, ey = section.end.y;
    for (const w of walls) {
      const level = levelById.get(w.levelId);
      if (!level) continue;
      const r = segIntersect(sx, sy, ex, ey, w.start.x, w.start.y, w.end.x, w.end.y);
      if (!r) continue;
      result.push({
        wall: w,
        level,
        t: r.t,
        openings: openingsByWall.get(w.id) ?? [],
      });
    }
    result.sort((a, b) => a.t - b.t);
    return result;
  }, [section, walls, levelById, openingsByWall]);

  const sectionLen = Math.hypot(
    section.end.x - section.start.x,
    section.end.y - section.start.y,
  );

  const maxElev = levels.length
    ? Math.max(...levels.map((l) => l.elevation + l.height)) + 1
    : 8;

  const svgH = Math.round(maxElev * SCALE) + MARGIN * 2;

  function toSVG(horizM: number, vertM: number): [number, number] {
    return [MARGIN + horizM * SCALE, svgH - MARGIN - vertM * SCALE];
  }

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${SVG_W} ${svgH}`}
        width={SVG_W}
        height={svgH}
        className="max-w-full"
        style={{ fontFamily: "monospace", fontSize: 10 }}
      >
        {/* Achtergrondraster */}
        <rect x={MARGIN} y={MARGIN} width={sectionLen * SCALE} height={maxElev * SCALE} fill="#fafaf8" stroke="#e2ddd5" strokeWidth={0.5} />

        {/* Verdiepingsvloeren */}
        {levels.map((level) => {
          const [x1, y1] = toSVG(0, level.elevation);
          const [x2] = toSVG(sectionLen, level.elevation);
          const [, yCeil] = toSVG(0, level.elevation + level.height);
          return (
            <g key={level.id}>
              <line x1={x1} y1={y1} x2={x2} y2={y1} stroke="#c8c0b0" strokeWidth={1.5} strokeDasharray="4 3" />
              <line x1={x1} y1={yCeil} x2={x2} y2={yCeil} stroke="#c8c0b0" strokeWidth={1} strokeDasharray="2 4" />
              <text x={MARGIN - 4} y={y1} textAnchor="end" dominantBaseline="middle" fill="#888" fontSize={8}>
                +{level.elevation.toFixed(1)}
              </text>
              <text x={MARGIN + 2} y={(y1 + yCeil) / 2} fill="#aaa" fontSize={8} dominantBaseline="middle">
                {level.name}
              </text>
            </g>
          );
        })}

        {/* Nulpeil */}
        {(() => {
          const [x1, y1] = toSVG(0, 0);
          const [x2] = toSVG(sectionLen, 0);
          return <line x1={x1} y1={y1} x2={x2} y2={y1} stroke="#888" strokeWidth={2} />;
        })()}

        {/* Wanden */}
        {hits.map(({ wall, level, t, openings: wOps }, i) => {
          const horizM = t * sectionLen;
          const w2 = wall.thickness / 2;
          const [x1, _] = toSVG(horizM - w2, level.elevation);
          const [x2] = toSVG(horizM + w2, level.elevation);
          const [, yBase] = toSVG(horizM, level.elevation);
          const wallH = wall.height;

          return (
            <g key={`${wall.id}-${i}`}>
              {/* Volle muurhoogte (achtergrond) */}
              <rect
                x={x1}
                y={toSVG(horizM, level.elevation + wallH)[1]}
                width={Math.max(1, x2 - x1)}
                height={wallH * SCALE}
                fill={wall.status === "demolish" ? "#fca5a5" : wall.status === "new" ? "#fed7aa" : "#d1cec8"}
                stroke="#888"
                strokeWidth={0.5}
              />
              {/* Openingen (uitgesparingen) */}
              {wOps.map((op) => {
                const [, yTop] = toSVG(horizM, level.elevation + op.sillHeight + op.height);
                const [, ySill] = toSVG(horizM, level.elevation + op.sillHeight);
                return (
                  <rect
                    key={op.id}
                    x={x1}
                    y={yTop}
                    width={Math.max(1, x2 - x1)}
                    height={(op.height) * SCALE}
                    fill={op.type === "window" ? "#bae6fd" : "#f8f8f0"}
                    stroke="#60a5fa"
                    strokeWidth={0.5}
                  />
                );
              })}
              {/* Muur-label */}
              <text
                x={(x1 + x2) / 2}
                y={toSVG(horizM, level.elevation + wallH)[1] - 3}
                textAnchor="middle"
                fill="#666"
                fontSize={7}
              >
                {Math.round(wall.thickness * 100)}
              </text>
            </g>
          );
        })}

        {/* Maatlijn hoogte */}
        {levels.map((level) => {
          const [mx, my] = toSVG(sectionLen + 0.3, level.elevation + level.height / 2);
          return (
            <g key={`dim-${level.id}`}>
              <line
                x1={toSVG(sectionLen + 0.15, level.elevation)[0]}
                y1={toSVG(sectionLen + 0.15, level.elevation)[1]}
                x2={toSVG(sectionLen + 0.15, level.elevation + level.height)[0]}
                y2={toSVG(sectionLen + 0.15, level.elevation + level.height)[1]}
                stroke="#888"
                strokeWidth={0.8}
              />
              <text x={mx + 4} y={my} dominantBaseline="middle" fill="#888" fontSize={8}>
                {(level.height * 1000).toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Label doorsnede */}
        <text x={MARGIN} y={svgH - 6} fill="#888" fontSize={9}>
          Doorsnede {section.label} — schaal 1:{Math.round(1 / (SCALE / 1000))}
        </text>
      </svg>
    </div>
  );
}
