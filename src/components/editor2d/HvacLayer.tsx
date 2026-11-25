"use client";

// HVAC-laag: radiatoren, vloerverwarming, ventilatie en WTW-units.

import { Layer, Rect, Circle, Line, Group, Text, Label, Tag } from "react-konva";
import type { HvacItem } from "@/lib/domain/types";
import { HVAC_COLOR, HVAC_CODE } from "@/lib/domain/constants";
import { formatHeight } from "@/lib/format";
import { DraggableEntity } from "./DraggableEntity";
import { metersToScreen, metersToPx, type ViewState } from "./viewport";

interface Props {
  view: ViewState;
  items: HvacItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function toFlat(pts: { x: number; y: number }[], view: ViewState): number[] {
  return pts.flatMap((p) => {
    const s = metersToScreen(p, view);
    return [s.x, s.y];
  });
}

export function HvacLayer({ view, items, selectedId, onSelect }: Props) {
  const pathItems = items.filter((it) => it.path && it.path.length >= 2);
  const pointItems = items.filter((it) => it.position);

  return (
    <Layer>
      {/* CV-leidingen als pad (type cv-pipe met path) */}
      {pathItems.map((item) => {
        const color = HVAC_COLOR[item.type];
        const selected = item.id === selectedId;
        return (
          <DraggableEntity
            key={item.id}
            kind="hvac"
            entity={item}
            anchor={item.path![0]}
            view={view}
            onSelect={onSelect}
          >
            <Line
              points={toFlat(item.path!, view)}
              stroke={selected ? "#ea580c" : color}
              strokeWidth={selected ? 4 : 3}
              lineCap="round"
              lineJoin="round"
            />
            <Text
              x={(() => { const p = metersToScreen(item.path![Math.floor(item.path!.length / 2)], view); return p.x - 8; })()}
              y={(() => { const p = metersToScreen(item.path![Math.floor(item.path!.length / 2)], view); return p.y - 10; })()}
              text={HVAC_CODE[item.type]}
              fontSize={9}
              fontStyle="bold"
              fontFamily="monospace"
              fill={color}
              listening={false}
            />
          </DraggableEntity>
        );
      })}

      {pointItems.map((item) => {
        if (!item.position) return null;
        const p = metersToScreen(item.position, view);
        const selected = item.id === selectedId;
        const color = HVAC_COLOR[item.type];
        const code = HVAC_CODE[item.type];
        const r = metersToPx(0.15, view);

        return (
          <DraggableEntity
            key={item.id}
            kind="hvac"
            entity={item}
            anchor={item.position}
            view={view}
            onSelect={onSelect}
          >
            {selected && (
              <Circle x={p.x} y={p.y} radius={r + 6} fill={color} opacity={0.3} listening={false} />
            )}

            {item.type === "radiator" ? (
              <RadiatorSymbol cx={p.x} cy={p.y} r={r} color={color} selected={selected} />
            ) : (
              <Circle x={p.x} y={p.y} radius={r} fill={color} />
            )}

            <Text
              text={code}
              x={p.x - r}
              y={p.y - 5}
              width={r * 2}
              align="center"
              fontSize={Math.max(7, Math.min(10, r * 0.7))}
              fontStyle="bold"
              fontFamily="monospace"
              fill="#ffffff"
              listening={false}
            />

            {item.heightZ != null && item.heightZ > 0 && (
              <Label x={p.x} y={p.y + r + 2} listening={false}>
                <Tag fill="#fef3c7" cornerRadius={2} />
                <Text
                  text={formatHeight(item.heightZ)}
                  fontSize={9}
                  fontFamily="monospace"
                  fill={color}
                  padding={2}
                />
              </Label>
            )}
          </DraggableEntity>
        );
      })}
    </Layer>
  );
}

function RadiatorSymbol({
  cx,
  cy,
  r,
  color,
  selected,
}: {
  cx: number;
  cy: number;
  r: number;
  color: string;
  selected: boolean;
}) {
  const w = r * 2.4;
  const h = r * 1.2;
  const fins = 4;

  return (
    <Group>
      {/* Buitenkader */}
      <Rect
        x={cx - w / 2}
        y={cy - h / 2}
        width={w}
        height={h}
        fill={selected ? color : color + "cc"}
        cornerRadius={3}
      />
      {/* Ribbels */}
      {Array.from({ length: fins }).map((_, i) => {
        const x = cx - w / 2 + ((i + 1) * w) / (fins + 1);
        return (
          <Line
            key={i}
            points={[x, cy - h / 2 + 3, x, cy + h / 2 - 3]}
            stroke="#ffffff"
            strokeWidth={1.5}
            opacity={0.6}
            listening={false}
          />
        );
      })}
    </Group>
  );
}
