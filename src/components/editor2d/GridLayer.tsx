"use client";

// Blauwdruk-raster. Tekent in scherm-pixels op basis van de viewport.
// Past de rasterstap aan de zoom aan zodat lijnen nooit te dicht staan.

import { Layer, Line } from "react-konva";
import { screenToMeters, metersToScreen, type ViewState } from "./viewport";

interface Props {
  view: ViewState;
  width: number;
  height: number;
}

const MINOR_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10];

export function GridLayer({ view, width, height }: Props) {
  const ppm = 50 * view.scale; // px per meter

  // Kleinste stap waarbij lijnen >= 9px uit elkaar staan.
  const minor = MINOR_STEPS.find((s) => s * ppm >= 9) ?? 10;
  const major = minor * (minor >= 1 ? 5 : 10);

  const tl = screenToMeters({ x: 0, y: 0 }, view);
  const br = screenToMeters({ x: width, y: height }, view);

  const startX = Math.floor(tl.x / minor) * minor;
  const endX = Math.ceil(br.x / minor) * minor;
  const startY = Math.floor(tl.y / minor) * minor;
  const endY = Math.ceil(br.y / minor) * minor;

  const lines: React.ReactNode[] = [];
  const eps = minor / 2;

  for (let x = startX; x <= endX; x += minor) {
    const isMajor = Math.abs(x % major) < eps || Math.abs((x % major) - major) < eps;
    const sx = metersToScreen({ x, y: 0 }, view).x;
    lines.push(
      <Line
        key={`v${x.toFixed(3)}`}
        points={[sx, 0, sx, height]}
        stroke={isMajor ? "#c7d2fe" : "#e4e9f5"}
        strokeWidth={isMajor ? 1.2 : 0.8}
        listening={false}
      />,
    );
  }
  for (let y = startY; y <= endY; y += minor) {
    const isMajor = Math.abs(y % major) < eps || Math.abs((y % major) - major) < eps;
    const sy = metersToScreen({ x: 0, y }, view).y;
    lines.push(
      <Line
        key={`h${y.toFixed(3)}`}
        points={[0, sy, width, sy]}
        stroke={isMajor ? "#c7d2fe" : "#e4e9f5"}
        strokeWidth={isMajor ? 1.2 : 0.8}
        listening={false}
      />,
    );
  }

  // Oorsprong-assen (0,0) iets sterker.
  const origin = metersToScreen({ x: 0, y: 0 }, view);
  lines.push(
    <Line key="axis-x" points={[0, origin.y, width, origin.y]} stroke="#a5b4fc" strokeWidth={1.5} listening={false} />,
    <Line key="axis-y" points={[origin.x, 0, origin.x, height]} stroke="#a5b4fc" strokeWidth={1.5} listening={false} />,
  );

  return <Layer listening={false}>{lines}</Layer>;
}
