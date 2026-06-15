"use client";

// Dak-laag (bovenaanzicht): gestippelde dakvoet-omtrek + nokrichting-pijl +
// hellingshoek-label, plus dakkapellen/velux als markeringen. Klikbaar.

import { Fragment } from "react";
import { Layer, Line, Rect, Text, Group } from "react-konva";
import type { Roof, Dormer, Wall, Point } from "@/lib/domain/types";
import { ROOF_TYPE_LABEL, DORMER_TYPE_LABEL } from "@/lib/domain/constants";
import { bounds } from "@/lib/geometry";
import { metersToScreen, metersToPx, type ViewState } from "./viewport";

interface Props {
  view: ViewState;
  roofs: Roof[];
  dormers: Dormer[];
  walls: Wall[];
  selectedRoofId: string | null;
  selectedDormerId: string | null;
  onSelectRoof: (id: string) => void;
  onSelectDormer: (id: string) => void;
}

const ROOF_COLOR = "#7c3aed";

function footprint(roof: Roof, walls: Wall[]): { min: Point; max: Point } {
  if (roof.polygon && roof.polygon.length >= 3) return bounds(roof.polygon);
  return bounds(walls.flatMap((w) => [w.start, w.end]));
}

export function RoofLayer({
  view,
  roofs,
  dormers,
  walls,
  selectedRoofId,
  selectedDormerId,
  onSelectRoof,
  onSelectDormer,
}: Props) {
  return (
    <Layer>
      {roofs.map((roof) => {
        const bb = footprint(roof, walls);
        if (!isFinite(bb.min.x) || bb.max.x <= bb.min.x) return null;
        const a = metersToScreen(bb.min, view);
        const c = metersToScreen(bb.max, view);
        const cx = (a.x + c.x) / 2;
        const cy = (a.y + c.y) / 2;
        const selected = roof.id === selectedRoofId;
        // noklijn door het midden, langs ridgeDirection
        const rad = (roof.ridgeDirection * Math.PI) / 180;
        const half = (Math.max(Math.abs(c.x - a.x), Math.abs(c.y - a.y)) / 2) * 0.85;
        const rx = Math.cos(rad) * half;
        const ry = Math.sin(rad) * half;

        return (
          <Fragment key={roof.id}>
            {/* dakvoet-omtrek (klikbaar) */}
            <Rect
              id={roof.id}
              name="roof"
              x={Math.min(a.x, c.x)}
              y={Math.min(a.y, c.y)}
              width={Math.abs(c.x - a.x)}
              height={Math.abs(c.y - a.y)}
              stroke={selected ? "#ea580c" : ROOF_COLOR}
              strokeWidth={selected ? 2.5 : 1.5}
              dash={[10, 6]}
              fill="rgba(124,58,237,0.04)"
              onClick={() => onSelectRoof(roof.id)}
              onTap={() => onSelectRoof(roof.id)}
            />
            {roof.type !== "flat" && (
              <>
                <Line
                  points={[cx - rx, cy - ry, cx + rx, cy + ry]}
                  stroke={ROOF_COLOR}
                  strokeWidth={2}
                  listening={false}
                />
                {/* nok-pijlpunten */}
                <Line
                  points={[cx + rx - Math.cos(rad - 0.4) * 10, cy + ry - Math.sin(rad - 0.4) * 10, cx + rx, cy + ry, cx + rx - Math.cos(rad + 0.4) * 10, cy + ry - Math.sin(rad + 0.4) * 10]}
                  stroke={ROOF_COLOR}
                  strokeWidth={2}
                  listening={false}
                />
              </>
            )}
            <Text
              x={cx - 40}
              y={cy - 8}
              width={80}
              align="center"
              text={`${ROOF_TYPE_LABEL[roof.type]}${roof.type !== "flat" ? ` · ${Math.round(roof.pitch)}°` : ""}`}
              fontSize={11}
              fontFamily="monospace"
              fill={ROOF_COLOR}
              listening={false}
            />
          </Fragment>
        );
      })}

      {dormers.map((dm) => {
        const pos = metersToScreen(dm.position, view);
        const w = metersToPx(dm.width, view);
        const h = metersToPx(dm.height, view);
        const selected = dm.id === selectedDormerId;
        const stroke = selected ? "#ea580c" : ROOF_COLOR;
        if (dm.type === "velux") {
          return (
            <Group key={dm.id} x={pos.x} y={pos.y}>
              <Rect
                id={dm.id}
                name="dormer"
                x={-w / 2}
                y={-h / 2}
                width={w}
                height={h}
                stroke={stroke}
                strokeWidth={selected ? 2.5 : 1.4}
                fill="rgba(124,58,237,0.06)"
                onClick={() => onSelectDormer(dm.id)}
                onTap={() => onSelectDormer(dm.id)}
              />
              <Line points={[-w / 2, -h / 2, w / 2, h / 2]} stroke={stroke} strokeWidth={1} listening={false} />
              <Line points={[w / 2, -h / 2, -w / 2, h / 2]} stroke={stroke} strokeWidth={1} listening={false} />
            </Group>
          );
        }
        return (
          <Rect
            key={dm.id}
            id={dm.id}
            name="dormer"
            x={pos.x - w / 2}
            y={pos.y - h / 2}
            width={w}
            height={h}
            stroke={stroke}
            strokeWidth={selected ? 2.5 : 1.4}
            dash={[5, 3]}
            fill="rgba(124,58,237,0.06)"
            onClick={() => onSelectDormer(dm.id)}
            onTap={() => onSelectDormer(dm.id)}
          />
        );
      })}
    </Layer>
  );
}
