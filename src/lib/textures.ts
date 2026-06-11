// Procedurele Three.js texturen via HTML Canvas.
// Alle functies zijn pure; maak de textuur eenmalig aan en hergebruik via cache.

const cache = new Map<string, unknown>();

function getOrCreate<T>(key: string, factory: () => T): T {
  if (!cache.has(key)) cache.set(key, factory());
  return cache.get(key) as T;
}

function makeCanvas(w = 256, h = 256): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

// Maakt een CanvasTexture-constructorfunctie (zodat we Three.js niet hoeven te importeren hier).
// De canvas wordt teruggegeven; de aanroeper maakt daar een THREE.CanvasTexture van.
export function makeBrickCanvas(baseColor = "#c8705a"): HTMLCanvasElement {
  return getOrCreate(`brick-${baseColor}`, () => {
    const c = makeCanvas(256, 128);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 256, 128);
    const mortarColor = "#9e9480";
    ctx.strokeStyle = mortarColor;
    ctx.lineWidth = 2;
    const bh = 32; // brick height
    const bw = 64; // brick width
    for (let row = 0; row < 4; row++) {
      const offset = row % 2 === 0 ? 0 : bw / 2;
      ctx.fillStyle = baseColor;
      for (let col = -1; col < 5; col++) {
        const x = col * bw + offset;
        const y = row * bh;
        ctx.fillStyle = shadeColor(baseColor, (Math.random() - 0.5) * 20);
        ctx.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        ctx.strokeRect(x + 1, y + 1, bw - 2, bh - 2);
      }
    }
    return c;
  }) as HTMLCanvasElement;
}

export function makeWoodCanvas(baseColor = "#b8855a"): HTMLCanvasElement {
  return getOrCreate(`wood-${baseColor}`, () => {
    const c = makeCanvas(256, 256);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, 256, 256);
    // Houtnerf: dunne horizontale lijnen
    ctx.strokeStyle = shadeColor(baseColor, -30);
    ctx.lineWidth = 1;
    for (let y = 0; y < 256; y += 6 + Math.floor(Math.random() * 4)) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x < 256; x += 16) {
        ctx.lineTo(x + 8, y + (Math.random() - 0.5) * 2);
        ctx.lineTo(x + 16, y);
      }
      ctx.globalAlpha = 0.25 + Math.random() * 0.2;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return c;
  }) as HTMLCanvasElement;
}

export function makeTileCanvas(tileColor = "#e8e0d4", groutColor = "#c0b8a8"): HTMLCanvasElement {
  return getOrCreate(`tile-${tileColor}-${groutColor}`, () => {
    const c = makeCanvas(256, 256);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = groutColor;
    ctx.fillRect(0, 0, 256, 256);
    const tw = 60, th = 60, gap = 4;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        ctx.fillStyle = shadeColor(tileColor, (Math.random() - 0.5) * 10);
        ctx.fillRect(col * (tw + gap) + gap, row * (th + gap) + gap, tw, th);
      }
    }
    return c;
  }) as HTMLCanvasElement;
}

export function makeConcreteCanvas(): HTMLCanvasElement {
  return getOrCreate("concrete", () => {
    const c = makeCanvas(256, 256);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#b0aaa0";
    ctx.fillRect(0, 0, 256, 256);
    // Willekeurig graniet-patroon
    for (let i = 0; i < 800; i++) {
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    return c;
  }) as HTMLCanvasElement;
}

export function makeRoofTileCanvas(): HTMLCanvasElement {
  return getOrCreate("roof-tile", () => {
    const c = makeCanvas(256, 128);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#6b4423";
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = "#8b5e3c";
    const tw = 24, th = 16;
    for (let row = 0; row < 8; row++) {
      const offset = row % 2 === 0 ? 0 : tw / 2;
      for (let col = -1; col < 12; col++) {
        const x = col * tw + offset;
        const y = row * th;
        ctx.fillStyle = shadeColor("#7d4f2a", (Math.random() - 0.5) * 25);
        ctx.beginPath();
        ctx.ellipse(x + tw / 2, y + th, tw / 2, th * 0.8, 0, Math.PI, 0, true);
        ctx.fill();
      }
    }
    return c;
  }) as HTMLCanvasElement;
}

function shadeColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount));
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount));
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}
