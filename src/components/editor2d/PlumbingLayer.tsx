"use client";

// Water-laag. Toont leidingtrajecten (path) en sanitair/tappunten (position).

import { Fragment } from "react";
import { Layer, Line, Circle, Group, Text, Label, Tag } from "react-konva";
import type { PlumbingItem } from "@/lib/domain/types";
import { FIXTURE_CODE, PLUMBING_COLOR } from "@/lib/domain/constants";
import { formatHeight } from "@/lib/format";
import { metersToScreen, metersToPx, type ViewState } from "./viewport";

const PIPE_COLORS: Record<string, string> = {
  "supply-cold": "#3b82f6",
  "supply-hot":  "#ef4444",
  "drain":       "#8b5cf6",
  "cv-pipe":     "#f97316",
  "fixture":     PLUMBING_COLOR,
};

const PIPE_LABELS: Record<string, string> = {
  "supply-cold": "KW",
  "supply-hot":  "WW",
  "drain":       "AF",
  "cv-pipe":     "CV",
};

interface Props {
  view: ViewState;
  items: PlumbingItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  previewPath?: { points: { x: number; y: number }[]; type: string } | null;
}

function toScreenFlat(pts: { x: number; y: number }[], view: ViewState): number[] {
  return pts.flatMap((p) => {
    const s = metersToScreen(p, view);
    return [s.x, s.y];
  });
}

export function PlumbingLayer({ view, items, selectedId, onSelect, previewPath }: Props) {
  const pipes = items.filter((it) => it.path && it.path.length >= 2);
  const fixtures = items.filter((it) => it.type === "fixture" && it.position);

  return (
    <Layer>
      {/* Leidingtrajecten */}
      {pipes.map((item) => {
        const pts = toScreenFlat(item.path!, view);
        const color = PIPE_COLORS[item.type] ?? "#666";
        const selected = item.id === selectedId;
        const diameterM = (item.diameter ?? 20) / 1000;
        const strokeW = Math.max(2, Math.min(6, metersToPx(diameterM, view) * 2));

        // midpunt voor label
        const mid = Math.floor(item.path!.length / 2) - 1;
        const p1 = metersToScreen(item.path![Math.max(0, mid)], view);
        const p2 = metersToScreen(item.path![Math.min(item.path!.length - 1, mid + 1)], view);
        const lx = (p1.x + p2.x) / 2 - 8;
        const ly = (p1.y + p2.y) / 2 - 6;

        return (
          <Group
            key={item.id}
            onClick={() => onSelect(item.id)}
            onTap={() => onSelect(item.id)}
          >
            <Line
              id={item.id}
              name="plumbing"
              points={pts}
              stroke={selected ? "#ea580c" : color}
              strokeWidth={selected ? strokeW + 1 : strokeW}
              lineCap="round"
              lineJoin="round"
              dash={item.type === "drain" ? [8, 4] : undefined}
            />
            <Text
              x={lx}
              y={ly}
              text={PIPE_LABELS[item.type] ?? ""}
              fontSize={10}
              fill={color}
              fontStyle="bold"
              listening={false}
            />
          </Group>
        );
      })}

      {/* Preview tijdens tekenen */}
      {previewPath && previewPath.points.length >= 2 && (
        <Line
          points={toScreenFlat(previewPath.points, view)}
          stroke={PIPE_COLORS[previewPath.type] ?? "#666"}
          strokeWidth={3}
          lineCap="round"
          dash={[6, 3]}
          opacity={0.7}
          listening={false}
        />
      )}

      {/* Tappunten / sanitair */}
      {fixtures.map((item) => {
        if (!item.position) return null;
        const p = metersToScreen(item.position, view);
        const selected = item.id === selectedId;
        const r = 12;
        return (
          <Fragment key={item.id}>
            {selected && (
              <Circle x={p.x} y={p.y} radius={r + 5} fill="#fb923c" opacity={0.5} listening={false} />
            )}
            <Circle
              id={item.id}
              name="plumbing"
              x={p.x}
              y={p.y}
              radius={r}
              fill={PLUMBING_COLOR}
              onClick={() => onSelect(item.id)}
              onTap={() => onSelect(item.id)}
            />
            {item.fixture && (
              <Text
                text={FIXTURE_CODE[item.fixture]}
                x={p.x - r}
                y={p.y - 5}
                width={r * 2}
                align="center"
                fontSize={9}
                fontStyle="bold"
                fontFamily="monospace"
                fill="#ffffff"
                listening={false}
              />
            )}
            {item.heightZ != null && (
              <Label x={p.x} y={p.y + r + 2} listening={false}>
                <Tag fill="#cffafe" cornerRadius={2} />
                <Text
                  text={formatHeight(item.heightZ)}
                  fontSize={9}
                  fontFamily="monospace"
                  fill={PLUMBING_COLOR}
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
