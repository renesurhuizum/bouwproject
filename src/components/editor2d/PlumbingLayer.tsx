"use client";

// Water-laag. Sanitair/tappunten als markers met code + hoogtelabel.

import { Fragment } from "react";
import { Layer, Circle, Label, Tag, Text } from "react-konva";
import type { PlumbingItem } from "@/lib/domain/types";
import { FIXTURE_CODE, PLUMBING_COLOR } from "@/lib/domain/constants";
import { formatHeight } from "@/lib/format";
import { metersToScreen, type ViewState } from "./viewport";

interface Props {
  view: ViewState;
  items: PlumbingItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function PlumbingLayer({ view, items, selectedId, onSelect }: Props) {
  return (
    <Layer>
      {items.map((it) => {
        if (!it.position || !it.fixture) return null;
        const p = metersToScreen(it.position, view);
        const selected = it.id === selectedId;
        const r = 12;
        return (
          <Fragment key={it.id}>
            {selected && (
              <Circle x={p.x} y={p.y} radius={r + 5} fill="#fb923c" opacity={0.5} listening={false} />
            )}
            <Circle
              id={it.id}
              name="plumbing"
              x={p.x}
              y={p.y}
              radius={r}
              fill={PLUMBING_COLOR}
              onClick={() => onSelect(it.id)}
              onTap={() => onSelect(it.id)}
            />
            <Text
              text={FIXTURE_CODE[it.fixture]}
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
            {it.heightZ != null && (
              <Label x={p.x} y={p.y + r + 2} listening={false}>
                <Tag fill="#cffafe" cornerRadius={2} />
                <Text
                  text={formatHeight(it.heightZ)}
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
