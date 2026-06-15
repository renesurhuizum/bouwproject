"use client";

import type { ReactNode } from "react";
import { Rect, Line, Circle, Arc } from "react-konva";
import type { FurnitureKind } from "@/lib/domain/types";

// Architectonische bovenaanzicht-symbolen voor meubels (NEN-stijl plattegrond).
// Puur component: geen hooks, geen state. Alle shapes listening={false};
// het basis-Rect in FurnitureLayer vangt de clicks.

interface SymbolProps {
  sw: number; // schermbreedte in px
  sd: number; // schermdiepte in px
  color: string;
  stroke: string;
}

const MAIN = 1.2; // hoofdlijnen
const THIN = 1; // dunne binnenlijnen

/* ---------------------------------- bedden --------------------------------- */

function renderBed(p: SymbolProps, pillows: 1 | 2): ReactNode {
  const { sw, sd, color, stroke } = p;
  const inset = Math.max(2, Math.min(sw, sd) * 0.06);
  const ix = inset;
  const iy = inset;
  const iw = sw - 2 * inset;
  const ih = sd - 2 * inset;

  // kussens bovenaan (hoofdeinde = y=0), ~25% van de lengte
  const pilH = ih * 0.22;
  const pilY = iy + Math.max(1.5, ih * 0.03);
  const pilR = Math.max(1.5, pilH * 0.3);
  const pillowRects: ReactNode[] = [];
  if (pillows === 1) {
    pillowRects.push(
      <Rect
        key="pil-0"
        x={ix + iw * 0.2}
        y={pilY}
        width={iw * 0.6}
        height={pilH}
        cornerRadius={pilR}
        stroke={stroke}
        strokeWidth={THIN}
        fill={color}
        opacity={0.9}
        listening={false}
      />
    );
  } else {
    const gap = Math.max(1.5, iw * 0.04);
    const pw = (iw - gap) / 2 - iw * 0.04;
    pillowRects.push(
      <Rect
        key="pil-0"
        x={ix + iw * 0.04}
        y={pilY}
        width={pw}
        height={pilH}
        cornerRadius={pilR}
        stroke={stroke}
        strokeWidth={THIN}
        fill={color}
        opacity={0.9}
        listening={false}
      />,
      <Rect
        key="pil-1"
        x={ix + iw * 0.04 + pw + gap}
        y={pilY}
        width={pw}
        height={pilH}
        cornerRadius={pilR}
        stroke={stroke}
        strokeWidth={THIN}
        fill={color}
        opacity={0.9}
        listening={false}
      />
    );
  }

  // dekbed-omslaglijn op ~30% vanaf boven, met diagonale vouwlijn in één hoek
  const foldY = sd * 0.3;
  const foldSize = Math.min(iw, ih) * 0.18;

  return (
    <>
      {/* frame (buitenrand) */}
      <Rect
        x={0}
        y={0}
        width={sw}
        height={sd}
        stroke={stroke}
        strokeWidth={MAIN}
        cornerRadius={2}
        listening={false}
      />
      {/* matras (binnenrechthoek) */}
      <Rect
        x={ix}
        y={iy}
        width={iw}
        height={ih}
        stroke={stroke}
        strokeWidth={THIN}
        cornerRadius={2}
        listening={false}
      />
      {pillowRects}
      {/* dekbed-omslaglijn */}
      <Line
        points={[ix, foldY, ix + iw, foldY]}
        stroke={stroke}
        strokeWidth={THIN}
        listening={false}
      />
      {/* diagonale vouwlijn in de rechterhoek */}
      <Line
        points={[ix + iw - foldSize, foldY, ix + iw, foldY + foldSize]}
        stroke={stroke}
        strokeWidth={THIN}
        listening={false}
      />
    </>
  );
}

/* ---------------------------------- banken --------------------------------- */

function seatCushions(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  n: number,
  horizontal: boolean,
  color: string,
  stroke: string,
  keyPrefix: string
): ReactNode[] {
  const gap = 1.5;
  const cushions: ReactNode[] = [];
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 2 || h <= 2 || n < 1) return cushions;
  const r = Math.max(1.5, Math.min(w, h) * 0.12);
  for (let i = 0; i < n; i++) {
    if (horizontal) {
      const cw = (w - gap * (n - 1)) / n;
      cushions.push(
        <Rect
          key={`${keyPrefix}-${i}`}
          x={x0 + i * (cw + gap)}
          y={y0}
          width={cw}
          height={h}
          cornerRadius={r}
          stroke={stroke}
          strokeWidth={THIN}
          fill={color}
          opacity={0.5}
          listening={false}
        />
      );
    } else {
      const ch = (h - gap * (n - 1)) / n;
      cushions.push(
        <Rect
          key={`${keyPrefix}-${i}`}
          x={x0}
          y={y0 + i * (ch + gap)}
          width={w}
          height={ch}
          cornerRadius={r}
          stroke={stroke}
          strokeWidth={THIN}
          fill={color}
          opacity={0.5}
          listening={false}
        />
      );
    }
  }
  return cushions;
}

function renderSofa(p: SymbolProps, n: 2 | 3): ReactNode {
  const { sw, sd, color, stroke } = p;
  const backD = Math.max(3, sd * 0.18);
  const armW = Math.max(3, sw * 0.12);
  const margin = Math.max(1, sd * 0.04);

  return (
    <>
      {/* buitenrand */}
      <Rect
        x={0}
        y={0}
        width={sw}
        height={sd}
        stroke={stroke}
        strokeWidth={MAIN}
        cornerRadius={2}
        listening={false}
      />
      {/* rugleuning langs y=0 */}
      <Rect
        x={0}
        y={0}
        width={sw}
        height={backD}
        stroke={stroke}
        strokeWidth={THIN}
        fill={color}
        opacity={0.35}
        listening={false}
      />
      {/* armleuningen */}
      <Rect
        x={0}
        y={backD}
        width={armW}
        height={sd - backD}
        stroke={stroke}
        strokeWidth={THIN}
        fill={color}
        opacity={0.35}
        listening={false}
      />
      <Rect
        x={sw - armW}
        y={backD}
        width={armW}
        height={sd - backD}
        stroke={stroke}
        strokeWidth={THIN}
        fill={color}
        opacity={0.35}
        listening={false}
      />
      {/* zitkussens */}
      {seatCushions(
        armW + 1,
        backD + 1,
        sw - armW - 1,
        sd - margin,
        n,
        true,
        color,
        stroke,
        "cush"
      )}
    </>
  );
}

function renderSofaL(p: SymbolProps): ReactNode {
  const { sw, sd, color, stroke } = p;
  const legD = sd * 0.55; // lange poot langs y=0
  const legW = sw * 0.4; // korte poot links
  const backT = Math.max(3, sd * 0.1); // rug langs y=0
  const backL = Math.max(3, sw * 0.08); // rug langs x=0
  const armW = Math.max(3, sw * 0.08); // arm rechts (lange poot)
  const armD = Math.max(3, sd * 0.08); // arm onder (korte poot)

  return (
    <>
      {/* L-vormige buitenrand */}
      <Line
        points={[0, 0, sw, 0, sw, legD, legW, legD, legW, sd, 0, sd]}
        closed
        stroke={stroke}
        strokeWidth={MAIN}
        fill={color}
        opacity={0.25}
        listening={false}
      />
      {/* rugleuning langs y=0 (lange poot) */}
      <Rect
        x={0}
        y={0}
        width={sw}
        height={backT}
        stroke={stroke}
        strokeWidth={THIN}
        fill={color}
        opacity={0.35}
        listening={false}
      />
      {/* rugleuning langs x=0 (korte poot) */}
      <Rect
        x={0}
        y={backT}
        width={backL}
        height={sd - backT}
        stroke={stroke}
        strokeWidth={THIN}
        fill={color}
        opacity={0.35}
        listening={false}
      />
      {/* armleuning rechts (lange poot) */}
      <Rect
        x={sw - armW}
        y={backT}
        width={armW}
        height={legD - backT}
        stroke={stroke}
        strokeWidth={THIN}
        fill={color}
        opacity={0.35}
        listening={false}
      />
      {/* armleuning onderaan (korte poot) */}
      <Rect
        x={backL}
        y={sd - armD}
        width={legW - backL}
        height={armD}
        stroke={stroke}
        strokeWidth={THIN}
        fill={color}
        opacity={0.35}
        listening={false}
      />
      {/* kussens lange poot (rechts van de korte poot) */}
      {seatCushions(
        legW + 1,
        backT + 1,
        sw - armW - 1,
        legD - 1,
        2,
        true,
        color,
        stroke,
        "cushL"
      )}
      {/* kussens korte poot (incl. hoekkussen) */}
      {seatCushions(
        backL + 1,
        backT + 1,
        legW - 1,
        sd - armD - 1,
        2,
        false,
        color,
        stroke,
        "cushS"
      )}
    </>
  );
}

/* ------------------------------- tafels/stoelen ----------------------------- */

function renderDiningTable(p: SymbolProps): ReactNode {
  const { sw, sd, color, stroke } = p;
  const r = Math.max(2, Math.min(sw, sd) * 0.08);
  return (
    <Rect
      x={0}
      y={0}
      width={sw}
      height={sd}
      cornerRadius={r}
      stroke={stroke}
      strokeWidth={MAIN}
      fill={color}
      opacity={0.3}
      listening={false}
    />
  );
}

function renderDiningChair(p: SymbolProps): ReactNode {
  const { sw, sd, color, stroke } = p;
  const backD = Math.max(2.5, sd * 0.18);
  const r = Math.max(1.5, Math.min(sw, sd) * 0.12);
  return (
    <>
      {/* rugleuning-strook langs y=0 */}
      <Rect
        x={0}
        y={0}
        width={sw}
        height={backD}
        cornerRadius={Math.min(2, backD / 2)}
        stroke={stroke}
        strokeWidth={THIN}
        fill={color}
        opacity={0.45}
        listening={false}
      />
      {/* zitting */}
      <Rect
        x={sw * 0.06}
        y={backD + 1}
        width={sw * 0.88}
        height={sd - backD - 1 - Math.max(1, sd * 0.06)}
        cornerRadius={r}
        stroke={stroke}
        strokeWidth={MAIN}
        listening={false}
      />
    </>
  );
}

function renderDesk(p: SymbolProps): ReactNode {
  const { sw, sd, color, stroke } = p;
  const mw = sw * 0.42;
  const mh = Math.max(2, sd * 0.12);
  return (
    <>
      <Rect
        x={0}
        y={0}
        width={sw}
        height={sd}
        cornerRadius={Math.max(2, Math.min(sw, sd) * 0.06)}
        stroke={stroke}
        strokeWidth={MAIN}
        fill={color}
        opacity={0.25}
        listening={false}
      />
      {/* monitor gecentreerd tegen y=0 */}
      <Rect
        x={(sw - mw) / 2}
        y={Math.max(1.5, sd * 0.06)}
        width={mw}
        height={mh}
        cornerRadius={1}
        stroke={stroke}
        strokeWidth={THIN}
        fill={stroke}
        opacity={0.5}
        listening={false}
      />
    </>
  );
}

function renderOfficeChair(p: SymbolProps): ReactNode {
  const { sw, sd, stroke, color } = p;
  const cx = sw / 2;
  const cy = sd / 2;
  const r = Math.max(4, Math.min(sw, sd) * 0.3);

  // 5 poot-lijntjes (ster), subtiel; bovenaan beginnend (=-90 graden)
  const legs: ReactNode[] = [];
  for (let i = 0; i < 5; i++) {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    legs.push(
      <Line
        key={`leg-${i}`}
        points={[
          cx + Math.cos(a) * r * 1.05,
          cy + Math.sin(a) * r * 1.05,
          cx + Math.cos(a) * r * 1.5,
          cy + Math.sin(a) * r * 1.5,
        ]}
        stroke={stroke}
        strokeWidth={THIN}
        opacity={0.5}
        listening={false}
      />
    );
  }

  return (
    <>
      {legs}
      {/* zitting */}
      <Circle
        x={cx}
        y={cy}
        radius={r}
        stroke={stroke}
        strokeWidth={MAIN}
        fill={color}
        opacity={0.6}
        listening={false}
      />
      {/* rugleuning-boogje aan y=0-zijde (boven) */}
      <Arc
        x={cx}
        y={cy}
        innerRadius={r * 1.08}
        outerRadius={r * 1.3}
        rotation={210}
        angle={120}
        stroke={stroke}
        strokeWidth={THIN}
        listening={false}
      />
    </>
  );
}

/* --------------------------------- kasten ---------------------------------- */

function renderWardrobe(p: SymbolProps): ReactNode {
  const { sw, sd, stroke } = p;
  return (
    <>
      <Rect
        x={0}
        y={0}
        width={sw}
        height={sd}
        stroke={stroke}
        strokeWidth={MAIN}
        listening={false}
      />
      {/* diagonaalkruis (standaard kastsymbool) */}
      <Line points={[0, 0, sw, sd]} stroke={stroke} strokeWidth={THIN} opacity={0.7} listening={false} />
      <Line points={[sw, 0, 0, sd]} stroke={stroke} strokeWidth={THIN} opacity={0.7} listening={false} />
      {/* deurnaad in het midden */}
      <Line points={[sw / 2, 0, sw / 2, sd]} stroke={stroke} strokeWidth={THIN} listening={false} />
    </>
  );
}

function renderBookshelf(p: SymbolProps): ReactNode {
  const { sw, sd, stroke } = p;
  return (
    <>
      <Rect
        x={0}
        y={0}
        width={sw}
        height={sd}
        stroke={stroke}
        strokeWidth={MAIN}
        listening={false}
      />
      {/* 3 plankstreepjes, gelijk verdeeld */}
      {[0.25, 0.5, 0.75].map((t) => (
        <Line
          key={`shelf-${t}`}
          points={[sw * t, 0, sw * t, sd]}
          stroke={stroke}
          strokeWidth={THIN}
          opacity={0.7}
          listening={false}
        />
      ))}
    </>
  );
}

function renderTvUnit(p: SymbolProps): ReactNode {
  const { sw, sd, stroke } = p;
  const screenY = Math.max(2, sd * 0.18);
  return (
    <>
      <Rect
        x={0}
        y={0}
        width={sw}
        height={sd}
        cornerRadius={1.5}
        stroke={stroke}
        strokeWidth={MAIN}
        listening={false}
      />
      {/* tv-scherm: dunne lijn langs y=0 over ~70% breedte */}
      <Line
        points={[sw * 0.15, screenY, sw * 0.85, screenY]}
        stroke={stroke}
        strokeWidth={1.5}
        listening={false}
      />
    </>
  );
}

function renderCoffeeTable(p: SymbolProps): ReactNode {
  const { sw, sd, color, stroke } = p;
  const r = Math.min(sw, sd) * 0.25;
  const inset = Math.max(2, Math.min(sw, sd) * 0.1);
  return (
    <>
      <Rect
        x={0}
        y={0}
        width={sw}
        height={sd}
        cornerRadius={r}
        stroke={stroke}
        strokeWidth={MAIN}
        fill={color}
        opacity={0.3}
        listening={false}
      />
      {/* dunne binnenrand */}
      <Rect
        x={inset}
        y={inset}
        width={sw - 2 * inset}
        height={sd - 2 * inset}
        cornerRadius={Math.max(1, r - inset)}
        stroke={stroke}
        strokeWidth={THIN}
        opacity={0.7}
        listening={false}
      />
    </>
  );
}

/* -------------------------------- sanitair --------------------------------- */

function renderBathtub(p: SymbolProps): ReactNode {
  const { sw, sd, stroke } = p;
  const inset = Math.max(2, Math.min(sw, sd) * 0.1);
  const iw = sw - 2 * inset;
  const ih = sd - 2 * inset;
  const drainR = Math.max(1.5, Math.min(sw, sd) * 0.06);
  return (
    <>
      {/* buitenrand */}
      <Rect
        x={0}
        y={0}
        width={sw}
        height={sd}
        stroke={stroke}
        strokeWidth={MAIN}
        listening={false}
      />
      {/* binnenkuip: stadion-vorm */}
      <Rect
        x={inset}
        y={inset}
        width={iw}
        height={ih}
        cornerRadius={Math.min(iw, ih) / 2}
        stroke={stroke}
        strokeWidth={THIN}
        listening={false}
      />
      {/* afvoer op ~20% vanaf de korte zijde (y=0) */}
      <Circle
        x={sw / 2}
        y={sd * 0.2}
        radius={drainR}
        stroke={stroke}
        strokeWidth={THIN}
        listening={false}
      />
      {/* kraan-stip op de rand van diezelfde zijde */}
      <Circle
        x={sw / 2}
        y={inset / 2}
        radius={Math.max(1.5, Math.min(sw, sd) * 0.04)}
        fill={stroke}
        listening={false}
      />
    </>
  );
}

function renderShowerCabin(p: SymbolProps): ReactNode {
  const { sw, sd, stroke } = p;
  const minDim = Math.min(sw, sd);
  return (
    <>
      <Rect
        x={0}
        y={0}
        width={sw}
        height={sd}
        stroke={stroke}
        strokeWidth={MAIN}
        listening={false}
      />
      {/* diagonaalkruis (standaard douchesymbool) */}
      <Line points={[0, 0, sw, sd]} stroke={stroke} strokeWidth={THIN} opacity={0.7} listening={false} />
      <Line points={[sw, 0, 0, sd]} stroke={stroke} strokeWidth={THIN} opacity={0.7} listening={false} />
      {/* putje in het midden */}
      <Circle
        x={sw / 2}
        y={sd / 2}
        radius={Math.max(1.5, minDim * 0.06)}
        stroke={stroke}
        strokeWidth={THIN}
        listening={false}
      />
      {/* douchekop in een hoek */}
      <Circle
        x={sw * 0.16}
        y={sd * 0.16}
        radius={Math.max(2, minDim * 0.08)}
        stroke={stroke}
        strokeWidth={THIN}
        fill={stroke}
        opacity={0.4}
        listening={false}
      />
    </>
  );
}

function renderKitchenIsland(p: SymbolProps): ReactNode {
  const { sw, sd, stroke } = p;
  // spoelbak op de linkerhelft
  const sinkW = sw * 0.28;
  const sinkH = sd * 0.45;
  const sinkX = sw * 0.1;
  const sinkY = (sd - sinkH) / 2;
  // kookplaat: 4 cirkels in 2x2 grid op de rechterhelft
  const hobCx = sw * 0.72;
  const hobCy = sd / 2;
  const dx = sw * 0.1;
  const dy = sd * 0.18;
  const hobR = Math.max(2, Math.min(sw * 0.07, sd * 0.13));
  const burners = [
    [hobCx - dx, hobCy - dy],
    [hobCx + dx, hobCy - dy],
    [hobCx - dx, hobCy + dy],
    [hobCx + dx, hobCy + dy],
  ];
  return (
    <>
      {/* werkblad */}
      <Rect
        x={0}
        y={0}
        width={sw}
        height={sd}
        cornerRadius={1.5}
        stroke={stroke}
        strokeWidth={MAIN}
        listening={false}
      />
      {/* spoelbak */}
      <Rect
        x={sinkX}
        y={sinkY}
        width={sinkW}
        height={sinkH}
        cornerRadius={Math.max(1.5, Math.min(sinkW, sinkH) * 0.15)}
        stroke={stroke}
        strokeWidth={THIN}
        listening={false}
      />
      {/* kraanstip boven de spoelbak (y=0-zijde) */}
      <Circle
        x={sinkX + sinkW / 2}
        y={Math.max(2, sinkY * 0.5)}
        radius={Math.max(1.5, Math.min(sw, sd) * 0.04)}
        fill={stroke}
        listening={false}
      />
      {/* kookplaat */}
      {burners.map(([bx, by], i) => (
        <Circle
          key={`burner-${i}`}
          x={bx}
          y={by}
          radius={hobR}
          stroke={stroke}
          strokeWidth={THIN}
          listening={false}
        />
      ))}
    </>
  );
}

/* --------------------------------- mapping --------------------------------- */

const RENDERERS: Record<FurnitureKind, (p: SymbolProps) => ReactNode> = {
  "bed-single": (p) => renderBed(p, 1),
  "bed-double": (p) => renderBed(p, 2),
  "bed-king": (p) => renderBed(p, 2),
  "sofa-2": (p) => renderSofa(p, 2),
  "sofa-3": (p) => renderSofa(p, 3),
  "sofa-l": renderSofaL,
  "dining-table": renderDiningTable,
  "dining-chair": renderDiningChair,
  desk: renderDesk,
  "office-chair": renderOfficeChair,
  wardrobe: renderWardrobe,
  bookshelf: renderBookshelf,
  "tv-unit": renderTvUnit,
  "coffee-table": renderCoffeeTable,
  bathtub: renderBathtub,
  "shower-cabin": renderShowerCabin,
  "kitchen-island": renderKitchenIsland,
};

export function FurnitureSymbol({
  kind,
  sw,
  sd,
  color,
  stroke,
}: {
  kind: FurnitureKind;
  sw: number;
  sd: number;
  color: string;
  stroke: string;
}) {
  return <>{RENDERERS[kind]({ sw, sd, color, stroke })}</>;
}
