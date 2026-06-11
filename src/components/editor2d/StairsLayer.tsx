"use client";

import { Layer, Group, Line, Circle, Arrow, Text } from "react-konva";
import type { Staircase } from "@/lib/domain/types";
import { metersToScreen, type ViewState } from "./viewport";

interface Props {
  view: ViewState;
  stairs: Staircase[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function StairsLayer({ view, stairs, selectedId, onSelect }: Props) {
  return (
    <Layer>
      {stairs.map((stair) => (
        <StairSymbol key={stair.id} stair={stair} view={view} selected={stair.id === selectedId} onSelect={onSelect} />
      ))}
    </Layer>
  );
}

function StairSymbol({
  stair,
  view,
  selected,
  onSelect,
}: {
  stair: Staircase;
  view: ViewState;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const s = metersToScreen(stair.position, view);
  const scaleX = view.scale * 50; // px per m
  const W = stair.width * scaleX;
  const R = stair.run * scaleX;
  const numSteps = stair.steps;
  const stepH = R / numSteps;

  const treadLines: number[] = [];
  for (let i = 0; i <= numSteps; i++) {
    const y = i * stepH;
    treadLines.push(0, y, W, y);
  }

  // Pijl in het midden die de looprichting aangeeft
  const arrowY = stair.direction === "up" ? R * 0.85 : R * 0.15;
  const arrowFrom = { x: W / 2, y: stair.direction === "up" ? R * 0.15 : R * 0.85 };
  const arrowTo = { x: W / 2, y: arrowY };

  const rot = stair.rotation ?? 0;

  return (
    <Group
      x={s.x}
      y={s.y}
      rotation={rot}
      onClick={() => onSelect(stair.id)}
      onTap={() => onSelect(stair.id)}
    >
      {/* Buitenomtrek */}
      <Line
        points={[0, 0, W, 0, W, R, 0, R, 0, 0]}
        stroke={selected ? "#ea580c" : "#374151"}
        strokeWidth={selected ? 2 : 1.5}
        closed
        fill="rgba(209,213,219,0.3)"
      />
      {/* Treden */}
      {Array.from({ length: numSteps - 1 }, (_, i) => (
        <Line
          key={i}
          points={[0, (i + 1) * stepH, W, (i + 1) * stepH]}
          stroke={selected ? "#ea580c" : "#6b7280"}
          strokeWidth={1}
        />
      ))}
      {/* Looprichtingpijl */}
      <Arrow
        points={[arrowFrom.x, arrowFrom.y, arrowTo.x, arrowTo.y]}
        stroke={selected ? "#ea580c" : "#374151"}
        strokeWidth={1.5}
        pointerLength={6}
        pointerWidth={5}
        fill={selected ? "#ea580c" : "#374151"}
      />
      {/* Label */}
      <Text
        text={stair.direction === "up" ? "op" : "af"}
        x={W / 2 - 8}
        y={R / 2 - 6}
        fontSize={Math.max(9, scaleX * 0.18)}
        fill={selected ? "#ea580c" : "#6b7280"}
      />
    </Group>
  );
}
