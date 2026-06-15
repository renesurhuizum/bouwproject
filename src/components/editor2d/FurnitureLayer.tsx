"use client";

import { Fragment } from "react";
import { Layer, Rect, Text, Group, Circle, Line } from "react-konva";
import { metersToScreen, metersToPx, type ViewState } from "./viewport";
import type { Furniture } from "@/lib/domain/types";
import { FURNITURE_DEFAULTS } from "@/lib/domain/furniture";

interface Props {
  view: ViewState;
  furniture: Furniture[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onRotate?: (id: string, rotation: number) => void;
}

const HANDLE_DIST = 28; // px boven het meubel

export function FurnitureLayer({ view, furniture, selectedId, onSelect, onMove, onRotate }: Props) {
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

        // Rotatie-handle in schermcoördinaten (boven het midden, meedraaiend).
        const halfDiag = Math.hypot(sw, sd) / 2;
        const handleRad = ((item.rotation - 90) * Math.PI) / 180;
        const handleX = screenPos.x + (halfDiag + HANDLE_DIST) * Math.cos(handleRad);
        const handleY = screenPos.y + (halfDiag + HANDLE_DIST) * Math.sin(handleRad);

        return (
          <Fragment key={item.id}>
            <Group
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
                stroke={selected ? "#ea580c" : "#8b7355"}
                strokeWidth={selected ? 2 : 1}
                cornerRadius={3}
                opacity={0.85}
              />
              <Text
                text={def.label}
                fontSize={Math.max(8, Math.min(12, sw / 6))}
                fill="#4a3728"
                width={sw}
                height={sd}
                align="center"
                verticalAlign="middle"
              />
              {selected && (
                <>
                  <Circle x={0}   y={0}   radius={5} fill="#ea580c" />
                  <Circle x={sw}  y={0}   radius={5} fill="#ea580c" />
                  <Circle x={0}   y={sd}  radius={5} fill="#ea580c" />
                  <Circle x={sw}  y={sd}  radius={5} fill="#ea580c" />
                </>
              )}
            </Group>

            {/* Vrije rotatie-handle (alleen bij selectie) */}
            {selected && onRotate && (
              <>
                <Line
                  points={[screenPos.x, screenPos.y, handleX, handleY]}
                  stroke="#ea580c"
                  strokeWidth={1}
                  dash={[3, 3]}
                  listening={false}
                />
                <Circle
                  x={handleX}
                  y={handleY}
                  radius={6}
                  fill="#fff"
                  stroke="#ea580c"
                  strokeWidth={2}
                  draggable
                  onDragMove={(e) => {
                    const node = e.target;
                    let ang =
                      (Math.atan2(node.y() - screenPos.y, node.x() - screenPos.x) * 180) /
                        Math.PI +
                      90;
                    if (e.evt.shiftKey) ang = Math.round(ang / 15) * 15;
                    onRotate(item.id, ((Math.round(ang) % 360) + 360) % 360);
                  }}
                  onDragEnd={(e) => {
                    // Terug naar de getetherde positie; rotatie zit al in de data.
                    e.target.position({ x: handleX, y: handleY });
                  }}
                />
              </>
            )}
          </Fragment>
        );
      })}
    </Layer>
  );
}
