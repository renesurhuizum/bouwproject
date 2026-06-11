"use client";

import { Layer, Circle, Rect } from "react-konva";
import type { Column } from "@/lib/domain/types";
import { metersToScreen, type ViewState } from "./viewport";

interface Props {
  view: ViewState;
  columns: Column[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ColumnsLayer({ view, columns, selectedId, onSelect }: Props) {
  return (
    <Layer>
      {columns.map((col) => {
        const s = metersToScreen(col.position, view);
        const r = col.size * view.scale * 50; // px radius
        const selected = col.id === selectedId;
        const fill = selected ? "rgba(234,88,12,0.25)" : "rgba(55,65,81,0.6)";
        const stroke = selected ? "#ea580c" : "#1f2937";

        return col.shape === "round" ? (
          <Circle
            key={col.id}
            x={s.x}
            y={s.y}
            radius={r / 2}
            fill={fill}
            stroke={stroke}
            strokeWidth={selected ? 2 : 1.5}
            onClick={() => onSelect(col.id)}
            onTap={() => onSelect(col.id)}
          />
        ) : (
          <Rect
            key={col.id}
            x={s.x - r / 2}
            y={s.y - r / 2}
            width={r}
            height={r}
            fill={fill}
            stroke={stroke}
            strokeWidth={selected ? 2 : 1.5}
            onClick={() => onSelect(col.id)}
            onTap={() => onSelect(col.id)}
          />
        );
      })}
    </Layer>
  );
}
