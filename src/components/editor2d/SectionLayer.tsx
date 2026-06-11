"use client";

import { Layer, Group, Line, Circle, Text } from "react-konva";
import type { SectionLine, Point } from "@/lib/domain/types";
import { metersToScreen, type ViewState } from "./viewport";

interface Props {
  view: ViewState;
  sections: SectionLine[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  draftPoints: Point[];
  cursor: Point | null;
}

export function SectionLayer({ view, sections, selectedId, onSelect, draftPoints, cursor }: Props) {
  return (
    <Layer>
      {sections.map((sec) => {
        const s = metersToScreen(sec.start, view);
        const e = metersToScreen(sec.end, view);
        const selected = sec.id === selectedId;
        const color = selected ? "#ea580c" : "#7c3aed";

        // Pijlpunten aan beide kanten (NEN-stijl: twee pijlen aan uiteinden)
        const len = Math.hypot(e.x - s.x, e.y - s.y);
        if (len < 1) return null;
        const nx = (e.x - s.x) / len;
        const ny = (e.y - s.y) / len;
        const perp = { x: -ny * 12, y: nx * 12 };

        return (
          <Group key={sec.id} onClick={() => onSelect(sec.id)} onTap={() => onSelect(sec.id)}>
            <Line
              points={[s.x, s.y, e.x, e.y]}
              stroke={color}
              strokeWidth={selected ? 2.5 : 2}
              dash={[12, 6]}
            />
            {/* Pijltje start */}
            <Line
              points={[s.x + perp.x, s.y + perp.y, s.x - perp.x, s.y - perp.y]}
              stroke={color} strokeWidth={2}
            />
            <Line
              points={[s.x - perp.x, s.y - perp.y, s.x - perp.x - nx * 14, s.y - perp.y - ny * 14]}
              stroke={color} strokeWidth={2}
            />
            {/* Pijltje einde */}
            <Line
              points={[e.x + perp.x, e.y + perp.y, e.x - perp.x, e.y - perp.y]}
              stroke={color} strokeWidth={2}
            />
            <Line
              points={[e.x + perp.x, e.y + perp.y, e.x + perp.x + nx * 14, e.y + perp.y + ny * 14]}
              stroke={color} strokeWidth={2}
            />
            {/* Label aan beide kanten */}
            <Text text={sec.label.split("-")[0]} x={s.x - 16} y={s.y - perp.y - 14} fontSize={11} fontStyle="bold" fill={color} />
            <Text text={sec.label.split("-")[1] ?? sec.label} x={e.x + 4} y={e.y + perp.y + 2} fontSize={11} fontStyle="bold" fill={color} />
          </Group>
        );
      })}

      {/* Draft sectielijn */}
      {draftPoints.length > 0 && cursor && (() => {
        const s = metersToScreen(draftPoints[0], view);
        const e = metersToScreen(cursor, view);
        return (
          <Group>
            <Line points={[s.x, s.y, e.x, e.y]} stroke="#7c3aed" strokeWidth={2} dash={[12, 6]} />
            <Circle x={s.x} y={s.y} radius={4} fill="#7c3aed" />
          </Group>
        );
      })()}
    </Layer>
  );
}
