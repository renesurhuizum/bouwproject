"use client";

// Water-laag. Toont leidingtrajecten (path) en sanitair/tappunten (position).

import { Fragment } from "react";
import { Layer, Line, Circle, Ellipse, Rect, Group, Text, Label, Tag } from "react-konva";
import type { PlumbingItem, FixtureKind } from "@/lib/domain/types";
import { FIXTURE_CODE, PLUMBING_COLOR } from "@/lib/domain/constants";
import { formatHeight } from "@/lib/format";
import { metersToScreen, metersToPx, type ViewState } from "./viewport";

// Werkelijke voetafdruk (m) per sanitair-soort, voor het bouwtekening-symbool.
const FIXTURE_SIZE: Record<FixtureKind, { w: number; h: number }> = {
  toilet:            { w: 0.42, h: 0.68 },
  sink:              { w: 0.55, h: 0.45 },
  shower:            { w: 0.90, h: 0.90 },
  bath:              { w: 1.70, h: 0.75 },
  "kitchen-tap":     { w: 0.30, h: 0.30 },
  "washing-machine": { w: 0.60, h: 0.60 },
  boiler:            { w: 0.45, h: 0.45 },
  "outdoor-tap":     { w: 0.25, h: 0.25 },
};

// Bovenaanzicht-symbool per sanitair-soort, getekend in (0,0)–(w,h) px.
// Puur tekenwerk; alle shapes listening={false} — de hit-Rect van de caller vangt clicks.
function FixtureSymbol({ kind, w, h }: { kind: FixtureKind; w: number; h: number }) {
  const s = PLUMBING_COLOR;
  const sw = 1.2;
  const common = { stroke: s, strokeWidth: sw, listening: false as const };

  switch (kind) {
    case "toilet":
      return (
        <>
          {/* stortbak */}
          <Rect x={w * 0.06} y={0} width={w * 0.88} height={h * 0.26} cornerRadius={2}
            fill="#ffffff" opacity={0.9} {...common} />
          {/* pot */}
          <Ellipse x={w * 0.5} y={h * 0.6} radiusX={w * 0.33} radiusY={h * 0.32}
            fill="#ffffff" opacity={0.9} {...common} />
          {/* bril */}
          <Ellipse x={w * 0.5} y={h * 0.62} radiusX={w * 0.22} radiusY={h * 0.22}
            {...common} strokeWidth={0.8} />
        </>
      );
    case "sink":
      return (
        <>
          <Rect x={0} y={0} width={w} height={h} cornerRadius={2}
            fill="#ffffff" opacity={0.85} {...common} />
          {/* kom */}
          <Ellipse x={w * 0.5} y={h * 0.56} radiusX={w * 0.36} radiusY={h * 0.32} {...common} strokeWidth={0.9} />
          {/* kraan */}
          <Circle x={w * 0.5} y={h * 0.12} radius={Math.max(1.5, w * 0.05)} fill={s} listening={false} />
          <Line points={[w * 0.5, h * 0.12, w * 0.5, h * 0.3]} {...common} strokeWidth={0.9} />
        </>
      );
    case "shower":
      return (
        <>
          <Rect x={0} y={0} width={w} height={h} fill="#ffffff" opacity={0.7} {...common} />
          {/* diagonalen (standaard douchesymbool) */}
          <Line points={[0, 0, w, h]} {...common} strokeWidth={0.8} />
          <Line points={[w, 0, 0, h]} {...common} strokeWidth={0.8} />
          {/* putje */}
          <Circle x={w * 0.5} y={h * 0.5} radius={Math.max(2, w * 0.07)} fill="#ffffff" {...common} strokeWidth={0.9} />
          {/* douchekop in hoek */}
          <Circle x={w * 0.12} y={h * 0.12} radius={Math.max(2, w * 0.06)} fill={s} listening={false} />
        </>
      );
    case "bath":
      return (
        <>
          <Rect x={0} y={0} width={w} height={h} cornerRadius={2}
            fill="#ffffff" opacity={0.9} {...common} />
          {/* binnenkuip */}
          <Rect x={w * 0.08} y={h * 0.12} width={w * 0.84} height={h * 0.76}
            cornerRadius={Math.max(4, h * 0.3)} {...common} strokeWidth={0.9} />
          {/* afvoer + kraanzijde */}
          <Circle x={w * 0.14} y={h * 0.5} radius={Math.max(1.5, w * 0.02)} {...common} strokeWidth={0.9} />
          <Circle x={w * 0.05} y={h * 0.5} radius={Math.max(1.5, w * 0.015)} fill={s} listening={false} />
        </>
      );
    case "washing-machine":
      return (
        <>
          <Rect x={0} y={0} width={w} height={h} cornerRadius={2}
            fill="#ffffff" opacity={0.9} {...common} />
          {/* bedieningspaneel */}
          <Line points={[w * 0.08, h * 0.18, w * 0.92, h * 0.18]} {...common} strokeWidth={0.8} />
          {/* trommel */}
          <Circle x={w * 0.5} y={h * 0.58} radius={w * 0.28} {...common} strokeWidth={0.9} />
          <Circle x={w * 0.5} y={h * 0.58} radius={w * 0.18} {...common} strokeWidth={0.7} />
        </>
      );
    case "boiler":
      return (
        <>
          <Circle x={w * 0.5} y={h * 0.5} radius={w * 0.48} fill="#ffffff" opacity={0.9} {...common} />
          <Circle x={w * 0.5} y={h * 0.5} radius={w * 0.32} {...common} strokeWidth={0.8} />
        </>
      );
    case "kitchen-tap":
    case "outdoor-tap":
      return (
        <>
          {/* tappunt: cirkel met uitloop (kraansymbool) */}
          <Circle x={w * 0.5} y={h * 0.6} radius={w * 0.3} fill="#ffffff" opacity={0.9} {...common} />
          <Line points={[w * 0.5, h * 0.6, w * 0.5, h * 0.12, w * 0.82, h * 0.12]} {...common} strokeWidth={1.1} />
        </>
      );
  }
}

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

      {/* Tappunten / sanitair — bouwtekening-symbolen op ware grootte */}
      {fixtures.map((item) => {
        if (!item.position) return null;
        const p = metersToScreen(item.position, view);
        const selected = item.id === selectedId;
        const size = item.fixture ? FIXTURE_SIZE[item.fixture] : null;
        const sw = size ? metersToPx(size.w, view) : 0;
        const sh = size ? metersToPx(size.h, view) : 0;
        // Bij ver uitzoomen is het symbool onleesbaar → cirkel-marker als terugval.
        const useSymbol = !!item.fixture && sw >= 16;

        if (useSymbol && item.fixture) {
          return (
            <Fragment key={item.id}>
              {selected && (
                <Rect
                  x={p.x - sw / 2 - 3}
                  y={p.y - sh / 2 - 3}
                  width={sw + 6}
                  height={sh + 6}
                  fill="#fb923c"
                  opacity={0.35}
                  cornerRadius={3}
                  listening={false}
                />
              )}
              <Group x={p.x - sw / 2} y={p.y - sh / 2}>
                <FixtureSymbol kind={item.fixture} w={sw} h={sh} />
                {/* onzichtbaar klikvlak over de hele voetafdruk */}
                <Rect
                  id={item.id}
                  name="plumbing"
                  x={0}
                  y={0}
                  width={sw}
                  height={sh}
                  fill="transparent"
                  onClick={() => onSelect(item.id)}
                  onTap={() => onSelect(item.id)}
                />
              </Group>
              {item.heightZ != null && (
                <Label x={p.x - 14} y={p.y + sh / 2 + 2} listening={false}>
                  <Tag fill="#cffafe" cornerRadius={2} />
                  <Text
                    text={`${FIXTURE_CODE[item.fixture]} ${formatHeight(item.heightZ)}`}
                    fontSize={9}
                    fontFamily="monospace"
                    fill={PLUMBING_COLOR}
                    padding={2}
                  />
                </Label>
              )}
            </Fragment>
          );
        }

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
