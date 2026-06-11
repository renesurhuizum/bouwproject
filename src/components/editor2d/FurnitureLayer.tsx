"use client";

import { Layer, Rect, Text, Group, Circle } from "react-konva";
import { metersToScreen, metersToPx, type ViewState } from "./viewport";
import type { Furniture } from "@/lib/domain/types";
import { FURNITURE_DEFAULTS } from "@/lib/domain/furniture";
import { FurnitureSymbol } from "./furnitureSymbols";

interface Props {
  view: ViewState;
  furniture: Furniture[];
  selectedId: string | null;
  multiSelectedIds?: string[];
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
}

export function FurnitureLayer({ view, furniture, selectedId, multiSelectedIds, onSelect, onMove }: Props) {
  return (
    <Layer>
      {furniture.map((item) => {
        const def = FURNITURE_DEFAULTS[item.kind];
        const w = item.width ?? def.w;
        const d = item.depth ?? def.d;
        const screenPos = metersToScreen(item.position, view);
        const sw = metersToPx(w, view);
        const sd = metersToPx(d, view);
        const selected = item.id === selectedId;
        const multiSelected = multiSelectedIds?.includes(item.id) && !selected;

        return (
          <Group
            key={item.id}
            x={screenPos.x}
            y={screenPos.y}
            rotation={item.rotation}
            offsetX={sw / 2}
            offsetY={sd / 2}
            draggable
            onClick={() => onSelect(item.id)}
            onTap={() => onSelect(item.id)}
            onDragEnd={(e) => {
              const stage = e.target.getStage();
              if (!stage) return;
              const pos = e.target.absolutePosition();
              // convert back to meters
              const mx = (pos.x - view.x) / (view.scale * 50);
              const my = (pos.y - view.y) / (view.scale * 50);
              onMove(item.id, mx, my);
            }}
          >
            <Rect
              width={sw}
              height={sd}
              fill={item.color ?? def.color}
              stroke={selected ? "#ea580c" : multiSelected ? "#3b82f6" : "#8b7355"}
              strokeWidth={selected || multiSelected ? 2 : 1}
              cornerRadius={2}
              opacity={0.85}
            />
            <FurnitureSymbol
              kind={item.kind}
              sw={sw}
              sd={sd}
              color={item.color ?? def.color}
              stroke="#5c4a35"
            />
            {sw < 28 && (
              <Text
                text={def.label}
                fontSize={Math.max(8, Math.min(12, sw / 6))}
                fill="#4a3728"
                width={sw}
                height={sd}
                align="center"
                verticalAlign="middle"
                listening={false}
              />
            )}
            {selected && (
              <>
                <Circle x={0}   y={0}   radius={5} fill="#ea580c" />
                <Circle x={sw}  y={0}   radius={5} fill="#ea580c" />
                <Circle x={0}   y={sd}  radius={5} fill="#ea580c" />
                <Circle x={sw}  y={sd}  radius={5} fill="#ea580c" />
              </>
            )}
          </Group>
        );
      })}
    </Layer>
  );
}
