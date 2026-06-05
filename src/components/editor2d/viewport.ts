// Viewport-rekenwerk voor de plattegrond-editor.
// Wereldcoördinaten zijn in METERS. De Konva-Stage tekent in pixels:
// pixel = meter * BASE_PPM * scale, plus pan-offset (pos).

import type { Point } from "@/lib/domain/types";

export const BASE_PPM = 50; // pixels per meter bij zoom = 1
export const MIN_SCALE = 0.15;
export const MAX_SCALE = 8;
export const SNAP_RADIUS_PX = 14; // tik-snap naar bestaand punt

export interface ViewState {
  x: number; // pan in px
  y: number;
  scale: number; // zoom
}

// Scherm-pixels → wereld-meters.
export function screenToMeters(px: Point, view: ViewState): Point {
  return {
    x: (px.x - view.x) / view.scale / BASE_PPM,
    y: (px.y - view.y) / view.scale / BASE_PPM,
  };
}

// Wereld-meters → scherm-pixels.
export function metersToScreen(m: Point, view: ViewState): Point {
  return {
    x: m.x * BASE_PPM * view.scale + view.x,
    y: m.y * BASE_PPM * view.scale + view.y,
  };
}

export function clampScale(s: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
}

// Zoom rond een schermpunt (bv. pinch-center of muisaanwijzer).
export function zoomAround(view: ViewState, screenPoint: Point, factor: number): ViewState {
  const newScale = clampScale(view.scale * factor);
  const realFactor = newScale / view.scale;
  return {
    scale: newScale,
    x: screenPoint.x - (screenPoint.x - view.x) * realFactor,
    y: screenPoint.y - (screenPoint.y - view.y) * realFactor,
  };
}

// Meter-waarde in pixels (huidige zoom).
export function metersToPx(meters: number, view: ViewState): number {
  return meters * BASE_PPM * view.scale;
}

// Pixelafstand → meters (huidige zoom). Voor snap-tolerantie.
export function pxToMeters(px: number, view: ViewState): number {
  return px / BASE_PPM / view.scale;
}
