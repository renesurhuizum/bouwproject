"use client";

// Ruimtes-laag. Gevulde contouren met naam en oppervlak.

import { Fragment } from "react";
import { Layer, Line, Label, Tag, Text } from "react-konva";
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
        const c = metersToScreen(polygonCentroid(room.polygon), view);
        const selected = room.id === selectedId;
        return (
          <Fragment key={room.id}>
            <Line
              id={room.id}
              name="room"
              points={pts}
              closed
              fill={room.color ?? "rgba(234, 88, 12, 0.07)"}
              stroke={selected ? "#ea580c" : "rgba(234, 88, 12, 0.35)"}
              strokeWidth={selected ? 2 : 1}
              onClick={() => onSelect(room.id)}
              onTap={() => onSelect(room.id)}
            />
            <Label x={c.x} y={c.y} offsetX={0} offsetY={14} listening={false}>
              <Tag fill="#ffffff" stroke="#ddd7ca" strokeWidth={1} cornerRadius={4} />
              <Text
                text={`${room.name}\n${formatArea(area)}`}
                fontSize={11}
                fontFamily="sans-serif"
                fill="#1c1917"
                align="center"
                padding={4}
              />
            </Label>
          </Fragment>
        );
      })}
    </Layer>
  );
}
