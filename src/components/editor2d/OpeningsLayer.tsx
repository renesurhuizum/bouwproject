"use client";

// Deuren & ramen-laag. Tekent de opening als onderbreking in de muur, met een
// deurzwaai-symbool (deur) of dubbele lijn (raam).
//
// Openingen zitten vast aan een muur, dus ze slepen niet vrij rond: tijdens het
// slepen wordt de opening op de dichtstbijzijnde muur geprojecteerd en binnen
// die muur geklemd. Sleep je hem tot bij een andere muur, dan verhuist hij
// daarheen (wallId + offset in één stap).

import { useRef } from "react";
import { Layer, Line, Circle, Group } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Opening, Wall, Point } from "@/lib/domain/types";
import { OPENING_COLOR } from "@/lib/domain/constants";
import { projectOnSegment } from "@/lib/geometry";
import { mUpdate } from "@/lib/db/mutate";
import { useEditor } from "@/lib/store/editor";
import { metersToScreen, metersToPx, BASE_PPM, type ViewState } from "./viewport";

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

function wallLength(w: Wall): number {
  return Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
}

export function OpeningsLayer({ view, walls, openings, selectedId, onSelect }: Props) {
  const wallById = new Map(walls.map((w) => [w.id, w]));
  const tool = useEditor((s) => s.tool);
  const lockedLayers = useEditor((s) => s.lockedLayers);
  const draggable = tool === "select" && !lockedLayers.structure;
  // Waar de opening tijdens het slepen terechtkomt; gevuld door dragBoundFunc.
  const dropRef = useRef<{ wallId: string; offset: number } | null>(null);

  return (
    <Layer>
      {openings.map((op) => {
        const wall = wallById.get(op.wallId);
        if (!wall) return null;
        const len = wallLength(wall);
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

        const pxPerM = BASE_PPM * view.scale;

        // Houd de opening op een muur: projecteer het middelpunt op de
        // dichtstbijzijnde muur en klem hem binnen die muur.
        function dragBoundFunc(pos: { x: number; y: number }) {
          const dropped = {
            x: centerM.x + pos.x / pxPerM,
            y: centerM.y + pos.y / pxPerM,
          };
          let best: { wall: Wall; offset: number; d: number } | null = null;
          for (const w of walls) {
            const wLen = wallLength(w);
            if (wLen < op.width) continue; // te kort voor deze opening
            const { t, dist: d } = projectOnSegment(dropped, w.start, w.end);
            const offset = Math.min(Math.max(t * wLen, half), wLen - half);
            if (!best || d < best.d) best = { wall: w, offset, d };
          }
          if (!best) return { x: 0, y: 0 };
          dropRef.current = { wallId: best.wall.id, offset: best.offset };
          const bLen = wallLength(best.wall);
          const bDir = {
            x: (best.wall.end.x - best.wall.start.x) / bLen,
            y: (best.wall.end.y - best.wall.start.y) / bLen,
          };
          const target = add(best.wall.start, bDir, best.offset);
          return { x: (target.x - centerM.x) * pxPerM, y: (target.y - centerM.y) * pxPerM };
        }

        async function handleDragEnd(e: KonvaEventObject<DragEvent>) {
          e.target.position({ x: 0, y: 0 });
          const drop = dropRef.current;
          dropRef.current = null;
          if (!drop) return;
          const patch: Record<string, unknown> = { offset: drop.offset };
          if (drop.wallId !== op.wallId) patch.wallId = drop.wallId;
          await mUpdate("openings", op.id, patch);
        }

        return (
          <Group
            key={op.id}
            id={op.id}
            name="opening"
            draggable={draggable}
            dragBoundFunc={dragBoundFunc}
            onDragEnd={(e) => void handleDragEnd(e)}
            onClick={() => onSelect(op.id)}
            onTap={() => onSelect(op.id)}
          >
            {cut}
            {selected && (
              <Circle x={center.x} y={center.y} radius={metersToPx(half, view) + 6} stroke="#fb923c" strokeWidth={2} />
            )}
            {symbol}
            {/* Onzichtbaar tik-/sleepvlak */}
            <Line
              points={[a.x, a.y, b.x, b.y]}
              stroke="transparent"
              strokeWidth={Math.max(wallW, 22)}
            />
          </Group>
        );
      })}
    </Layer>
  );
}
