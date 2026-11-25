// PNG-export van de werkblad-plattegrond. Serialiseert de bestaande SVG naar
// een off-screen canvas (2× pixel-ratio voor printkwaliteit) en geeft een Blob.
// De SVG gebruikt alleen vectorvormen + tekst, dus geen CORS-taint.

export async function svgToPngBlob(svg: SVGSVGElement, pixelRatio = 2): Promise<Blob> {
  const vb = svg.viewBox.baseVal;
  const w = vb && vb.width ? vb.width : svg.clientWidth || 800;
  const h = vb && vb.height ? vb.height : svg.clientHeight || 600;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const data = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([data], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * pixelRatio);
    canvas.height = Math.round(h * pixelRatio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas-context niet beschikbaar");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("PNG-export (toBlob) mislukt"))),
        "image/png",
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("SVG kon niet worden geladen voor export"));
    img.src = src;
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
