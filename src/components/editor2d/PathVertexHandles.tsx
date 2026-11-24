"use client";

// Puntbewerking voor getekende leidingen (water, afvoer, cv, ventilatie).
// Zonder dit kon een leiding na het tekenen alleen nog verwijderd worden — één
// verkeerd punt betekende opnieuw beginnen.
//
// - Bestaande punten: slepen om te verleggen, dubbelklik/dubbeltik om te wissen
//   (minimaal twee punten blijven staan, anders is het geen leiding meer).
// - Halverwege elk segment staat een kleinere "+"-handle: slepen voegt daar een
//   nieuw punt in.

import { Layer, Circle, Line } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Point } from "@/lib/domain/types";
import { mUpdate } from "@/lib/db/mutate";
import { snapToGrid } from "@/lib/geometry";
import { useEditor, GRID_SNAP_M } from "@/lib/store/editor";
import type { TableName } from "@/lib/db/repo";
import { metersToScreen, screenToMeters, type ViewState } from "./viewport";

interface Props {
  table: Extract<TableName, "plumbing" | "hvac">;
  id: string;
  path: Point[];
  view: ViewState;
}

export function PathVertexHandles({ table, id, path, view }: Props) {
  const snapEnabled = useEditor((s) => s.snapEnabled);
  const gridSnap = useEditor((s) => s.gridSnap);

  function snap(p: Point): Point {
    return snapEnabled ? snapToGrid(p, GRID_SNAP_M[gridSnap]) : p;
  }

  async function moveVertex(index: number, e: KonvaEventObject<DragEvent>) {
    const world = snap(screenToMeters({ x: e.target.x(), y: e.target.y() }, view));
    const next = path.map((p, i) => (i === index ? world : p));
    await mUpdate(table, id, { path: next });
  }

  async function insertVertex(afterIndex: number, e: KonvaEventObject<DragEvent>) {
    const world = snap(screenToMeters({ x: e.target.x(), y: e.target.y() }, view));
    const next = [...path.slice(0, afterIndex + 1), world, ...path.slice(afterIndex + 1)];
    await mUpdate(table, id, { path: next });
  }

  async function removeVertex(index: number) {
    if (path.length <= 2) return; // een leiding heeft minstens twee punten nodig
    await mUpdate(table, id, { path: path.filter((_, i) => i !== index) });
  }

  return (
    <Layer>
      {/* Invoeg-handles halverwege elk segment */}
      {path.slice(0, -1).map((p, i) => {
        const a = metersToScreen(p, view);
        const b = metersToScreen(path[i + 1], view);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        return (
          <Circle
            key={`ins-${i}`}
            x={mid.x}
            y={mid.y}
            radius={5}
            fill="#fff"
            stroke="#0891b2"
            strokeWidth={1.5}
            opacity={0.85}
            draggable
            onDragEnd={(e) => {
              void insertVertex(i, e);
              e.target.position(mid);
            }}
          />
        );
      })}

      {/* Bestaande punten */}
      {path.map((p, i) => {
        const s = metersToScreen(p, view);
        return (
          <Circle
            key={`v-${i}`}
            x={s.x}
            y={s.y}
            radius={7}
            fill="#0891b2"
            stroke="#fff"
            strokeWidth={2}
            draggable
            onDragEnd={(e) => void moveVertex(i, e)}
            onDblClick={() => void removeVertex(i)}
            onDblTap={() => void removeVertex(i)}
          />
        );
      })}

      {/* Dunne hulplijn zodat de volgorde van de punten zichtbaar blijft */}
      <Line
        points={path.flatMap((p) => {
          const s = metersToScreen(p, view);
          return [s.x, s.y];
        })}
        stroke="#0891b2"
        strokeWidth={1}
        dash={[3, 3]}
        opacity={0.5}
        listening={false}
      />
    </Layer>
  );
}
