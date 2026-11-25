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

// ── Dakbedekking ────────────────────────────────────────────────────────────

// Afmeting van één textuur-tegel op het dakvlak (u = langs de goot, v = afschot).
export const ROOF_TILE_SIZE: Record<"tiles" | "reed" | "panels", { w: number; h: number }> = {
  tiles: { w: 6 * 0.21, h: 4 * 0.31 }, // 6 pannen breed (werkende breedte 21 cm), 4 latten (31 cm)
  reed: { w: 1.0, h: 1.0 },
  panels: { w: 1.0, h: 1.0 },
};

const roofCache = new Map<string, { map: THREE.CanvasTexture; bump: THREE.CanvasTexture }>();

function canvasTex(c: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Kleur-map + bump-map. UV-v loopt in de afschotrichting (omlaag = grotere v),
// in het canvas is dat naar boven (flipY), dus de onderrand van een pan ligt
// aan de bovenkant van zijn rij in het canvas.
export function roofTextures(kind: "tiles" | "reed" | "panels", color: string) {
  if (typeof document === "undefined") return null;
  const key = `${kind}|${color}`;
  const hit = roofCache.get(key);
  if (hit) return hit;
  const S = 512;
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = S;
    c.height = S;
    return c;
  };
  const cMap = mk();
  const cBump = mk();
  const m = cMap.getContext("2d")!;
  const bmp = cBump.getContext("2d")!;
  const r = rng(kind === "tiles" ? 21 : 5);
  const [R, G, B] = hexToRgb(color);
  const col = (f: number) => `rgb(${Math.min(255, Math.round(R * f))},${Math.min(255, Math.round(G * f))},${Math.min(255, Math.round(B * f))})`;

  if (kind === "tiles") {
    const cols = 6;
    const rows = 4;
    const tw = S / cols;
    const th = S / rows;
    bmp.fillStyle = "#000";
    bmp.fillRect(0, 0, S, S);
    for (let row = 0; row < rows; row++) {
      const y0 = row * th;
      const shift = row % 2 ? tw * 0.08 : 0; // lichte verspringing
      for (let c = -1; c <= cols; c++) {
        const x0 = c * tw + shift;
        const base = 0.92 + (r() - 0.5) * 0.12;
        // golf (S-pan): helder op de bolling, donker in de goot
        for (let x = 0; x < tw; x++) {
          const ph = (x / tw) * Math.PI * 2;
          const wave = 0.5 + 0.5 * Math.cos(ph - 0.6);
          m.fillStyle = col(base * (0.72 + 0.42 * wave));
          m.fillRect(x0 + x, y0, 1, th);
          const g = Math.round(70 + 150 * wave);
          bmp.fillStyle = `rgb(${g},${g},${g})`;
          bmp.fillRect(x0 + x, y0, 1, th);
        }
        // naad tussen de pannen
        m.fillStyle = "rgba(0,0,0,0.35)";
        m.fillRect(x0, y0, 2, th);
      }
      // onderrand van de pan (overlap): slagschaduw + dikte
      const grad = m.createLinearGradient(0, y0, 0, y0 + th * 0.22);
      grad.addColorStop(0, "rgba(0,0,0,0.65)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      m.fillStyle = grad;
      m.fillRect(0, y0, S, th * 0.22);
      m.fillStyle = "rgba(255,255,255,0.10)";
      m.fillRect(0, y0 + th - 3, S, 3);
      const bg = bmp.createLinearGradient(0, y0, 0, y0 + th);
      bg.addColorStop(0, "rgba(0,0,0,0.9)");
      bg.addColorStop(0.25, "rgba(0,0,0,0)");
      bg.addColorStop(1, "rgba(255,255,255,0.25)");
      bmp.fillStyle = bg;
      bmp.fillRect(0, y0, S, th);
    }
  } else if (kind === "reed") {
    m.fillStyle = color;
    m.fillRect(0, 0, S, S);
    bmp.fillStyle = "#808080";
    bmp.fillRect(0, 0, S, S);
    for (let k = 0; k < 2600; k++) {
      const x = r() * S;
      const y = r() * S;
      const len = 30 + r() * 90;
      const f = 0.7 + r() * 0.55;
      m.strokeStyle = col(f);
      m.lineWidth = 1 + r() * 1.2;
      m.beginPath();
      m.moveTo(x, y);
      m.lineTo(x + (r() - 0.5) * 3, y + len);
      m.stroke();
      const g = Math.round(90 + r() * 120);
      bmp.strokeStyle = `rgb(${g},${g},${g})`;
      bmp.lineWidth = 1.5;
      bmp.beginPath();
      bmp.moveTo(x, y);
      bmp.lineTo(x + (r() - 0.5) * 3, y + len);
      bmp.stroke();
    }
    // vage gangen (lagen riet)
    for (let i = 0; i < 4; i++) {
      m.fillStyle = "rgba(0,0,0,0.05)";
      m.fillRect(0, (i * S) / 4, S, 6);
    }
  } else {
    // staande-naad/sandwichpanelen
    m.fillStyle = color;
    m.fillRect(0, 0, S, S);
    bmp.fillStyle = "#555";
    bmp.fillRect(0, 0, S, S);
    for (let i = 0; i < 4; i++) {
      m.fillStyle = "rgba(255,255,255,0.12)";
      m.fillRect((i * S) / 4, 0, 4, S);
      bmp.fillStyle = "#fff";
      bmp.fillRect((i * S) / 4, 0, 6, S);
    }
  }
  const res = { map: canvasTex(cMap, true), bump: canvasTex(cBump, false) };
  roofCache.set(key, res);
  return res;
}
