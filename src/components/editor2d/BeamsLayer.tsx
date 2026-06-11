"use client";

import { Layer, Group, Line } from "react-konva";
import type { Beam } from "@/lib/domain/types";
import { metersToScreen, type ViewState } from "./viewport";
import { dist } from "@/lib/geometry";

interface Props {
  view: ViewState;
  beams: Beam[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const FLANGE_PX = 8; // breedte flanges in pixels

export function BeamsLayer({ view, beams, selectedId, onSelect }: Props) {
  return (
    <Layer>
      {beams.map((beam) => {
        const s = metersToScreen(beam.start, view);
        const e = metersToScreen(beam.end, view);
        const selected = beam.id === selectedId;
        const stroke = selected ? "#ea580c" : "#374151";
        const sw = selected ? 2 : 1.5;

        // I-profiel: twee flanges (dik) + één web (dun)
        const len = dist(s, e);
        if (len < 1) return null;
        const dx = (e.x - s.x) / len;
        const dy = (e.y - s.y) / len;
        const nx = -dy;
        const ny = dx;
        const f = FLANGE_PX / 2;

        return (
          <Group
            key={beam.id}
            onClick={() => onSelect(beam.id)}
            onTap={() => onSelect(beam.id)}
          >
            {/* Web (middenlijn) */}
            <Line
              points={[s.x, s.y, e.x, e.y]}
              stroke={stroke}
              strokeWidth={sw}
            />
            {/* Flange boven */}
            <Line
              points={[s.x + nx * f, s.y + ny * f, e.x + nx * f, e.y + ny * f]}
              stroke={stroke}
              strokeWidth={sw * 2}
            />
            {/* Flange onder */}
            <Line
              points={[s.x - nx * f, s.y - ny * f, e.x - nx * f, e.y - ny * f]}
              stroke={stroke}
              strokeWidth={sw * 2}
            />
            {/* Eindplaten */}
            <Line
              points={[s.x + nx * f, s.y + ny * f, s.x - nx * f, s.y - ny * f]}
              stroke={stroke}
              strokeWidth={sw}
            />
            <Line
              points={[e.x + nx * f, e.y + ny * f, e.x - nx * f, e.y - ny * f]}
              stroke={stroke}
              strokeWidth={sw}
            />
          </Group>
        );
      })}
    </Layer>
  );
}
