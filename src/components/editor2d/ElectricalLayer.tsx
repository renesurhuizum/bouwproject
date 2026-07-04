"use client";

// Elektra-laag. Markers met constante schermgrootte, korte code + hoogtelabel.

import { Layer, Circle, Rect, Label, Tag, Text, Line, Group } from "react-konva";
import type { ElectricalItem } from "@/lib/domain/types";
import { ELECTRICAL_CODE } from "@/lib/domain/constants";
import { formatHeight } from "@/lib/format";
import { metersToScreen, screenToMeters, type ViewState } from "./viewport";

const CODE = ELECTRICAL_CODE;

interface Props {
  view: ViewState;
  items: ElectricalItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove?: (id: string, x: number, y: number) => void;
}

export function ElectricalLayer({ view, items, selectedId, onSelect, onMove }: Props) {
  const byId = new Map(items.map((it) => [it.id, it]));

  // Schakelaar → lichtpunt verbindingen (stippellijn), op basis van linkedIds.
  const links: { from: ElectricalItem; to: ElectricalItem }[] = [];
  for (const it of items) {
    for (const tid of it.linkedIds ?? []) {
      const to = byId.get(tid);
      if (to) links.push({ from: it, to });
    }
  }

  return (
    <Layer>
      {links.map(({ from, to }, i) => {
        const a = metersToScreen(from.position, view);
        const b = metersToScreen(to.position, view);
        return (
          <Line
            key={`lnk-${from.id}-${to.id}-${i}`}
            points={[a.x, a.y, b.x, b.y]}
            stroke="#1d4ed8"
            strokeWidth={1.2}
            dash={[5, 4]}
            opacity={0.55}
            listening={false}
          />
        );
      })}
      {items.map((it) => {
        const p = metersToScreen(it.position, view);
        const selected = it.id === selectedId;
        const r = 11;
        // Groep op het middelpunt; kinderen relatief, zodat het geheel
        // versleepbaar is en onDragEnd direct de nieuwe positie oplevert.
        return (
          <Group
            key={it.id}
            x={p.x}
            y={p.y}
            draggable={!!onMove}
            onDragEnd={(e) => {
              const m = screenToMeters(e.target.absolutePosition(), view);
              onMove?.(it.id, m.x, m.y);
            }}
          >
            {selected && (
              <Circle x={0} y={0} radius={r + 5} fill="#fb923c" opacity={0.5} listening={false} />
            )}
            {it.type === "switch" || it.type === "panel" ? (
              <Rect
                id={it.id}
                name="electrical"
                x={-r}
                y={-r}
                width={r * 2}
                height={r * 2}
                cornerRadius={4}
                fill="#1d4ed8"
                onClick={() => onSelect(it.id)}
                onTap={() => onSelect(it.id)}
              />
            ) : (
              <Circle
                id={it.id}
                name="electrical"
                x={0}
                y={0}
                radius={r}
                fill="#1d4ed8"
                onClick={() => onSelect(it.id)}
                onTap={() => onSelect(it.id)}
              />
            )}
            <Text
              text={CODE[it.type]}
              x={-r}
              y={-6}
              width={r * 2}
              align="center"
              fontSize={11}
              fontStyle="bold"
              fontFamily="monospace"
              fill="#ffffff"
              listening={false}
            />
            <Label x={0} y={r + 2} listening={false}>
              <Tag fill="#e8effc" cornerRadius={2} />
              <Text
                text={formatHeight(it.heightZ)}
                fontSize={9}
                fontFamily="monospace"
                fill="#1d4ed8"
                padding={2}
              />
            </Label>
          </Group>
        );
      })}
    </Layer>
  );
}
