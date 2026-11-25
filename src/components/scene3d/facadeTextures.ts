// Procedurele geveltexturen (baksteen, houten delen, pleister) voor de 3D-weergave.
// Eén basistextuur per (soort, kleur, voeg) wordt gecachet; per mesh wordt een
// clone gemaakt met een `repeat` op ware grootte, zodat stenen/delen altijd op
// schaal staan, ongeacht de lengte van het wandsegment.

import * as THREE from "three";
import type { FacadeFinish } from "@/lib/domain/types";

// Fysieke afmeting die één textuur-tegel beslaat (m).
export const TILE_SIZE: Record<FacadeFinish["kind"], { w: number; h: number }> = {
  // Waalformaat 210×50 mm + voeg 10–12 mm → 8 koppen breed, 16 lagen hoog.
  brick: { w: 8 * 0.222, h: 16 * 0.0625 },
  "boards-v": { w: 1.2, h: 1.2 }, // 8 delen van 150 mm
  "boards-h": { w: 1.2, h: 1.2 },
  plaster: { w: 2, h: 2 },
};

const cache = new Map<string, THREE.CanvasTexture>();

// Kleine deterministische random zodat de textuur stabiel blijft.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function vary(hex: string, amount: number, r: () => number): string {
  const [R, G, B] = hexToRgb(hex);
  const f = 1 + (r() - 0.5) * 2 * amount;
  const t = (r() - 0.5) * amount * 40; // lichte tintverschuiving
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f + t * 0.3)));
  return `rgb(${c(R)},${c(G + t * 0.1)},${c(B - t * 0.2)})`;
}

function drawBrick(ctx: CanvasRenderingContext2D, S: number, color: string, mortar: string) {
  const r = rng(7);
  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, S, S);
  const cols = 8;
  const rows = 16;
  const bw = S / cols;
  const bh = S / rows;
  const joint = Math.max(2, Math.round(bh * 0.18));
  for (let row = 0; row < rows; row++) {
    const shift = row % 2 === 0 ? 0 : bw / 2; // halfsteens verband
    for (let c = -1; c < cols + 1; c++) {
      const x = c * bw + shift;
      ctx.fillStyle = vary(color, 0.14, r);
      ctx.fillRect(x + joint / 2, row * bh + joint / 2, bw - joint, bh - joint);
      // handvorm-nuance: vlekjes en een iets donkerder rand
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      ctx.fillRect(x + joint / 2, row * bh + bh - joint * 1.2, bw - joint, joint * 0.7);
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = r() > 0.5 ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";
        ctx.fillRect(x + joint + r() * (bw - joint * 3), row * bh + joint + r() * (bh - joint * 3), 3 + r() * 6, 2 + r() * 3);
      }
    }
  }
}

function drawBoards(ctx: CanvasRenderingContext2D, S: number, color: string, seam: string, vertical: boolean) {
  const r = rng(11);
  const n = 8;
  const bw = S / n;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = vary(color, 0.08, r);
    if (vertical) ctx.fillRect(i * bw, 0, bw, S);
    else ctx.fillRect(0, i * bw, S, bw);
    // houtnerf
    for (let k = 0; k < 10; k++) {
      ctx.strokeStyle = r() > 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      const o = i * bw + r() * bw;
      if (vertical) {
        ctx.moveTo(o, 0);
        ctx.lineTo(o + (r() - 0.5) * 4, S);
      } else {
        ctx.moveTo(0, o);
        ctx.lineTo(S, o + (r() - 0.5) * 4);
      }
      ctx.stroke();
    }
    // naad / rabat-schaduw
    ctx.fillStyle = seam;
    if (vertical) ctx.fillRect(i * bw, 0, Math.max(2, bw * 0.06), S);
    else ctx.fillRect(0, i * bw + bw - Math.max(2, bw * 0.08), S, Math.max(2, bw * 0.08));
  }
}

function drawPlaster(ctx: CanvasRenderingContext2D, S: number, color: string) {
  const r = rng(3);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, S, S);
  for (let k = 0; k < 1400; k++) {
    ctx.fillStyle = r() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
    ctx.fillRect(r() * S, r() * S, 2, 2);
  }
}

export function facadeBaseTexture(kind: FacadeFinish["kind"], color: string, mortar?: string): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const key = `${kind}|${color}|${mortar ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 512;
  const canvas = document.createElement("canvas");
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (kind === "brick") drawBrick(ctx, S, color, mortar ?? "#cfc8bb");
  else if (kind === "boards-v") drawBoards(ctx, S, color, mortar ?? "rgba(0,0,0,0.55)", true);
  else if (kind === "boards-h") drawBoards(ctx, S, color, mortar ?? "rgba(0,0,0,0.55)", false);
  else drawPlaster(ctx, S, color);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

// Clone met repeat voor een vlak van w × h meter (UV 0..1 over het vlak).
export function facadeTextureFor(
  kind: FacadeFinish["kind"],
  color: string,
  mortar: string | undefined,
  w: number,
  h: number,
): THREE.Texture | null {
  const base = facadeBaseTexture(kind, color, mortar);
  if (!base) return null;
  const t = base.clone();
  const tile = TILE_SIZE[kind];
  t.repeat.set(w / tile.w, h / tile.h);
  t.needsUpdate = true;
  return t;
}

// Textuur voor geometrie met UV's in meters (ExtrudeGeometry/ShapeGeometry).
export function facadeTextureWorldUV(kind: FacadeFinish["kind"], color: string, mortar?: string): THREE.Texture | null {
  const base = facadeBaseTexture(kind, color, mortar);
  if (!base) return null;
  const t = base.clone();
  const tile = TILE_SIZE[kind];
  t.repeat.set(1 / tile.w, 1 / tile.h);
  t.needsUpdate = true;
  return t;
}
