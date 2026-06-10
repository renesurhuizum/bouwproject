"use client";

// Muren-laag. Tekent muren met echte dikte (schaalt mee met zoom), kleur per
// status, stippellijn bij sloop, en een markering bij dragende muren.
// Bij geselecteerde muur: draggable eindpunt-handles zodat je muren kunt aanpassen.

import React, { Fragment } from "react";
import { Layer, Line, Circle, Label, Tag, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Wall } from "@/lib/domain/types";
import { dist, getCornerFillPoints } from "@/lib/geometry";
import { formatLength } from "@/lib/format";
import { metersToScreen, type ViewState } from "./viewport";

interface Props {
  view: ViewState;
  walls: Wall[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMoveEndpoint?: (wallId: string, which: "start" | "end", screenX: number, screenY: number) => void;
  onEditLength?: (wallId: string) => void;
}

// Bereken de 4 hoekpunten van een muur als gevulde rechthoek in wereld-meters,
// geconverteerd naar schermcoördinaten.
function wallPolygonPoints(wall: Wall, view: ViewState): number[] {
  const lenM = dist(wall.start, wall.end);
  if (lenM < 0.01) return [];

  const dxN = (wall.end.x - wall.start.x) / lenM;
  const dyN = (wall.end.y - wall.start.y) / lenM;
  const halfT = wall.thickness / 2;
  const nxW = -dyN * halfT;
  const nyW = dxN * halfT;

  // 4 hoekpunten in wereld-meters
  const corners = [
    { x: wall.start.x + nxW, y: wall.start.y + nyW },
    { x: wall.end.x + nxW,   y: wall.end.y + nyW   },
    { x: wall.end.x - nxW,   y: wall.end.y - nyW   },
    { x: wall.start.x - nxW, y: wall.start.y - nyW },
  ];

  const screen = corners.map((p) => metersToScreen(p, view));
  return screen.flatMap((p) => [p.x, p.y]);
}

// Kleur-configuratie per status
const WALL_FILL: Record<string, string> = {
  existing:  "#d6d0c4",
  new:       "#fed7aa",
  demolish:  "rgba(220,38,38,0.25)",
};
const WALL_STROKE: Record<string, string> = {
  existing:  "#a09890",
  new:       "#ea580c",
  demolish:  "#dc2626",
};

// Compute corner fill polygons for all junction points.
function buildCornerFills(walls: Wall[], view: ViewState): React.ReactNode[] {
  // Bewaar het werkelijke kruispunt naast de muren, zodat we niet hoeven te
  // raden welk uiteinde van de eerste muur op de junction ligt.
  const byEndpoint = new Map<string, { point: { x: number; y: number }; walls: Wall[] }>();
  const key = (p: { x: number; y: number }) =>
    `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
  for (const w of walls) {
    for (const p of [w.start, w.end]) {
      const k = key(p);
      const entry = byEndpoint.get(k) ?? { point: p, walls: [] };
      entry.walls.push(w);
      byEndpoint.set(k, entry);
    }
  }
  const fills: React.ReactNode[] = [];
  let idx = 0;
  for (const [, { point, walls: connected }] of byEndpoint) {
    if (connected.length < 2) continue;
    const pts = getCornerFillPoints(point, connected);
    if (pts.length < 3) continue;
    const screenPts = pts.flatMap((p) => {
      const s = metersToScreen(p, view);
      return [s.x, s.y];
    });
    // Color: use the "most dominant" wall fill color (first non-demolish)
    const dominantWall = connected.find((w) => w.status !== "demolish") ?? connected[0];
    const fill = WALL_FILL[dominantWall.status] ?? "#d6d0c4";
    fills.push(
      <Line key={`cf-${idx++}`} points={screenPts} closed fill={fill} stroke="none" strokeWidth={0} listening={false} />,
    );
  }
  return fills;
}

export function WallsLayer({ view, walls, selectedId, onSelect, onMoveEndpoint, onEditLength }: Props) {
  return (
    <Layer>
      {/* Corner fill patches — rendered BEFORE walls so walls overlay on top */}
      {buildCornerFills(walls, view)}
      {walls.map((w) => {
        const polyPts = wallPolygonPoints(w, view);
        if (polyPts.length === 0) return null;

        const a = metersToScreen(w.start, view);
        const b = metersToScreen(w.end, view);
        const selected = w.id === selectedId;
        const lenM = dist(w.start, w.end);
        const lenPx = Math.hypot(b.x - a.x, b.y - a.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

        const fill   = WALL_FILL[w.status]   ?? "#d6d0c4";
        const stroke = WALL_STROKE[w.status] ?? "#a09890";
        const isDemolish = w.status === "demolish";

        // Loodrechte offset voor maataanduiding
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const OFFSET = 24;
        const nx = (-dy / len) * OFFSET;
        const ny = (dx / len) * OFFSET;

        return (
          <Fragment key={w.id}>
            {/* Selectie-highlight: iets groter dan de muur */}
            {selected && (
              <Line
                points={polyPts}
                closed
                fill="rgba(251,146,60,0.25)"
                stroke="#fb923c"
                strokeWidth={4}
                listening={false}
              />
            )}

            {/* Gevulde wandrechthoek */}
            <Line
              id={w.id}
              name="wall"
              points={polyPts}
              closed
              fill={fill}
              stroke={stroke}
              strokeWidth={w.loadBearing ? 2 : 1}
              dash={isDemolish ? [6, 4] : undefined}
              hitStrokeWidth={10}
              onClick={() => onSelect(w.id)}
              onTap={() => onSelect(w.id)}
            />

            {/* Dragende muur: extra donkere binnenrand */}
            {w.loadBearing && (
              <Line
                points={polyPts}
                closed
                fill="transparent"
                stroke="#0c0a09"
                strokeWidth={1.5}
                dash={[6, 4]}
                listening={false}
              />
            )}

            {/* Eindpunt-dots (niet bij selectie) */}
            {!selected && (
              <>
                <Circle x={a.x} y={a.y} radius={3.2} fill="#1c1917" listening={false} />
                <Circle x={b.x} y={b.y} radius={3.2} fill="#1c1917" listening={false} />
              </>
            )}

            {/* Drag handles bij selectie */}
            {selected && onMoveEndpoint && (
              <>
                <Circle
                  x={a.x}
                  y={a.y}
                  radius={9}
                  fill="#ea580c"
                  stroke="#fff"
                  strokeWidth={2}
                  draggable
                  onDragEnd={(e: KonvaEventObject<DragEvent>) => {
                    onMoveEndpoint(w.id, "start", e.target.x(), e.target.y());
                    e.target.position({ x: a.x, y: a.y });
                  }}
                />
                <Circle
                  x={b.x}
                  y={b.y}
                  radius={9}
                  fill="#ea580c"
                  stroke="#fff"
                  strokeWidth={2}
                  draggable
                  onDragEnd={(e: KonvaEventObject<DragEvent>) => {
                    onMoveEndpoint(w.id, "end", e.target.x(), e.target.y());
                    e.target.position({ x: b.x, y: b.y });
                  }}
                />
              </>
            )}

            {/* Lengte-label bij niet-geselecteerde muren — klikbaar om te bewerken */}
            {lenPx >= 34 && !selected && (
              <Label
                x={mid.x}
                y={mid.y}
                opacity={0.96}
                onClick={() => onEditLength?.(w.id)}
                onTap={() => onEditLength?.(w.id)}
                style={{ cursor: "pointer" }}
              >
                <Tag
                  fill={onEditLength ? "#e8f0fe" : "#fbfaf6"}
                  stroke={onEditLength ? "#93c5fd" : "#ddd7ca"}
                  strokeWidth={1}
                  cornerRadius={3}
                />
                <Text
                  text={formatLength(lenM)}
                  fontSize={11}
                  fontFamily="monospace"
                  fill={onEditLength ? "#1d4ed8" : "#1c1917"}
                  padding={3}
                />
              </Label>
            )}

            {/* Architecturaal dimensie-label bij geselecteerde muur */}
            {selected && lenPx >= 20 && (
              <>
                <Line
                  points={[a.x, a.y, a.x + nx, a.y + ny]}
                  stroke="#ea580c"
                  strokeWidth={1}
                  dash={[3, 3]}
                  listening={false}
                />
                <Line
                  points={[b.x, b.y, b.x + nx, b.y + ny]}
                  stroke="#ea580c"
                  strokeWidth={1}
                  dash={[3, 3]}
                  listening={false}
                />
                <Line
                  points={[a.x + nx, a.y + ny, b.x + nx, b.y + ny]}
                  stroke="#ea580c"
                  strokeWidth={1.5}
                  listening={false}
                />
                <Line
                  points={[
                    a.x + nx - (dy / len) * 5, a.y + ny + (dx / len) * 5,
                    a.x + nx + (dy / len) * 5, a.y + ny - (dx / len) * 5,
                  ]}
                  stroke="#ea580c"
                  strokeWidth={1.5}
                  listening={false}
                />
                <Line
                  points={[
                    b.x + nx - (dy / len) * 5, b.y + ny + (dx / len) * 5,
                    b.x + nx + (dy / len) * 5, b.y + ny - (dx / len) * 5,
                  ]}
                  stroke="#ea580c"
                  strokeWidth={1.5}
                  listening={false}
                />
                <Label
                  x={mid.x + nx}
                  y={mid.y + ny}
                  offsetX={0}
                  offsetY={10}
                  listening={false}
                >
                  <Tag fill="#ea580c" cornerRadius={3} />
                  <Text
                    text={formatLength(lenM)}
                    fontSize={11}
                    fontFamily="monospace"
                    fill="#fff"
                    padding={3}
                  />
                </Label>
              </>
            )}
          </Fragment>
        );
      })}
    </Layer>
  );
}
