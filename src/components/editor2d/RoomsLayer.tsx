"use client";

import { Fragment } from "react";
import { Layer, Line, Text, Rect, Group, Arrow } from "react-konva";
import type { Room, Wall, Level } from "@/lib/domain/types";
import { polygonArea, polygonCentroid } from "@/lib/geometry";
import { formatArea } from "@/lib/format";
import { validateRooms } from "@/lib/validation";
import { metersToScreen, type ViewState } from "./viewport";

export type RoomPhaseStatus = "todo" | "in-progress" | "done";

interface Props {
  view: ViewState;
  rooms: Room[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  walls?: Wall[];
  levels?: Level[];
  // Fase-overlay: kleurt ruimtes op werkvoortgang (grijs/oranje/groen).
  phaseStatusByRoom?: Map<string, RoomPhaseStatus> | null;
}

const PHASE_FILL: Record<RoomPhaseStatus, string> = {
  todo: "rgba(120, 113, 108, 0.25)",
  "in-progress": "rgba(234, 88, 12, 0.30)",
  done: "rgba(21, 128, 61, 0.30)",
};
const PHASE_STROKE: Record<RoomPhaseStatus, string> = {
  todo: "rgba(120, 113, 108, 0.6)",
  "in-progress": "rgba(234, 88, 12, 0.8)",
  done: "rgba(21, 128, 61, 0.8)",
};
const PHASE_BADGE: Record<RoomPhaseStatus, string> = {
  todo: "Nog niet gestart",
  "in-progress": "Bezig",
  done: "Klaar",
};

function hexToRgba(color: string, alpha: number): string {
  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}

function isStaircase(name: string): boolean {
  return /trap\b/i.test(name);
}

function StaircaseLines({
  polygon,
  view,
}: {
  polygon: { x: number; y: number }[];
  view: ViewState;
}) {
  const screenPts = polygon.map((p) => metersToScreen(p, view));
  const xs = screenPts.map((p) => p.x);
  const ys = screenPts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = maxX - minX;
  const h = maxY - minY;

  // Trede-hoogte in pixels (~21 cm)
  const treadPx = Math.max(8, 0.21 * view.scale);
  const lines: number[][] = [];

  if (h >= w) {
    // Verticale trap — horizontale tredes
    for (let y = minY + treadPx; y < maxY - 2; y += treadPx) {
      lines.push([minX + 2, y, maxX - 2, y]);
    }
    // Pijl omhoog
    return (
      <Group listening={false}>
        {lines.map((pts, i) => (
          <Line key={i} points={pts} stroke="#94a3b8" strokeWidth={0.8} />
        ))}
        <Arrow
          points={[minX + w / 2, maxY - 6, minX + w / 2, minY + 6]}
          fill="#64748b"
          stroke="#64748b"
          strokeWidth={1}
          pointerLength={6}
          pointerWidth={5}
          listening={false}
        />
      </Group>
    );
  } else {
    // Horizontale trap — verticale tredes
    for (let x = minX + treadPx; x < maxX - 2; x += treadPx) {
      lines.push([x, minY + 2, x, maxY - 2]);
    }
    return (
      <Group listening={false}>
        {lines.map((pts, i) => (
          <Line key={i} points={pts} stroke="#94a3b8" strokeWidth={0.8} />
        ))}
        <Arrow
          points={[maxX - 6, minY + h / 2, minX + 6, minY + h / 2]}
          fill="#64748b"
          stroke="#64748b"
          strokeWidth={1}
          pointerLength={6}
          pointerWidth={5}
          listening={false}
        />
      </Group>
    );
  }
}

export function RoomsLayer({ view, rooms, selectedId, onSelect, walls = [], levels = [], phaseStatusByRoom = null }: Props) {
  // Bouwbesluit validatie — set van problematische room ids
  const issues = validateRooms(rooms, levels);
  const warnRoomIds = new Set(issues.filter((i) => i.entityId).map((i) => i.entityId!));

  return (
    <Layer>
      {rooms.map((room) => {
        if (room.polygon.length < 3) return null;

        const pts = room.polygon.flatMap((p) => {
          const s = metersToScreen(p, view);
          return [s.x, s.y];
        });

        const area = polygonArea(room.polygon);
        const areaLabel = formatArea(area);
        const c = metersToScreen(polygonCentroid(room.polygon), view);
        const selected = room.id === selectedId;
        const staircase = isStaircase(room.name);
        const hasWarning = warnRoomIds.has(room.id);
        const phaseStatus = phaseStatusByRoom?.get(room.id) ?? null;
        const overlayActive = phaseStatusByRoom !== null;

        // Fase-overlay heeft voorrang; daarna Bouwbesluit-warning; daarna eigen kleur.
        const fillColor = overlayActive
          ? phaseStatus
            ? PHASE_FILL[phaseStatus]
            : "rgba(168, 162, 158, 0.10)"
          : hasWarning
            ? `rgba(234, 88, 12, ${selected ? 0.35 : 0.18})`
            : room.color
              ? hexToRgba(room.color, selected ? 0.45 : 0.28)
              : `rgba(234, 88, 12, ${selected ? 0.14 : 0.07})`;
        const strokeColor = overlayActive
          ? phaseStatus
            ? PHASE_STROKE[phaseStatus]
            : "rgba(168, 162, 158, 0.4)"
          : hasWarning
            ? `rgba(234, 88, 12, ${selected ? 1.0 : 0.7})`
            : room.color
              ? hexToRgba(room.color, selected ? 0.9 : 0.55)
              : selected
                ? "rgba(234, 88, 12, 0.9)"
                : "rgba(234, 88, 12, 0.35)";

        const labelW = Math.max(room.name.length * 6.5 + 16, 80);
        const labelH = 34;

        return (
          <Fragment key={room.id}>
            <Line
              id={room.id}
              name="room"
              points={pts}
              closed
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth={selected ? 2 : 1}
              onClick={() => onSelect(room.id)}
              onTap={() => onSelect(room.id)}
            />
            {staircase && <StaircaseLines polygon={room.polygon} view={view} />}
            <Group x={c.x - labelW / 2} y={c.y - labelH / 2} listening={false}>
              <Rect
                width={labelW}
                height={labelH}
                fill={hasWarning ? "rgba(254,243,199,0.95)" : "rgba(255,255,255,0.88)"}
                stroke={hasWarning ? "rgba(217,119,6,0.5)" : "rgba(0,0,0,0.08)"}
                strokeWidth={1}
                cornerRadius={5}
              />
              <Text
                text={hasWarning ? `⚠ ${room.name}` : room.name}
                width={labelW}
                y={5}
                fontSize={11}
                fontStyle="600"
                fontFamily="system-ui, sans-serif"
                fill={hasWarning ? "#92400e" : "#1c1917"}
                align="center"
              />
              <Text
                text={
                  overlayActive
                    ? phaseStatus
                      ? PHASE_BADGE[phaseStatus]
                      : "Geen taken"
                    : areaLabel
                }
                width={labelW}
                y={19}
                fontSize={9}
                fontFamily="system-ui, sans-serif"
                fill={
                  overlayActive
                    ? phaseStatus === "done"
                      ? "#15803d"
                      : phaseStatus === "in-progress"
                        ? "#ea580c"
                        : "#78716c"
                    : "#78716c"
                }
                align="center"
              />
            </Group>
          </Fragment>
        );
      })}
    </Layer>
  );
}
