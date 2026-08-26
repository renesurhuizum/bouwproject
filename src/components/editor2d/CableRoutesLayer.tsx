"use client";

// Kabelroutes per eindgroep als stippellijn in de groepskleur, met de
// inkooplengte bij de route. Zo zie je op de plattegrond meteen wélke kabel
// waar loopt en hoeveel meter je ervoor nodig hebt.

import { Fragment } from "react";
import { Layer, Line, Label, Tag, Text } from "react-konva";
import type { ElectricalCircuit, Point } from "@/lib/domain/types";
import type { CircuitRoute } from "@/lib/routing/cableRouting";
import { formatLength } from "@/lib/format";
import { metersToScreen, type ViewState } from "./viewport";

interface Props {
  view: ViewState;
  circuits: ElectricalCircuit[];
  routes: CircuitRoute[];
  /** Alleen deze groep tonen; null = alle groepen. */
  focusCircuitId?: string | null;
}

function toFlat(pts: Point[], view: ViewState): number[] {
  return pts.flatMap((p) => {
    const s = metersToScreen(p, view);
    return [s.x, s.y];
  });
}

export function CableRoutesLayer({ view, circuits, routes, focusCircuitId }: Props) {
  const circuitById = new Map(circuits.map((c) => [c.id, c]));

  return (
    <Layer listening={false}>
      {routes.map((route) => {
        const circuit = circuitById.get(route.circuitId);
        if (!circuit || route.polylines.length === 0) return null;
        if (focusCircuitId && focusCircuitId !== circuit.id) return null;

        // Label halverwege de langste polylijn, zodat het niet in een hoekje valt.
        const longest = route.polylines.reduce((a, b) => (b.length > a.length ? b : a));
        const mid = longest[Math.floor(longest.length / 2)];
        const labelPos = mid ? metersToScreen(mid, view) : null;

        return (
          <Fragment key={route.circuitId}>
            {route.polylines.map((poly, i) => (
              <Line
                key={i}
                points={toFlat(poly, view)}
                stroke={circuit.color}
                strokeWidth={1.8}
                dash={[7, 5]}
                opacity={0.85}
                lineCap="round"
                lineJoin="round"
              />
            ))}
            {labelPos && (
              <Label x={labelPos.x} y={labelPos.y - 14} opacity={0.95}>
                <Tag fill={circuit.color} cornerRadius={3} />
                <Text
                  text={`G${circuit.number} · ${formatLength(route.purchaseM)}`}
                  fontSize={10}
                  fontFamily="monospace"
                  fill="#fff"
                  padding={3}
                />
              </Label>
            )}
          </Fragment>
        );
      })}
    </Layer>
  );
}
