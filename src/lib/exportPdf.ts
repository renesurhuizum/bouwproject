// Maatvaste vector-PDF van het werkblad (aannemer/vergunning).
// De plan-SVG wordt met een vaste ppm (px per meter) gerenderd; hier plaatsen
// we hem met mmPerPx = (1000 / schaal) / ppm zodat 1 m op papier exact
// 1000/schaal mm is (1:50 → 20 mm, 1:100 → 10 mm).

import { jsPDF } from "jspdf";
import "svg2pdf.js"; // voegt doc.svg(element, opties) toe aan jsPDF
import type { ScheduleRow } from "./openingSchedule";

export type PdfPaper = "a4" | "a3";

// Annotaties (tekstjes, maatlijnen) staan in de SVG in px; met deze ppm-keuze
// worden ze op papier ~2,5 mm hoog, onafhankelijk van de tekeningschaal.
export function exportPpm(scale: number): number {
  return 3600 / scale;
}

const PAPER_MM: Record<PdfPaper, { w: number; h: number }> = {
  a4: { w: 210, h: 297 },
  a3: { w: 297, h: 420 },
};

const MARGIN = 12; // mm
const TITLE_H = 24; // mm titelblok
const GAP = 6; // mm tussen titelblok en tekening

export interface WerkbladPdfOptions {
  svg: SVGSVGElement; // plan-SVG, gerenderd met ppm = exportPpm(scale)
  scale: number; // 50 | 100 | 200
  paper: PdfPaper;
  title: {
    projectName: string;
    description?: string;
    levelName: string;
    revision: string;
    date: string;
  };
  schedule?: ScheduleRow[]; // kozijnstaat → tweede pagina
}

export type WerkbladPdfResult =
  | { ok: true; blob: Blob }
  | { ok: false; reason: string };

const OPENING_LABEL: Record<string, string> = {
  door: "Deur",
  window: "Raam",
  passage: "Doorgang",
};

function drawTitleBlock(
  doc: jsPDF,
  pageW: number,
  t: WerkbladPdfOptions["title"],
  scale: number,
) {
  const x = MARGIN;
  const y = MARGIN;
  const w = pageW - MARGIN * 2;
  doc.setDrawColor(28, 25, 23);
  doc.setLineWidth(0.5);
  doc.rect(x, y, w, TITLE_H);

  // Links: projectnaam + omschrijving.
  doc.setTextColor(234, 88, 12);
  doc.setFontSize(6);
  doc.text("WERKBLAD", x + 3, y + 5);
  doc.setTextColor(28, 25, 23);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(t.projectName, x + 3, y + 12);
  doc.setFont("helvetica", "normal");
  if (t.description) {
    doc.setFontSize(8);
    doc.setTextColor(120, 113, 108);
    doc.text(t.description, x + 3, y + 18, { maxWidth: w * 0.5 });
  }

  // Rechts: 2×2 cellen (Datum/Verdieping/Schaal/Revisie).
  const cellW = 34;
  const gridX = x + w - cellW * 2;
  doc.setDrawColor(28, 25, 23);
  doc.line(gridX, y, gridX, y + TITLE_H);
  doc.line(gridX + cellW, y, gridX + cellW, y + TITLE_H);
  doc.line(gridX, y + TITLE_H / 2, x + w, y + TITLE_H / 2);
  const cell = (cx: number, cy: number, label: string, value: string) => {
    doc.setFontSize(5);
    doc.setTextColor(168, 162, 158);
    doc.text(label.toUpperCase(), cx + 2, cy + 4);
    doc.setFontSize(9);
    doc.setTextColor(28, 25, 23);
    doc.setFont("helvetica", "bold");
    doc.text(value, cx + 2, cy + 9.5);
    doc.setFont("helvetica", "normal");
  };
  cell(gridX, y, "Datum", t.date);
  cell(gridX + cellW, y, "Verdieping", t.levelName);
  cell(gridX, y + TITLE_H / 2, "Schaal", `1:${scale}`);
  cell(gridX + cellW, y + TITLE_H / 2, "Revisie", t.revision);
}

function drawSchedulePage(doc: jsPDF, paper: PdfPaper, rows: ScheduleRow[]) {
  doc.addPage(paper, "portrait");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(28, 25, 23);
  doc.text("Kozijnstaat — deuren & ramen", MARGIN, MARGIN + 6);

  const cols = [
    { label: "Postnr", w: 24 },
    { label: "Type", w: 34 },
    { label: "Breedte (mm)", w: 34 },
    { label: "Hoogte (mm)", w: 34 },
    { label: "Borstwering (mm)", w: 40 },
  ];
  const tableW = cols.reduce((s, c) => s + c.w, 0);
  const x0 = MARGIN;
  let y = MARGIN + 14;
  const rowH = 7;

  // Kop
  doc.setFillColor(244, 241, 234);
  doc.rect(x0, y, tableW, rowH, "F");
  doc.setFontSize(8);
  let cx = x0;
  for (const c of cols) {
    doc.text(c.label, cx + 2, y + 4.8);
    cx += c.w;
  }
  doc.setFont("helvetica", "normal");
  y += rowH;

  const mm = (m: number) => String(Math.round(m * 1000));
  for (const r of rows) {
    const cells = [
      r.code,
      OPENING_LABEL[r.type] ?? r.type,
      mm(r.width),
      mm(r.height),
      r.sillHeight > 0 ? mm(r.sillHeight) : "—",
    ];
    cx = x0;
    doc.setDrawColor(214, 211, 205);
    doc.setLineWidth(0.2);
    doc.line(x0, y + rowH, x0 + tableW, y + rowH);
    for (let i = 0; i < cells.length; i++) {
      doc.text(cells[i], cx + 2, y + 4.8);
      cx += cols[i].w;
    }
    y += rowH;
    if (y > PAPER_MM[paper].h - MARGIN - rowH) {
      doc.addPage(paper, "portrait");
      y = MARGIN;
    }
  }
}

export async function exportWerkbladPdf(
  opts: WerkbladPdfOptions,
): Promise<WerkbladPdfResult> {
  const { svg, scale, paper, title, schedule } = opts;
  const vb = svg.viewBox.baseVal;
  const ppm = exportPpm(scale);
  const mmPerPx = 1000 / scale / ppm;
  const svgWmm = vb.width * mmPerPx;
  const svgHmm = vb.height * mmPerPx;

  // Oriëntatie: liggend als de tekening breder is dan hoog.
  const landscape = svgWmm > svgHmm;
  const pageW = landscape ? PAPER_MM[paper].h : PAPER_MM[paper].w;
  const pageH = landscape ? PAPER_MM[paper].w : PAPER_MM[paper].h;

  const availW = pageW - MARGIN * 2;
  const availH = pageH - MARGIN * 2 - TITLE_H - GAP;
  if (svgWmm > availW || svgHmm > availH) {
    const suggestie =
      paper === "a4"
        ? "Kies A3 of een kleinere schaal (bijv. 1:100 → 1:200)."
        : "Kies een kleinere schaal (bijv. 1:50 → 1:100).";
    return {
      ok: false,
      reason: `De plattegrond (${Math.ceil(svgWmm)}×${Math.ceil(svgHmm)} mm) past op schaal 1:${scale} niet op ${paper.toUpperCase()}. ${suggestie}`,
    };
  }

  const doc = new jsPDF({
    unit: "mm",
    format: paper,
    orientation: landscape ? "landscape" : "portrait",
  });

  drawTitleBlock(doc, pageW, title, scale);
  await doc.svg(svg, {
    x: MARGIN,
    y: MARGIN + TITLE_H + GAP,
    width: svgWmm,
    height: svgHmm,
  });

  if (schedule && schedule.length > 0) drawSchedulePage(doc, paper, schedule);

  return { ok: true, blob: doc.output("blob") };
}
