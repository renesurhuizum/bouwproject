"use client";

// Muren-laag. Tekent muren met echte dikte (schaalt mee met zoom), kleur per
// status, stippellijn bij sloop, en een markering bij dragende muren.
// Bij geselecteerde muur: draggable eindpunt-handles zodat je muren kunt aanpassen.

import { Fragment } from "react";
import { Layer, Line, Circle, Label, Tag, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Wall } from "@/lib/domain/types";
import { WALL_STATUS_COLOR } from "@/lib/domain/constants";
import { dist } from "@/lib/geometry";
import { formatLength } from "@/lib/format";
import { metersToScreen, metersToPx, type ViewState } from "./viewport";

interface Props {
  view: ViewState;
  walls: Wall[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMoveEndpoint?: (wallId: string, which: "start" | "end", screenX: number, screenY: number) => void;
}

export function WallsLayer({ view, walls, selectedId, onSelect, onMoveEndpoint }: Props) {
  return (
    <Layer>
      {walls.map((w) => {
        const a = metersToScreen(w.start, view);
        const b = metersToScreen(w.end, view);
        const pts = [a.x, a.y, b.x, b.y];
        const widthPx = Math.max(2, metersToPx(w.thickness, view));
        const color = WALL_STATUS_COLOR[w.status];
        const selected = w.id === selectedId;
        const lenPx = Math.hypot(b.x - a.x, b.y - a.y);
        const lenM = dist(w.start, w.end);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

        // Loodrechte offset voor maataanduiding bij geselecteerde muur.
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        // Normaal loodrecht (naar boven/links), 24px offset.
        const OFFSET = 24;
        const nx = (-dy / len) * OFFSET;
        const ny = (dx / len) * OFFSET;

        return (
          <Fragment key={w.id}>
            {selected && (
              <Line
                points={pts}
                stroke="#fb923c"
                strokeWidth={widthPx + 9}
                opacity={0.5}
                lineCap="round"
                listening={false}
              />
            )}
            <Line
              id={w.id}
              name="wall"
              points={pts}
              stroke={color}
              strokeWidth={widthPx}
              dash={
                w.status === "demolish"
                  ? [metersToPx(0.2, view), metersToPx(0.12, view)]
                  : undefined
              }
              lineCap="square"
              hitStrokeWidth={Math.max(widthPx, 18)}
              onClick={() => onSelect(w.id)}
              onTap={() => onSelect(w.id)}
            />
            {w.loadBearing && (
              <Line
                points={pts}
                stroke="#0c0a09"
                strokeWidth={1.5}
                dash={[6, 4]}
                listening={false}
              />
            )}

            {/* Eindpunt-dots (altijd zichtbaar) */}
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
                    // Zet visuele positie terug; DB-update triggert re-render.
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

            {lenPx >= 34 && !selected && (
              <Label x={mid.x} y={mid.y} listening={false} opacity={0.96}>
                <Tag fill="#fbfaf6" stroke="#ddd7ca" strokeWidth={1} cornerRadius={3} />
                <Text
                  text={formatLength(lenM)}
                  fontSize={11}
                  fontFamily="monospace"
                  fill="#1c1917"
                  padding={3}
                />
              </Label>
            )}

            {/* Architecturaal dimensie-label bij geselecteerde muur */}
            {selected && lenPx >= 20 && (
              <>
                {/* Uitsteker bij eindpunt A */}
                <Line
                  points={[a.x, a.y, a.x + nx, a.y + ny]}
                  stroke="#ea580c"
                  strokeWidth={1}
                  dash={[3, 3]}
                  listening={false}
                />
                {/* Uitsteker bij eindpunt B */}
                <Line
                  points={[b.x, b.y, b.x + nx, b.y + ny]}
                  stroke="#ea580c"
                  strokeWidth={1}
                  dash={[3, 3]}
                  listening={false}
                />
                {/* Maatlijn parallel aan de muur */}
                <Line
                  points={[a.x + nx, a.y + ny, b.x + nx, b.y + ny]}
                  stroke="#ea580c"
                  strokeWidth={1.5}
                  listening={false}
                />
                {/* Eindtikken */}
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
                {/* Maat-label */}
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
