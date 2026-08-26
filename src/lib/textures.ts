// Procedurele materialen voor de 3D-weergave.
//
// Twee dingen maakten het verschil tussen "behang" en "materiaal":
//
// 1. WARE MAAT. Vroeger stond de herhaling op een vast getal (repeat = 2 of 3),
//    waardoor een steen op een muur van 10 m even groot leek als op een muur van
//    1 m. Nu weet elke textuur hoe groot één tegel in het echt is (`tileSizeM`)
//    en rekent de aanroeper de herhaling uit met `repeatFor()`.
//
// 2. RELIËF. Zonder normal map blijft alles vlak, hoe goed de belichting ook is.
//    De normal map wordt afgeleid uit dezelfde tekening: het luminantieverloop
//    per pixel wordt omgezet naar een normaalvector.
//
// Alles blijft procedureel — de app is offline-first, dus geen gedownloade
// texturen.

import * as THREE from "three";

export type SurfaceKind =
  | "brick"
  | "sand-lime"
  | "aerated-concrete"
  | "concrete"
  | "plaster"
  | "wood"
  | "wood-beam"
  | "steel"
  | "roof-tile"
  | "tile"
  | "carpet";

export interface SurfaceSpec {
  /** Werkelijke breedte én hoogte van één textuurtegel, in meters. */
  tileSizeM: number;
  roughness: number;
  metalness: number;
  /** Sterkte van het reliëf in de normal map. */
  bump: number;
  defaultColor: string;
}

// Maten zijn de Nederlandse praktijkmaten: een waalformaat-steen is 210×50 mm
// met 10 mm voeg, een dakpan ligt op ±420×330 mm.
export const SURFACE_SPECS: Record<SurfaceKind, SurfaceSpec> = {
  brick: { tileSizeM: 0.88, roughness: 0.95, metalness: 0, bump: 2.2, defaultColor: "#9c6b52" },
  "sand-lime": { tileSizeM: 1.0, roughness: 0.9, metalness: 0, bump: 1.4, defaultColor: "#d8d5cf" },
  "aerated-concrete": { tileSizeM: 1.2, roughness: 0.92, metalness: 0, bump: 1.0, defaultColor: "#e2e0da" },
  concrete: { tileSizeM: 1.5, roughness: 0.88, metalness: 0, bump: 0.8, defaultColor: "#a8a8a8" },
  plaster: { tileSizeM: 1.0, roughness: 0.95, metalness: 0, bump: 0.5, defaultColor: "#efeae0" },
  wood: { tileSizeM: 1.2, roughness: 0.62, metalness: 0, bump: 1.1, defaultColor: "#b08355" },
  "wood-beam": { tileSizeM: 1.0, roughness: 0.7, metalness: 0, bump: 1.4, defaultColor: "#9c7248" },
  steel: { tileSizeM: 0.6, roughness: 0.38, metalness: 0.88, bump: 0.5, defaultColor: "#8d949c" },
  "roof-tile": { tileSizeM: 1.32, roughness: 0.82, metalness: 0, bump: 2.6, defaultColor: "#7d4a3a" },
  tile: { tileSizeM: 0.9, roughness: 0.35, metalness: 0.04, bump: 1.2, defaultColor: "#d9d4c8" },
  carpet: { tileSizeM: 0.8, roughness: 1.0, metalness: 0, bump: 0.6, defaultColor: "#8d8378" },
};

const SIZE = 256;

interface BaseTextures {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}
const baseCache = new Map<string, BaseTextures>();

function makeCanvas(): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas-context niet beschikbaar voor textuur");
  return { c, ctx };
}

function shade(hex: string, f: number): string {
  const col = new THREE.Color(hex);
  col.r = Math.min(1, col.r * f);
  col.g = Math.min(1, col.g * f);
  col.b = Math.min(1, col.b * f);
  return `#${col.getHexString()}`;
}

/**
 * Leidt een normal map af uit de helderheid van de tekening: waar de kleur
 * snel verandert (een voeg, een houtnerf) ontstaat een helling. Wrapt rond,
 * zodat de tegels naadloos blijven aansluiten.
 */
function normalFromCanvas(src: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const sctx = src.getContext("2d")!;
  const img = sctx.getImageData(0, 0, SIZE, SIZE).data;
  const lum = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const o = i * 4;
    lum[i] = (img[o] * 0.299 + img[o + 1] * 0.587 + img[o + 2] * 0.114) / 255;
  }

  const { c: out, ctx: octx } = makeCanvas();
  const dst = octx.createImageData(SIZE, SIZE);
  const at = (x: number, y: number) =>
    lum[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)];

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      // Normaal van het hoogteveld; z = 1 zodat vlakke delen recht vooruit wijzen.
      const len = Math.hypot(dx, dy, 1);
      const o = (y * SIZE + x) * 4;
      dst.data[o] = ((-dx / len) * 0.5 + 0.5) * 255;
      dst.data[o + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      dst.data[o + 2] = (1 / len) * 0.5 * 255 + 127.5;
      dst.data[o + 3] = 255;
    }
  }
  octx.putImageData(dst, 0, 0);
  return out;
}

// ── Tekeningen per materiaal ────────────────────────────────────────────────

function drawBrick(ctx: CanvasRenderingContext2D, color: string) {
  // Waalformaat 210×50 mm + 10 mm voeg, over een tegel van 0,88 m: 4 lagen van
  // 4 stenen passen daar precies in.
  ctx.fillStyle = shade(color, 0.62);
  ctx.fillRect(0, 0, SIZE, SIZE);
  const bw = SIZE / 4;
  const bh = SIZE / 16;
  const joint = Math.max(2, SIZE * 0.012);
  for (let row = 0, y = 0; y < SIZE; row++, y += bh) {
    const offset = row % 2 ? -bw / 2 : 0;
    for (let x = offset; x < SIZE; x += bw) {
      ctx.fillStyle = shade(color, 0.86 + Math.random() * 0.28);
      ctx.fillRect(x + joint / 2, y + joint / 2, bw - joint, bh - joint);
    }
  }
}

function drawBlock(ctx: CanvasRenderingContext2D, color: string, rows: number) {
  ctx.fillStyle = shade(color, 0.82);
  ctx.fillRect(0, 0, SIZE, SIZE);
  const bh = SIZE / rows;
  const bw = SIZE / 2;
  const joint = Math.max(1.5, SIZE * 0.006);
  for (let row = 0, y = 0; y < SIZE; row++, y += bh) {
    const offset = row % 2 ? -bw / 2 : 0;
    for (let x = offset; x < SIZE; x += bw) {
      ctx.fillStyle = shade(color, 0.96 + Math.random() * 0.08);
      ctx.fillRect(x + joint / 2, y + joint / 2, bw - joint, bh - joint);
    }
  }
}

function drawNoise(ctx: CanvasRenderingContext2D, color: string, amount: number) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Houtnerf. `alongX` bepaalt de richting: bij een balk moet de nerf in de
 * lengterichting lopen, niet dwars — dat is precies wat hout op hout laat
 * lijken.
 */
function drawWood(ctx: CanvasRenderingContext2D, color: string, planks: number) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SIZE, SIZE);
  // Nerf: lange, licht golvende lijnen langs de X-as.
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = shade(color, 0.74 + Math.random() * 0.36);
    ctx.lineWidth = 0.4 + Math.random() * 1.8;
    ctx.beginPath();
    const y = Math.random() * SIZE;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(
      SIZE / 3, y + (Math.random() - 0.5) * 10,
      (2 * SIZE) / 3, y + (Math.random() - 0.5) * 10,
      SIZE, y,
    );
    ctx.stroke();
  }
  // Een paar kwasten maken het onmiskenbaar hout.
  for (let i = 0; i < 3; i++) {
    const kx = Math.random() * SIZE;
    const ky = Math.random() * SIZE;
    for (let r = 7; r > 0; r--) {
      ctx.strokeStyle = shade(color, 0.6 + r * 0.04);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(kx, ky, r * 1.6, r * 0.7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // Planknaden dwars op de nerf.
  if (planks > 0) {
    ctx.strokeStyle = shade(color, 0.5);
    ctx.lineWidth = 1.5;
    for (let y = 0; y <= SIZE; y += SIZE / planks) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(SIZE, y);
      ctx.stroke();
    }
  }
}

function drawSteel(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, SIZE, SIZE);
  // Geborsteld: fijne lijnen in de lengterichting.
  for (let i = 0; i < 400; i++) {
    ctx.strokeStyle = shade(color, 0.92 + Math.random() * 0.16);
    ctx.lineWidth = 0.4;
    const y = Math.random() * SIZE;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(SIZE, y);
    ctx.stroke();
  }
}

function drawRoofTile(ctx: CanvasRenderingContext2D, color: string) {
  // Opnieuw dekkende pannen: rijen met een halve verspringing en een ronde kop.
  ctx.fillStyle = shade(color, 0.55);
  ctx.fillRect(0, 0, SIZE, SIZE);
  const cols = 4;
  const rows = 4;
  const tw = SIZE / cols;
  const th = SIZE / rows;
  for (let row = 0, y = 0; row < rows + 1; row++, y += th) {
    const offset = row % 2 ? -tw / 2 : 0;
    for (let x = offset; x < SIZE; x += tw) {
      ctx.fillStyle = shade(color, 0.88 + Math.random() * 0.24);
      ctx.beginPath();
      ctx.moveTo(x + 1, y);
      ctx.lineTo(x + tw - 1, y);
      ctx.lineTo(x + tw - 1, y + th * 0.72);
      ctx.quadraticCurveTo(x + tw / 2, y + th * 1.02, x + 1, y + th * 0.72);
      ctx.closePath();
      ctx.fill();
      // Golf in de pan.
      ctx.strokeStyle = shade(color, 0.7);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x + tw * 0.3, y);
      ctx.lineTo(x + tw * 0.3, y + th * 0.75);
      ctx.stroke();
    }
  }
}

function drawTile(ctx: CanvasRenderingContext2D, color: string, grout = "#cfcabd") {
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const t = SIZE / 3; // 3 tegels van 30 cm op 0,9 m
  const g = Math.max(2, SIZE * 0.014);
  for (let y = 0; y < SIZE; y += t) {
    for (let x = 0; x < SIZE; x += t) {
      ctx.fillStyle = shade(color, 0.97 + Math.random() * 0.06);
      ctx.fillRect(x + g / 2, y + g / 2, t - g, t - g);
    }
  }
}

function drawCarpet(ctx: CanvasRenderingContext2D, color: string) {
  drawNoise(ctx, color, 34);
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = shade(color, 0.85 + Math.random() * 0.3);
    ctx.fillRect(Math.random() * SIZE, Math.random() * SIZE, 1.5, 1.5);
  }
}

function draw(kind: SurfaceKind, ctx: CanvasRenderingContext2D, color: string) {
  switch (kind) {
    case "brick": return drawBrick(ctx, color);
    case "sand-lime": return drawBlock(ctx, color, 5);
    case "aerated-concrete": return drawBlock(ctx, color, 4);
    case "concrete": return drawNoise(ctx, color, 26);
    case "plaster": return drawNoise(ctx, color, 12);
    case "wood": return drawWood(ctx, color, 4);
    case "wood-beam": return drawWood(ctx, color, 0);
    case "steel": return drawSteel(ctx, color);
    case "roof-tile": return drawRoofTile(ctx, color);
    case "tile": return drawTile(ctx, color);
    case "carpet": return drawCarpet(ctx, color);
  }
}

function base(kind: SurfaceKind, color: string): BaseTextures {
  const key = `${kind}:${color}`;
  const hit = baseCache.get(key);
  if (hit) return hit;

  const { c, ctx } = makeCanvas();
  draw(kind, ctx, color);

  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;

  const normalMap = new THREE.CanvasTexture(
    normalFromCanvas(c, SURFACE_SPECS[kind].bump),
  );
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;

  const out = { map, normalMap };
  baseCache.set(key, out);
  return out;
}

/** Hoe vaak past de tegel op een vlak van deze werkelijke afmeting? */
export function repeatFor(widthM: number, heightM: number, tileSizeM: number) {
  return {
    u: Math.max(0.05, widthM / tileSizeM),
    v: Math.max(0.05, heightM / tileSizeM),
  };
}

export interface Surface {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughness: number;
  metalness: number;
}

/**
 * Materiaal voor een vlak van `widthM × heightM` meter. De textuur wordt
 * gekloond zodat elk vlak zijn eigen herhaling heeft zonder de tekening
 * opnieuw te maken.
 */
export function makeSurface(
  kind: SurfaceKind,
  widthM: number,
  heightM: number,
  color?: string,
): Surface {
  const spec = SURFACE_SPECS[kind];
  const b = base(kind, color ?? spec.defaultColor);
  const { u, v } = repeatFor(widthM, heightM, spec.tileSizeM);

  const map = b.map.clone();
  map.needsUpdate = true;
  map.repeat.set(u, v);
  const normalMap = b.normalMap.clone();
  normalMap.needsUpdate = true;
  normalMap.repeat.set(u, v);

  return { map, normalMap, roughness: spec.roughness, metalness: spec.metalness };
}

/**
 * Variant voor geometrie waarvan de UV's al in METERS staan — three's
 * ShapeGeometry doet dat (uv = vertexpositie), en de dakmesh in roofGeometry
 * ook. Dan is de herhaling simpelweg één tegel per `tileSizeM`, ongeacht hoe
 * groot het vlak is.
 */
export function makeSurfaceMeterUv(kind: SurfaceKind, color?: string): Surface {
  return makeSurface(kind, 1, 1, color);
}

/**
 * Meng twee hex-kleuren. Gebruikt om een statuskleur als lichte tint over een
 * materiaalkleur te leggen: een nieuwe bakstenen muur moet nog steeds baksteen
 * zijn, niet oranje plastic.
 */
export function mixHex(base: string, tint: string | null, amount: number): string {
  if (!tint || amount <= 0) return base;
  const h = (c: string) => {
    const v = c.replace("#", "");
    const n = parseInt(v.length === 3 ? v.split("").map((x) => x + x).join("") : v, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [r1, g1, b1] = h(base);
  const [r2, g2, b2] = h(tint);
  const t = Math.min(1, amount);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `#${[mix(r1, r2), mix(g1, g2), mix(b1, b2)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Standaardkleur van een materiaal — het startpunt voor elke tint. */
export function defaultColorFor(kind: SurfaceKind): string {
  return SURFACE_SPECS[kind].defaultColor;
}

/** Welk oppervlak hoort bij een muurmateriaal uit het domeinmodel. */
export function surfaceForWallMaterial(material: string): SurfaceKind {
  switch (material) {
    case "brick": return "brick";
    case "sand-lime": return "sand-lime";
    case "aerated-concrete": return "aerated-concrete";
    case "concrete": return "concrete";
    case "timber-frame": return "wood";
    case "gypsum": return "plaster";
    default: return "plaster";
  }
}

/** Welk oppervlak hoort bij een vloerafwerking. */
export function surfaceForFloorMaterial(material: string): SurfaceKind {
  switch (material) {
    case "tile": return "tile";
    case "wood": return "wood";
    case "carpet": return "carpet";
    case "stone": return "concrete";
    case "concrete": return "concrete";
    default: return "concrete";
  }
}
