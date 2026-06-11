"use client";

import { Layer, Group, Line, Text, Arrow } from "react-konva";
import type { Roof } from "@/lib/domain/types";
import { metersToScreen, type ViewState } from "./viewport";

interface Props {
  view: ViewState;
  roofs: Roof[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function RoofLayer({ view, roofs, selectedId, onSelect }: Props) {
  return (
    <Layer>
      {roofs.map((roof) => {
        const selected = roof.id === selectedId;
        if (!roof.polygon || roof.polygon.length < 3) {
          // Toon placeholder icoon als nog geen polygoon ingesteld
          return null;
        }
        const pts = roof.polygon.flatMap((p) => {
          const s = metersToScreen(p, view);
          return [s.x, s.y];
        });

        // Centroid voor labels
        const cx = roof.polygon.reduce((a, p) => a + p.x, 0) / roof.polygon.length;
        const cy = roof.polygon.reduce((a, p) => a + p.y, 0) / roof.polygon.length;
        const center = metersToScreen({ x: cx, y: cy }, view);

        // Nok-richting pijl
        const nokLen = 40;
        const nokRad = (roof.ridgeDirection * Math.PI) / 180;
        const nokEnd = {
          x: center.x + Math.cos(nokRad) * nokLen,
          y: center.y + Math.sin(nokRad) * nokLen,
        };

        return (
          <Group key={roof.id} onClick={() => onSelect(roof.id)} onTap={() => onSelect(roof.id)}>
            <Line
              points={pts}
              closed
              stroke={selected ? "#ea580c" : "#64748b"}
              strokeWidth={selected ? 2 : 1.5}
              dash={[10, 5]}
              fill={selected ? "rgba(234,88,12,0.06)" : "rgba(100,116,139,0.06)"}
            />
            {/* Nok-richting pijl */}
            <Arrow
              points={[center.x, center.y, nokEnd.x, nokEnd.y]}
              stroke={selected ? "#ea580c" : "#64748b"}
              strokeWidth={1.5}
              pointerLength={8}
              pointerWidth={6}
              fill={selected ? "#ea580c" : "#64748b"}
            />
            {/* Labels */}
            <Text
              x={center.x - 20}
              y={center.y - 8}
              text={`${roof.type} ${roof.pitch}°`}
              fontSize={10}
              fill={selected ? "#ea580c" : "#64748b"}
            />
          </Group>
        );
      })}
    </Layer>
  );
}
