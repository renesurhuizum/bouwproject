"use client";

// Gedeelde sleep-wrapper voor élke entiteit in de plattegrond.
//
// Truc: de Konva-Group staat op (0,0) en de kinderen tekenen gewoon op hun
// bestaande absolute schermcoördinaten. De positie van de Group ís daarmee de
// verplaatsing in pixels — zo hoeft geen enkele laag zijn tekenwiskunde om te
// bouwen. Bij loslaten wordt de verplaatsing omgerekend naar meters, gesnapt en
// via translatePatch() (zelfde functie als de pijltjestoetsen) weggeschreven
// als één undo-stap.
//
// Slepen commit alleen op dragEnd; tijdens het slepen verschuift Konva de laag
// zonder database-schrijfacties.

import { useRef, type ReactNode } from "react";
import { Group } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import type { Point } from "@/lib/domain/types";
import { mUpdate } from "@/lib/db/mutate";
import { snapToGrid } from "@/lib/geometry";
import { translatePatch, LAYER_FOR, type AnyEntity } from "@/lib/selectionOps";
import { useEditor, GRID_SNAP_M, type SelKind } from "@/lib/store/editor";
import { TABLE_FOR_KIND } from "@/lib/domain/tables";
import { BASE_PPM, type ViewState } from "./viewport";

interface Props {
  kind: SelKind;
  entity: AnyEntity;
  /** Wereldpunt (m) dat op het raster gesnapt wordt tijdens het slepen. */
  anchor: Point;
  view: ViewState;
  onSelect: (id: string) => void;
  /** Extra actie bij het begin van een sleep (bv. contextmenu sluiten). */
  onDragStart?: () => void;
  children: ReactNode;
}

export function DraggableEntity({
  kind,
  entity,
  anchor,
  view,
  onSelect,
  onDragStart,
  children,
}: Props) {
  const tool = useEditor((s) => s.tool);
  const lockedLayers = useEditor((s) => s.lockedLayers);
  const snapEnabled = useEditor((s) => s.snapEnabled);
  const gridSnap = useEditor((s) => s.gridSnap);
  const groupRef = useRef<import("konva/lib/Group").Group>(null);

  // Alleen slepen met het selectiegereedschap: anders verschuif je per ongeluk
  // een bank terwijl je een muur wilt tekenen.
  const draggable = tool === "select" && !lockedLayers[LAYER_FOR[kind]];

  const pxPerM = BASE_PPM * view.scale;

  // Snap de verplaatsing zó dat het ankerpunt op het raster landt.
  function dragBoundFunc(pos: { x: number; y: number }) {
    if (!snapEnabled) return pos;
    const grid = GRID_SNAP_M[gridSnap];
    const target = { x: anchor.x + pos.x / pxPerM, y: anchor.y + pos.y / pxPerM };
    const snapped = snapToGrid(target, grid);
    return { x: (snapped.x - anchor.x) * pxPerM, y: (snapped.y - anchor.y) * pxPerM };
  }

  async function handleDragEnd(e: KonvaEventObject<DragEvent>) {
    const node = e.target;
    const dx = node.x() / pxPerM;
    const dy = node.y() / pxPerM;
    // Terug naar de neutrale stand; de nieuwe positie komt uit de database.
    node.position({ x: 0, y: 0 });
    if (dx === 0 && dy === 0) return;
    const patch = translatePatch(kind, entity, dx, dy);
    if (Object.keys(patch).length) await mUpdate(TABLE_FOR_KIND[kind], entity.id, patch);
  }

  return (
    <Group
      ref={groupRef}
      id={entity.id}
      name={kind}
      draggable={draggable}
      dragBoundFunc={dragBoundFunc}
      onDragStart={onDragStart}
      onDragEnd={(e) => void handleDragEnd(e)}
      onClick={() => onSelect(entity.id)}
      onTap={() => onSelect(entity.id)}
    >
      {children}
    </Group>
  );
}
