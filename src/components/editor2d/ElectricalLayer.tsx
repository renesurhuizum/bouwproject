"use client";

// Elektra-laag. Markers met constante schermgrootte, korte code + hoogtelabel.

import { Fragment } from "react";
import { Layer, Circle, Rect, Label, Tag, Text } from "react-konva";
import type { ElectricalItem, ElectricalType } from "@/lib/domain/types";
import { formatHeight } from "@/lib/format";
import { metersToScreen, type ViewState } from "./viewport";

const CODE: Record<ElectricalType, string> = {
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
  view: ViewState;
  items: ElectricalItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ElectricalLayer({ view, items, selectedId, onSelect }: Props) {
  return (
    <Layer>
      {items.map((it) => {
        const p = metersToScreen(it.position, view);
        const selected = it.id === selectedId;
        const r = 11;
        return (
          <Fragment key={it.id}>
            {selected && (
              <Circle x={p.x} y={p.y} radius={r + 5} fill="#fb923c" opacity={0.5} listening={false} />
            )}
            {it.type === "switch" || it.type === "panel" ? (
              <Rect
                x={p.x - r}
                y={p.y - r}
                width={r * 2}
                height={r * 2}
                cornerRadius={4}
                fill="#1d4ed8"
                onClick={() => onSelect(it.id)}
                onTap={() => onSelect(it.id)}
              />
            ) : (
              <Circle
                x={p.x}
                y={p.y}
                radius={r}
                fill="#1d4ed8"
                onClick={() => onSelect(it.id)}
                onTap={() => onSelect(it.id)}
              />
            )}
            <Text
              text={CODE[it.type]}
              x={p.x - r}
              y={p.y - 6}
              width={r * 2}
              align="center"
              fontSize={11}
              fontStyle="bold"
              fontFamily="monospace"
              fill="#ffffff"
              listening={false}
            />
            <Label x={p.x} y={p.y + r + 2} listening={false}>
              <Tag fill="#e8effc" cornerRadius={2} />
              <Text
                text={formatHeight(it.heightZ)}
                fontSize={9}
                fontFamily="monospace"
                fill="#1d4ed8"
                padding={2}
              />
            </Label>
          </Fragment>
        );
      })}
    </Layer>
  );
}
