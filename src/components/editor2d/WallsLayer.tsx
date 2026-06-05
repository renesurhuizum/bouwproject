"use client";

// Muren-laag. Tekent muren met echte dikte (schaalt mee met zoom), kleur per
// status, stippellijn bij sloop, en een markering bij dragende muren.

import { Fragment } from "react";
import { Layer, Line, Circle, Label, Tag, Text } from "react-konva";
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
}

export function WallsLayer({ view, walls, selectedId, onSelect }: Props) {
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
            <Circle x={a.x} y={a.y} radius={3.2} fill="#1c1917" listening={false} />
            <Circle x={b.x} y={b.y} radius={3.2} fill="#1c1917" listening={false} />
            {lenPx >= 34 && (
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
          </Fragment>
        );
      })}
    </Layer>
  );
}
