"use client";

import { Fragment } from "react";
import { Layer, Line, Text, Rect, Group } from "react-konva";
import type { Room } from "@/lib/domain/types";
import { polygonArea, polygonCentroid } from "@/lib/geometry";
import { formatArea } from "@/lib/format";
import { metersToScreen, type ViewState } from "./viewport";

interface Props {
  view: ViewState;
  rooms: Room[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function hexToRgba(color: string, alpha: number): string {
  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

export function RoomsLayer({ view, rooms, selectedId, onSelect }: Props) {
  return (
    <Layer>
      {rooms.map((room) => {
        if (room.polygon.length < 3) return null;

        const pts = room.polygon.flatMap((p) => {
          const s = metersToScreen(p, view);
          return [s.x, s.y];
        });

        const area = polygonArea(room.polygon);
        const areaLabel = formatArea(area);
        const c = metersToScreen(polygonCentroid(room.polygon), view);
        const selected = room.id === selectedId;

        const fillColor = room.color
          ? hexToRgba(room.color, selected ? 0.45 : 0.28)
          : `rgba(234, 88, 12, ${selected ? 0.14 : 0.07})`;
        const strokeColor = room.color
          ? hexToRgba(room.color, selected ? 0.9 : 0.55)
          : selected
            ? "rgba(234, 88, 12, 0.9)"
            : "rgba(234, 88, 12, 0.35)";

        const labelW = Math.max(room.name.length * 6.5 + 16, 80);
        const labelH = 34;

        return (
          <Fragment key={room.id}>
            <Line
              id={room.id}
              name="room"
              points={pts}
              closed
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={selected ? 2 : 1}
              onClick={() => onSelect(room.id)}
              onTap={() => onSelect(room.id)}
            />
            <Group
              x={c.x - labelW / 2}
              y={c.y - labelH / 2}
              listening={false}
            >
              <Rect
                width={labelW}
                height={labelH}
                fill="rgba(255,255,255,0.88)"
                stroke="rgba(0,0,0,0.08)"
                strokeWidth={1}
                cornerRadius={5}
              />
              <Text
                text={room.name}
                width={labelW}
                y={5}
                fontSize={11}
                fontStyle="600"
                fontFamily="system-ui, sans-serif"
                fill="#1c1917"
                align="center"
              />
              <Text
                text={areaLabel}
                width={labelW}
                y={19}
                fontSize={9}
                fontFamily="system-ui, sans-serif"
                fill="#78716c"
                align="center"
              />
            </Group>
          </Fragment>
        );
      })}
    </Layer>
  );
}
