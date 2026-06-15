"use client";

// Stalen balken in bovenaanzicht: dubbele lijn (I-profiel) langs start→end,
// met profielbreedte. Selecteerbaar.

import { Fragment } from "react";
import { Layer, Line } from "react-konva";
import type { Beam } from "@/lib/domain/types";
import { BEAM_PROFILE_DIMS } from "@/lib/domain/constants";
import { dist } from "@/lib/geometry";
import { metersToScreen, metersToPx, type ViewState } from "./viewport";

interface Props {
  view: ViewState;
  beams: Beam[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const STROKE = "#475569";

export function BeamsLayer({ view, beams, selectedId, onSelect }: Props) {
  return (
    <Layer>
      {beams.map((b) => {
        const a = metersToScreen(b.start, view);
        const c = metersToScreen(b.end, view);
        const len = dist(b.start, b.end);
        if (len < 0.001) return null;
        const dims = BEAM_PROFILE_DIMS[b.profile];
        const flange = metersToPx(b.width ?? dims.w, view);
        // loodrechte eenheidsvector
        const dx = (c.x - a.x) / Math.hypot(c.x - a.x, c.y - a.y);
        const dy = (c.y - a.y) / Math.hypot(c.x - a.x, c.y - a.y);
        const nx = -dy * (flange / 2);
        const ny = dx * (flange / 2);
        const selected = b.id === selectedId;
        const stroke = selected ? "#ea580c" : STROKE;
        return (
          <Fragment key={b.id}>
            {/* twee flenslijnen */}
            <Line points={[a.x + nx, a.y + ny, c.x + nx, c.y + ny]} stroke={stroke} strokeWidth={selected ? 2.5 : 1.6} listening={false} />
            <Line points={[a.x - nx, a.y - ny, c.x - nx, c.y - ny]} stroke={stroke} strokeWidth={selected ? 2.5 : 1.6} listening={false} />
            {/* lijfas (klikbaar) */}
            <Line
              id={b.id}
              name="beam"
              points={[a.x, a.y, c.x, c.y]}
              stroke={stroke}
              strokeWidth={1}
              dash={[6, 4]}
              hitStrokeWidth={Math.max(12, flange)}
              onClick={() => onSelect(b.id)}
              onTap={() => onSelect(b.id)}
            />
          </Fragment>
        );
      })}
    </Layer>
  );
}
