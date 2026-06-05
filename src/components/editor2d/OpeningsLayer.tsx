"use client";

// Deuren & ramen-laag. Tekent de opening als onderbreking in de muur, met een
// deurzwaai-symbool (deur) of dubbele lijn (raam).

import { Fragment } from "react";
import { Layer, Line, Circle } from "react-konva";
import type { Opening, Wall, Point } from "@/lib/domain/types";
import { OPENING_COLOR } from "@/lib/domain/constants";
import { metersToScreen, metersToPx, type ViewState } from "./viewport";

interface Props {
  view: ViewState;
  walls: Wall[];
  openings: Opening[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function add(a: Point, b: Point, s: number): Point {
  return { x: a.x + b.x * s, y: a.y + b.y * s };
}

export function OpeningsLayer({ view, walls, openings, selectedId, onSelect }: Props) {
  const wallById = new Map(walls.map((w) => [w.id, w]));

  return (
    <Layer>
      {openings.map((op) => {
        const wall = wallById.get(op.wallId);
        if (!wall) return null;
        const len = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
        if (len < 0.01) return null;

        const dir = { x: (wall.end.x - wall.start.x) / len, y: (wall.end.y - wall.start.y) / len };
        const perp = { x: -dir.y, y: dir.x };
        const half = op.width / 2;
        const aM = add(wall.start, dir, op.offset - half); // scharnier
        const bM = add(wall.start, dir, op.offset + half);
        const centerM = add(wall.start, dir, op.offset);

        const a = metersToScreen(aM, view);
        const b = metersToScreen(bM, view);
        const center = metersToScreen(centerM, view);
        const wallW = Math.max(2, metersToPx(wall.thickness, view));
        const color = OPENING_COLOR[op.type];
        const selected = op.id === selectedId;

        // "Knip" de muur weg in de opening.
        const cut = (
          <Line
            points={[a.x, a.y, b.x, b.y]}
            stroke="#f4f1ea"
            strokeWidth={wallW + 1}
            lineCap="butt"
          />
        );

        // Jamb-streepjes (dwars op de muur).
        const jambLen = wall.thickness * 0.9 + 0.04;
        const jamb = (p: Point) => {
          const p1 = metersToScreen(add(p, perp, jambLen), view);
          const p2 = metersToScreen(add(p, perp, -jambLen), view);
          return [p1.x, p1.y, p2.x, p2.y];
        };

        let symbol: React.ReactNode = null;
        if (op.type === "door" || op.type === "passage") {
          // Deurzwaai: blad + kwartcirkel rond scharnier aM.
          const baseAngle = Math.atan2(dir.y, dir.x);
          const steps = 10;
          const arcPts: number[] = [];
          for (let i = 0; i <= steps; i++) {
            const th = baseAngle + (Math.PI / 2) * (i / steps);
            const pm = { x: aM.x + Math.cos(th) * op.width, y: aM.y + Math.sin(th) * op.width };
            const ps = metersToScreen(pm, view);
            arcPts.push(ps.x, ps.y);
          }
          const leafEnd = metersToScreen(add(aM, perp, op.width), view);
          symbol =
            op.type === "door" ? (
              <>
                <Line points={[a.x, a.y, leafEnd.x, leafEnd.y]} stroke={color} strokeWidth={2} />
                <Line points={arcPts} stroke={color} strokeWidth={1.5} dash={[4, 4]} />
              </>
            ) : (
              <>
                <Line points={jamb(aM)} stroke={color} strokeWidth={2} />
                <Line points={jamb(bM)} stroke={color} strokeWidth={2} />
              </>
            );
        } else {
          // Raam: dubbele lijn over de opening + jambs.
          const o1a = metersToScreen(add(aM, perp, wall.thickness * 0.3), view);
          const o1b = metersToScreen(add(bM, perp, wall.thickness * 0.3), view);
          const o2a = metersToScreen(add(aM, perp, -wall.thickness * 0.3), view);
          const o2b = metersToScreen(add(bM, perp, -wall.thickness * 0.3), view);
          symbol = (
            <>
              <Line points={[o1a.x, o1a.y, o1b.x, o1b.y]} stroke={color} strokeWidth={1.5} />
              <Line points={[o2a.x, o2a.y, o2b.x, o2b.y]} stroke={color} strokeWidth={1.5} />
              <Line points={jamb(aM)} stroke={color} strokeWidth={2} />
              <Line points={jamb(bM)} stroke={color} strokeWidth={2} />
            </>
          );
        }

        return (
          <Fragment key={op.id}>
            {cut}
            {selected && (
              <Circle x={center.x} y={center.y} radius={metersToPx(half, view) + 6} stroke="#fb923c" strokeWidth={2} />
            )}
            {symbol}
            {/* Onzichtbaar tikvlak voor selectie */}
            <Line
              points={[a.x, a.y, b.x, b.y]}
              stroke="transparent"
              strokeWidth={Math.max(wallW, 22)}
              onClick={() => onSelect(op.id)}
              onTap={() => onSelect(op.id)}
            />
          </Fragment>
        );
      })}
    </Layer>
  );
}
