// PNG/SVG export helpers. Werkt in de browser (client-side).

/**
 * Serialiseert een SVGElement naar een Blob en download het als PNG.
 * Gebruikt een off-screen <canvas> als tussenstap.
 */
export async function exportSvgAsPng(
  svgEl: SVGSVGElement,
  filename = "plattegrond.png",
  pixelRatio = 2,
): Promise<void> {
  const width = svgEl.viewBox.baseVal.width || svgEl.clientWidth || 800;
  const height = svgEl.viewBox.baseVal.height || svgEl.clientHeight || 600;

  const svgData = new XMLSerializer().serializeToString(svgEl);
  const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.width = width * pixelRatio;
  img.height = height * pixelRatio;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });
  URL.revokeObjectURL(url);

  const canvas = document.createElement("canvas");
  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(pixelRatio, pixelRatio);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  await new Promise<void>((resolve) => {
    canvas.toBlob((pngBlob) => {
      if (pngBlob) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(pngBlob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      resolve();
    }, "image/png");
  });
}

/**
 * Serialiseert een SVGElement en download het direct als .svg bestand.
 */
export function exportSvg(svgEl: SVGSVGElement, filename = "plattegrond.svg"): void {
  const svgData = new XMLSerializer().serializeToString(svgEl);
  const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
