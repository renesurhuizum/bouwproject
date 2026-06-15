"use client";

// Kolommen in bovenaanzicht: gevuld vierkant of gevulde cirkel, met markering
// voor dragend. Selecteerbaar.

import { Fragment } from "react";
import { Layer, Rect, Circle } from "react-konva";
import type { Column } from "@/lib/domain/types";
import { metersToScreen, metersToPx, type ViewState } from "./viewport";

interface Props {
  view: ViewState;
  columns: Column[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const FILL = "#9ca3af";
const STROKE = "#0f766e";

export function ColumnsLayer({ view, columns, selectedId, onSelect }: Props) {
  return (
    <Layer>
      {columns.map((c) => {
        const pos = metersToScreen(c.position, view);
        const sz = metersToPx(c.size, view);
        const selected = c.id === selectedId;
        const stroke = selected ? "#ea580c" : STROKE;
        const sw = selected ? 3 : c.loadBearing ? 2 : 1.2;
        return (
          <Fragment key={c.id}>
            {c.shape === "round" ? (
              <Circle
                id={c.id}
                name="column"
                x={pos.x}
                y={pos.y}
                radius={sz / 2}
                fill={FILL}
                stroke={stroke}
                strokeWidth={sw}
                onClick={() => onSelect(c.id)}
                onTap={() => onSelect(c.id)}
              />
            ) : (
              <Rect
                id={c.id}
                name="column"
                x={pos.x - sz / 2}
                y={pos.y - sz / 2}
                width={sz}
                height={sz}
                fill={FILL}
                stroke={stroke}
                strokeWidth={sw}
                onClick={() => onSelect(c.id)}
                onTap={() => onSelect(c.id)}
              />
            )}
          </Fragment>
        );
      })}
    </Layer>
  );
}
