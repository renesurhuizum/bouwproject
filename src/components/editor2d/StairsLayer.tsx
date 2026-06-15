"use client";

// Trap-symbolen in bovenaanzicht (NEN-stijl): treden als evenwijdige lijnen
// met een looprichting-pijl en "op"/"af"-label. Recht / kwartslag / spiltrap.

import { Fragment } from "react";
import { Layer, Group, Rect, Line, Circle, Text } from "react-konva";
import type { Staircase } from "@/lib/domain/types";
import { metersToScreen, metersToPx, type ViewState } from "./viewport";

interface Props {
  view: ViewState;
  stairs: Staircase[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const ACCENT = "#0f766e"; // teal-groen voor constructie

function arrow(x0: number, y0: number, x1: number, y1: number): number[] {
  return [x0, y0, x1, y1];
}

function StairSymbol({ s, view }: { s: Staircase; view: ViewState }) {
  const sw = metersToPx(s.width, view);
  const run = metersToPx(s.run, view);
  const n = Math.max(2, Math.round(s.steps));

  if (s.kind === "spiral") {
    const R = Math.max(sw, run) / 2;
    const cx = R;
    const cy = R;
    const lines: number[][] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      lines.push([cx, cy, cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    }
    return (
      <>
        <Circle x={cx} y={cy} radius={R} stroke={ACCENT} strokeWidth={1.4} listening={false} />
        {lines.map((p, i) => (
          <Line key={i} points={p} stroke={ACCENT} strokeWidth={0.9} opacity={0.8} listening={false} />
        ))}
        <Circle x={cx} y={cy} radius={Math.max(3, R * 0.12)} fill={ACCENT} listening={false} />
      </>
    );
  }

  if (s.kind === "l-shape") {
    // Twee armen + draaiplateau. Verticale arm links, horizontale arm onder.
    const half = Math.round(n / 2);
    const armV = run; // hoogte verticale arm
    const stepV = (armV - sw) / Math.max(1, half); // tot aan het plateau (sw hoog)
    const vLines: number[][] = [];
    for (let i = 1; i < half; i++) vLines.push([0, i * stepV, sw, i * stepV]);
    const armH = run; // breedte horizontale arm
    const stepH = (armH - sw) / Math.max(1, n - half);
    const hLines: number[][] = [];
    for (let i = 1; i < n - half; i++) {
      const x = sw + i * stepH;
      hLines.push([x, armV - sw, x, armV]);
    }
    return (
      <>
        {/* omtrek (L) */}
        <Line
          points={[0, 0, sw, 0, sw, armV - sw, armH, armV - sw, armH, armV, 0, armV]}
          closed
          stroke={ACCENT}
          strokeWidth={1.4}
          listening={false}
        />
        {vLines.map((p, i) => (
          <Line key={`v${i}`} points={p} stroke={ACCENT} strokeWidth={0.9} opacity={0.85} listening={false} />
        ))}
        {hLines.map((p, i) => (
          <Line key={`h${i}`} points={p} stroke={ACCENT} strokeWidth={0.9} opacity={0.85} listening={false} />
        ))}
        {/* draairichting-pijl */}
        <Line points={arrow(sw / 2, armV - sw / 2, armH - 6, armV - sw / 2)} stroke={ACCENT} strokeWidth={1.4} listening={false} />
      </>
    );
  }

  // straight
  const step = run / n;
  const treads: number[][] = [];
  for (let i = 1; i < n; i++) treads.push([0, i * step, sw, i * step]);
  const dir = s.direction === "up";
  const ay0 = dir ? run - 6 : 6;
  const ay1 = dir ? 6 : run - 6;
  return (
    <>
      <Rect x={0} y={0} width={sw} height={run} stroke={ACCENT} strokeWidth={1.4} listening={false} />
      {treads.map((p, i) => (
        <Line key={i} points={p} stroke={ACCENT} strokeWidth={0.9} opacity={0.85} listening={false} />
      ))}
      {/* looprichting-pijl over de hele lengte */}
      <Line points={arrow(sw / 2, ay0, sw / 2, ay1)} stroke={ACCENT} strokeWidth={1.4} listening={false} />
      <Line
        points={[sw / 2 - 4, ay1 + (dir ? 6 : -6), sw / 2, ay1, sw / 2 + 4, ay1 + (dir ? 6 : -6)]}
        stroke={ACCENT}
        strokeWidth={1.4}
        listening={false}
      />
    </>
  );
}

export function StairsLayer({ view, stairs, selectedId, onSelect }: Props) {
  return (
    <Layer>
      {stairs.map((s) => {
        const pos = metersToScreen(s.position, view);
        const sw = metersToPx(s.width, view);
        const run = metersToPx(s.run, view);
        const boxW = s.kind === "spiral" ? Math.max(sw, run) : s.kind === "l-shape" ? run : sw;
        const boxH = s.kind === "spiral" ? Math.max(sw, run) : run;
        const selected = s.id === selectedId;
        return (
          <Fragment key={s.id}>
            <Group x={pos.x} y={pos.y} rotation={s.rotation}>
              {selected && (
                <Rect
                  x={-4}
                  y={-4}
                  width={boxW + 8}
                  height={boxH + 8}
                  stroke="#ea580c"
                  strokeWidth={2}
                  dash={[4, 3]}
                  fill="rgba(234,88,12,0.08)"
                  listening={false}
                />
              )}
              {/* klikvlak */}
              <Rect
                id={s.id}
                name="staircase"
                x={0}
                y={0}
                width={boxW}
                height={boxH}
                fill="rgba(15,118,110,0.06)"
                onClick={() => onSelect(s.id)}
                onTap={() => onSelect(s.id)}
              />
              <StairSymbol s={s} view={view} />
              <Text
                text={s.direction === "up" ? "op" : "af"}
                x={4}
                y={4}
                fontSize={11}
                fontFamily="monospace"
                fill={ACCENT}
                listening={false}
              />
            </Group>
          </Fragment>
        );
      })}
    </Layer>
  );
}
