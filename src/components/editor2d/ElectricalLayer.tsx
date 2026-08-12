"use client";

// Elektra-laag. Markers met constante schermgrootte, korte code + hoogtelabel.

import { Layer, Circle, Rect, Label, Tag, Text, Line } from "react-konva";
import type { ElectricalItem } from "@/lib/domain/types";
import { ELECTRICAL_CODE } from "@/lib/domain/constants";
import { formatHeight } from "@/lib/format";
import { DraggableEntity } from "./DraggableEntity";
import { metersToScreen, type ViewState } from "./viewport";

const CODE = ELECTRICAL_CODE;

interface Props {
  view: ViewState;
  items: ElectricalItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Kleur per eindgroep, zodat je ziet welk punt bij welke groep hoort. */
  circuitColors?: Map<string, string>;
  /** Nummer per eindgroep, als klein label bij het punt. */
  circuitNumbers?: Map<string, string>;
}

export function ElectricalLayer({ view, items, selectedId, onSelect, circuitColors, circuitNumbers }: Props) {
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
        // Punten zonder groep blijven standaardblauw; dat maakt meteen zichtbaar
        // welke punten nog nergens bij horen (en dus niet meetellen in de meters).
        const color = (it.circuitId && circuitColors?.get(it.circuitId)) || "#1d4ed8";
        const groupNo = it.circuitId ? circuitNumbers?.get(it.circuitId) : undefined;
        return (
          <DraggableEntity
            key={it.id}
            kind="electrical"
            entity={it}
            anchor={it.position}
            view={view}
            onSelect={onSelect}
          >
            {selected && (
              <Circle x={p.x} y={p.y} radius={r + 5} fill="#fb923c" opacity={0.5} listening={false} />
            )}
            {it.type === "switch" || it.type === "panel" ? (
              <Rect
                x={p.x - r}
                y={p.y - r}
                width={r * 2}
                height={r * 2}
                cornerRadius={4}
                fill={color}
              />
            ) : (
              <Circle x={p.x} y={p.y} radius={r} fill={color} />
            )}
            {groupNo && (
              <Label x={p.x + r - 2} y={p.y - r - 8} listening={false}>
                <Tag fill={color} cornerRadius={2} />
                <Text
                  text={groupNo}
                  fontSize={8}
                  fontStyle="bold"
                  fontFamily="monospace"
                  fill="#fff"
                  padding={2}
                />
              </Label>
            )}
            <Text
              text={CODE[it.type]}
              x={p.x - r}
              y={p.y - 6}
              width={r * 2}
              align="center"
              fontSize={11}
              fontStyle="bold"
              fontFamily="monospace"
              fill="#ffffff"
              listening={false}
            />
            <Label x={p.x} y={p.y + r + 2} listening={false}>
              <Tag fill="#e8effc" cornerRadius={2} />
              <Text
                text={formatHeight(it.heightZ)}
                fontSize={9}
                fontFamily="monospace"
                fill={color}
                padding={2}
              />
            </Label>
          </DraggableEntity>
        );
      })}
    </Layer>
  );
}
