"use client";

// Doorsnedelijnen (NEN-stijl): dikke stippellijn met kijkrichting-pijlen en
// label (A-A) aan beide uiteinden. Klikbaar/selecteerbaar.

import { Fragment } from "react";
import { Layer, Line, Circle, Text } from "react-konva";
import type { SectionLine } from "@/lib/domain/types";
import { metersToScreen, type ViewState } from "./viewport";

interface Props {
  view: ViewState;
  sections: SectionLine[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const COLOR = "#1c1917";

export function SectionLayer({ view, sections, selectedId, onSelect }: Props) {
  return (
    <Layer>
      {sections.map((s) => {
        const a = metersToScreen(s.start, view);
        const e = metersToScreen(s.end, view);
        const dx = e.x - a.x;
        const dy = e.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const nx = -uy; // kijkrichting (normaal)
        const ny = ux;
        const selected = s.id === selectedId;
        const stroke = selected ? "#ea580c" : COLOR;
        const letter = s.label.split("-")[0] ?? "A";

        // pijl + label aan een uiteinde
        const endMark = (p: { x: number; y: number }, into: 1 | -1) => (
          <>
            <Line
              points={[p.x, p.y, p.x + nx * 16 * into, p.y + ny * 16 * into]}
              stroke={stroke}
              strokeWidth={2}
              listening={false}
            />
            <Line
              points={[
                p.x + nx * 16 * into - (ux + nx * into) * 6,
                p.y + ny * 16 * into - (uy + ny * into) * 6,
                p.x + nx * 16 * into,
                p.y + ny * 16 * into,
                p.x + nx * 16 * into - (-ux + nx * into) * 6,
                p.y + ny * 16 * into - (-uy + ny * into) * 6,
              ]}
              stroke={stroke}
              strokeWidth={2}
              listening={false}
            />
            <Circle x={p.x - nx * 12 * into} y={p.y - ny * 12 * into} radius={9} fill="#fff" stroke={stroke} strokeWidth={1.5} listening={false} />
            <Text
              x={p.x - nx * 12 * into - 5}
              y={p.y - ny * 12 * into - 5}
              width={10}
              align="center"
              text={letter}
              fontSize={10}
              fontStyle="bold"
              fontFamily="monospace"
              fill={stroke}
              listening={false}
            />
          </>
        );

        return (
          <Fragment key={s.id}>
            <Line
              id={s.id}
              name="section"
              points={[a.x, a.y, e.x, e.y]}
              stroke={stroke}
              strokeWidth={selected ? 3 : 2}
              dash={[12, 4, 3, 4]}
              hitStrokeWidth={14}
              onClick={() => onSelect(s.id)}
              onTap={() => onSelect(s.id)}
            />
            {endMark(a, 1)}
            {endMark(e, 1)}
          </Fragment>
        );
      })}
    </Layer>
  );
}
