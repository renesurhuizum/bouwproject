"use client";

// Minimap: klein SVG-overzicht van alle muren + huidige viewport.
// Klik op de minimap om naar die positie te springen.

import { useCallback } from "react";
import type { Wall } from "@/lib/domain/types";
import { BASE_PPM, type ViewState } from "./viewport";

const MAP_W = 140;
const MAP_H = 90;
const PADDING = 8; // pixels rondom de bounding box

interface Props {
  walls: Wall[];
  view: ViewState;
  /** Viewport-afmetingen in pixels (van de Stage). */
  stageWidth: number;
  stageHeight: number;
  onJumpTo: (worldX: number, worldY: number) => void;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function wallBounds(walls: Wall[]): Bounds | null {
  if (walls.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of walls) {
    for (const p of [w.start, w.end]) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, minY, maxX, maxY };
}

export function Minimap({ walls, view, stageWidth, stageHeight, onJumpTo }: Props) {
  const bounds = wallBounds(walls);

  // Schaal voor minimap: world-meters → minimap-pixels
  const drawW = MAP_W - PADDING * 2;
  const drawH = MAP_H - PADDING * 2;

  let scaleM = 1;
  let offsetX = PADDING;
  let offsetY = PADDING;

  if (bounds) {
    const bw = bounds.maxX - bounds.minX || 1;
    const bh = bounds.maxY - bounds.minY || 1;
    scaleM = Math.min(drawW / bw, drawH / bh);
    // Centreren
    offsetX = PADDING + (drawW - bw * scaleM) / 2;
    offsetY = PADDING + (drawH - bh * scaleM) / 2;
  }

  // Wereld-meters → minimap-pixels
  function toMini(wx: number, wy: number) {
    const bx = bounds ? bounds.minX : 0;
    const by = bounds ? bounds.minY : 0;
    return {
      x: offsetX + (wx - bx) * scaleM,
      y: offsetY + (wy - by) * scaleM,
    };
  }

  // Huidige viewport als rechthoek in world-meters
  const vpLeft   = -view.x / (view.scale * BASE_PPM);
  const vpTop    = -view.y / (view.scale * BASE_PPM);
  const vpRight  = vpLeft + stageWidth  / (view.scale * BASE_PPM);
  const vpBottom = vpTop  + stageHeight / (view.scale * BASE_PPM);

  const vp1 = toMini(vpLeft,  vpTop);
  const vp2 = toMini(vpRight, vpBottom);
  const vpRectX = Math.min(vp1.x, vp2.x);
  const vpRectY = Math.min(vp1.y, vp2.y);
  const vpRectW = Math.abs(vp2.x - vp1.x);
  const vpRectH = Math.abs(vp2.y - vp1.y);

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left; // minimap-pixels
      const my = e.clientY - rect.top;
      const bx = bounds ? bounds.minX : 0;
      const by = bounds ? bounds.minY : 0;
      const worldX = bx + (mx - offsetX) / scaleM;
      const worldY = by + (my - offsetY) / scaleM;
      onJumpTo(worldX, worldY);
    },
    [bounds, offsetX, offsetY, scaleM, onJumpTo],
  );

  return (
    <div className="absolute right-3 top-16 z-20 rounded-md border border-stone-300 bg-stone-50/90 shadow-md backdrop-blur-sm overflow-hidden">
      <svg
        width={MAP_W}
        height={MAP_H}
        onClick={handleClick}
        style={{ cursor: "crosshair", display: "block" }}
      >
        {/* Muren */}
        {walls.map((w) => {
          const a = toMini(w.start.x, w.start.y);
          const b = toMini(w.end.x, w.end.y);
          return (
            <line
              key={w.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={w.status === "new" ? "#ea580c" : w.status === "demolish" ? "#dc2626" : "#78716c"}
              strokeWidth={w.loadBearing ? 1.5 : 0.8}
              strokeLinecap="round"
            />
          );
        })}

        {/* Huidige viewport */}
        <rect
          x={vpRectX}
          y={vpRectY}
          width={Math.max(vpRectW, 4)}
          height={Math.max(vpRectH, 4)}
          fill="rgba(59,130,246,0.08)"
          stroke="#3b82f6"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
}
