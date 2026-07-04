// Procedurele Three.js-texturen via een 256×256 canvas. Met cache zodat dezelfde
// material+kleur-combinatie niet telkens opnieuw getekend wordt.

import * as THREE from "three";

const cache = new Map<string, THREE.CanvasTexture>();

function makeCanvas(): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas-context niet beschikbaar voor textuur");
  return { c, ctx };
}

function finalize(c: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.needsUpdate = true;
  return tex;
}

function shade(hex: string, f: number): string {
  const col = new THREE.Color(hex);
  col.r = Math.min(1, col.r * f);
  col.g = Math.min(1, col.g * f);
  col.b = Math.min(1, col.b * f);
  return `#${col.getHexString()}`;
}

export function makeBrickTexture(color: string): THREE.CanvasTexture {
  const key = `brick:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, ctx } = makeCanvas();
  ctx.fillStyle = shade(color, 0.7); // voeg/mortel
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = color;
  const bw = 64;
  const bh = 28;
  const gap = 4;
  for (let row = 0, y = 0; y < 256; row++, y += bh + gap) {
    const offset = row % 2 ? -bw / 2 : 0;
    for (let x = offset; x < 256; x += bw + gap) {
      ctx.fillStyle = shade(color, 0.92 + Math.random() * 0.16);
      ctx.fillRect(x, y, bw, bh);
    }
  }
  const tex = finalize(c, 3);
  cache.set(key, tex);
  return tex;
}

export function makeWoodTexture(color: string): THREE.CanvasTexture {
  const key = `wood:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, ctx } = makeCanvas();
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = shade(color, 0.8 + Math.random() * 0.3);
    ctx.lineWidth = 0.5 + Math.random() * 1.5;
    ctx.beginPath();
    const y = Math.random() * 256;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(85, y + (Math.random() - 0.5) * 8, 170, y + (Math.random() - 0.5) * 8, 256, y);
    ctx.stroke();
  }
  // planknaden
  ctx.strokeStyle = shade(color, 0.6);
  ctx.lineWidth = 1.5;
  for (let x = 0; x <= 256; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  const tex = finalize(c, 2);
  cache.set(key, tex);
  return tex;
}

export function makeTileTexture(color: string, groutColor = "#cfcabd"): THREE.CanvasTexture {
  const key = `tile:${color}:${groutColor}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, ctx } = makeCanvas();
  ctx.fillStyle = groutColor;
  ctx.fillRect(0, 0, 256, 256);
  const t = 64;
  const g = 4;
  ctx.fillStyle = color;
  for (let y = 0; y < 256; y += t) {
    for (let x = 0; x < 256; x += t) {
      ctx.fillStyle = shade(color, 0.96 + Math.random() * 0.08);
      ctx.fillRect(x + g / 2, y + g / 2, t - g, t - g);
    }
  }
  const tex = finalize(c, 3);
  cache.set(key, tex);
  return tex;
}

export function makeConcreteTexture(color = "#a8a8a8"): THREE.CanvasTexture {
  const key = `concrete:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const { c, ctx } = makeCanvas();
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 256);
  const img = ctx.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 26;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  const tex = finalize(c, 2);
  cache.set(key, tex);
  return tex;
}
