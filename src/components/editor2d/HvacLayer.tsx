"use client";

// HVAC-laag: radiatoren, vloerverwarming, ventilatie en WTW-units.

import { Fragment } from "react";
import { Layer, Rect, Circle, Line, Group, Text, Label, Tag } from "react-konva";
import type { HvacItem } from "@/lib/domain/types";
import { HVAC_COLOR, HVAC_CODE } from "@/lib/domain/constants";
import { formatHeight } from "@/lib/format";
import { metersToScreen, metersToPx, type ViewState } from "./viewport";

interface Props {
  view: ViewState;
  items: HvacItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function HvacLayer({ view, items, selectedId, onSelect }: Props) {
  return (
    <Layer>
      {items.map((item) => {
        if (!item.position) return null;
        const p = metersToScreen(item.position, view);
        const selected = item.id === selectedId;
        const color = HVAC_COLOR[item.type];
        const code = HVAC_CODE[item.type];
        const r = metersToPx(0.15, view);

        return (
          <Fragment key={item.id}>
            {selected && (
              <Circle x={p.x} y={p.y} radius={r + 6} fill={color} opacity={0.3} listening={false} />
            )}

            {item.type === "radiator" ? (
              <RadiatorSymbol
                id={item.id}
                cx={p.x}
                cy={p.y}
                r={r}
                color={color}
                selected={selected}
                onSelect={() => onSelect(item.id)}
              />
            ) : (
              <Circle
                id={item.id}
                name="hvac"
                x={p.x}
                y={p.y}
                radius={r}
                fill={color}
                onClick={() => onSelect(item.id)}
                onTap={() => onSelect(item.id)}
              />
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
          </Fragment>
        );
      })}
    </Layer>
  );
}

function RadiatorSymbol({
  id,
  cx,
  cy,
  r,
  color,
  selected,
  onSelect,
}: {
  id: string;
  cx: number;
  cy: number;
  r: number;
  color: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const w = r * 2.4;
  const h = r * 1.2;
  const fins = 4;

  return (
    <Group id={id} name="hvac" onClick={onSelect} onTap={onSelect}>
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
