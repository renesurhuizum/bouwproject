"use client";

// Import-wizard voor een bestaande plattegrond (foto/scan):
// 1. upload → 2. schaal kalibreren met twee klikken op een bekende afstand →
// 3. muren overnemen: zelf natekenen over de achtergrond (altijd betrouwbaar)
// of automatische detectie (experimenteel, werkt op strakke zwart-witplannen).

import { useMemo, useRef, useState } from "react";
import { Upload, Ruler, PenLine, Wand2, X, Check } from "lucide-react";
import { update, create } from "@/lib/db/repo";
import type { Point, Wall } from "@/lib/domain/types";
import { detectWalls, type DetectedWall } from "@/lib/planDetect";

interface Props {
  levelId: string;
  levelHeight: number;
  onClose: (result?: "draw") => void;
}

type Step = "upload" | "calibrate" | "walls";

const snap5 = (v: number) => Math.round(v / 0.05) * 0.05;

export function ImportWizard({ levelId, levelHeight, onClose }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [points, setPoints] = useState<Point[]>([]); // kalibratiepunten in beeldpixels
  const [distance, setDistance] = useState("");
  const [candidates, setCandidates] = useState<DetectedWall[] | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<SVGSVGElement>(null);

  const distM = parseFloat(distance.replace(",", "."));
  const pxDist = points.length === 2 ? Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y) : 0;
  const mPerPx = points.length === 2 && distM > 0 && pxDist > 0 ? distM / pxDist : null;

  function pickFile(f: File) {
    const url = URL.createObjectURL(f);
    const image = new window.Image();
    image.onload = () => {
      setNatural({ w: image.naturalWidth, h: image.naturalHeight });
      setFile(f);
      setImgUrl(url);
      setStep("calibrate");
    };
    image.src = url;
  }

  // Klik op de overlay → beeldpixel-coördinaat (viewBox = natuurlijke maat).
  function overlayClick(e: React.MouseEvent) {
    if (!natural || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const p = {
      x: ((e.clientX - rect.left) / rect.width) * natural.w,
      y: ((e.clientY - rect.top) / rect.height) * natural.h,
    };
    setPoints((prev) => (prev.length >= 2 ? [p] : [...prev, p]));
  }

  async function saveBackground() {
    if (!file || !mPerPx) return;
    await update("levels", levelId, {
      bgImageBlob: file,
      bgImageScale: mPerPx,
      bgImageOffsetX: 0,
      bgImageOffsetY: 0,
      bgImageOpacity: 0.4,
    });
  }

  async function chooseDraw() {
    setBusy(true);
    try {
      await saveBackground();
      onClose("draw");
    } finally {
      setBusy(false);
    }
  }

  async function runDetection() {
    if (!imgUrl || !natural || !mPerPx) return;
    setBusy(true);
    try {
      // Werk op een verkleinde bitmap (max 1600 px) voor snelheid.
      const maxDim = 1600;
      const f = Math.min(1, maxDim / Math.max(natural.w, natural.h));
      const cw = Math.round(natural.w * f);
      const ch = Math.round(natural.h * f);
      const canvas = document.createElement("canvas");
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext("2d")!;
      const image = new window.Image();
      await new Promise<void>((res, rej) => {
        image.onload = () => res();
        image.onerror = () => rej(new Error("Afbeelding laden mislukt"));
        image.src = imgUrl;
      });
      ctx.drawImage(image, 0, 0, cw, ch);
      const data = ctx.getImageData(0, 0, cw, ch);
      const found = detectWalls(data, mPerPx / f);
      setCandidates(found);
      setExcluded(new Set());
    } finally {
      setBusy(false);
    }
  }

  async function acceptCandidates() {
    if (!candidates || !mPerPx) return;
    setBusy(true);
    try {
      await saveBackground();
      for (let i = 0; i < candidates.length; i++) {
        if (excluded.has(i)) continue;
        const c = candidates[i];
        await create<Wall>("walls", {
          levelId,
          start: { x: snap5(c.start.x), y: snap5(c.start.y) },
          end: { x: snap5(c.end.x), y: snap5(c.end.y) },
          thickness: snap5(Math.max(0.05, c.thickness)),
          height: levelHeight,
          material: "brick",
          loadBearing: false,
          status: "existing",
        });
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const included = candidates ? candidates.length - excluded.size : 0;

  // Kandidaten in beeldpixels voor de preview-overlay.
  const candidateLines = useMemo(() => {
    if (!candidates || !mPerPx) return [];
    return candidates.map((c) => ({
      x1: c.start.x / mPerPx,
      y1: c.start.y / mPerPx,
      x2: c.end.x / mPerPx,
      y2: c.end.y / mPerPx,
      w: Math.max(2, c.thickness / mPerPx),
    }));
  }, [candidates, mPerPx]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-card border border-line bg-paper-raised shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-bold text-ink-900">Plattegrond importeren</h2>
            <p className="text-[11px] text-ink-500">
              {step === "upload" && "Stap 1 van 3 — upload een foto of scan"}
              {step === "calibrate" && "Stap 2 van 3 — kalibreer de schaal"}
              {step === "walls" && "Stap 3 van 3 — muren overnemen"}
            </p>
          </div>
          <button
            onClick={() => onClose()}
            className="rounded-lg p-1.5 text-ink-400 hover:bg-paper-sunken hover:text-ink-700"
            aria-label="Sluiten"
          >
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {step === "upload" && (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-3 rounded-card border-2 border-dashed border-line py-14 text-ink-500 hover:border-accent hover:text-accent"
            >
              <Upload size={28} />
              <span className="text-sm font-medium">Kies een foto of scan van je plattegrond</span>
              <span className="text-[11px] text-ink-400">
                Bijv. een bouwtekening, funda-plattegrond of schets (JPG/PNG)
              </span>
            </button>
          )}

          {(step === "calibrate" || step === "walls") && imgUrl && natural && (
            <div className="space-y-3">
              {step === "calibrate" && (
                <p className="flex items-start gap-2 rounded-lg bg-paper-sunken px-3 py-2 text-xs text-ink-700">
                  <Ruler size={14} className="mt-0.5 shrink-0 text-accent" />
                  Klik op twee punten waarvan je de werkelijke afstand weet (bijv. de
                  uiteinden van een gemaatvoerde muur) en vul de afstand in. Zo wordt
                  alles exact op maat.
                </p>
              )}
              <div className="relative overflow-hidden rounded-lg border border-line bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgUrl} alt="Geüploade plattegrond" className="block w-full" />
                <svg
                  ref={overlayRef}
                  viewBox={`0 0 ${natural.w} ${natural.h}`}
                  preserveAspectRatio="none"
                  onClick={step === "calibrate" ? overlayClick : undefined}
                  className={`absolute inset-0 h-full w-full ${step === "calibrate" ? "cursor-crosshair" : ""}`}
                >
                  {points.length === 2 && (
                    <line
                      x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y}
                      stroke="#ea580c" strokeWidth={Math.max(2, natural.w / 300)} strokeDasharray="6 4"
                    />
                  )}
                  {points.map((p, i) => (
                    <circle
                      key={i} cx={p.x} cy={p.y} r={Math.max(5, natural.w / 120)}
                      fill="#ea580c" stroke="#fff" strokeWidth={Math.max(1.5, natural.w / 500)}
                    />
                  ))}
                  {step === "walls" &&
                    candidateLines.map((l, i) => (
                      <line
                        key={i}
                        x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
                        stroke={excluded.has(i) ? "#9ca3af" : "#16a34a"}
                        strokeOpacity={excluded.has(i) ? 0.5 : 0.8}
                        strokeWidth={l.w}
                        strokeLinecap="butt"
                        className="cursor-pointer"
                        onClick={() =>
                          setExcluded((prev) => {
                            const next = new Set(prev);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return next;
                          })
                        }
                      />
                    ))}
                </svg>
              </div>

              {step === "calibrate" && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-ink-500">
                    {points.length < 2
                      ? `Klik punt ${points.length + 1} van 2 aan`
                      : "Werkelijke afstand tussen de punten:"}
                  </span>
                  {points.length === 2 && (
                    <>
                      <input
                        value={distance}
                        onChange={(e) => setDistance(e.target.value)}
                        inputMode="decimal"
                        placeholder="bijv. 10,5"
                        className="tabular w-24 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink-900"
                        autoFocus
                      />
                      <span className="text-xs text-ink-500">meter</span>
                      <button
                        onClick={() => setPoints([])}
                        className="text-[11px] text-ink-400 underline hover:text-ink-700"
                      >
                        opnieuw klikken
                      </button>
                    </>
                  )}
                </div>
              )}

              {step === "walls" && candidates && (
                <p className="text-xs text-ink-500">
                  {candidates.length === 0
                    ? "Geen muren herkend — dit werkt het best op strakke zwart-witplattegronden. Teken de muren zelf over de achtergrond."
                    : `${included} van ${candidates.length} herkende muren geselecteerd — klik op een muur in de preview om hem uit/aan te zetten.`}
                </p>
              )}

              {step === "walls" && !candidates && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    onClick={() => void chooseDraw()}
                    disabled={busy}
                    className="flex flex-col items-start gap-1 rounded-card border border-line bg-paper p-3 text-left hover:border-accent disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                      <PenLine size={15} className="text-accent" /> Zelf natekenen
                    </span>
                    <span className="text-[11px] leading-snug text-ink-500">
                      De plattegrond komt op ware grootte als achtergrond in de editor;
                      trek de muren over met de muur-tool. Altijd betrouwbaar.
                    </span>
                  </button>
                  <button
                    onClick={() => void runDetection()}
                    disabled={busy}
                    className="flex flex-col items-start gap-1 rounded-card border border-line bg-paper p-3 text-left hover:border-accent disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                      <Wand2 size={15} className="text-accent" />
                      {busy ? "Bezig met detecteren…" : "Detecteer muren"}
                    </span>
                    <span className="text-[11px] leading-snug text-ink-500">
                      Experimenteel: herkent rechte muren op strakke zwart-witplannen.
                      Je kiest daarna zelf welke je overneemt.
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
          <button
            onClick={() => onClose()}
            className="rounded-lg px-3 py-2 text-sm font-medium text-ink-500 hover:text-ink-700"
          >
            Annuleren
          </button>
          <div className="flex gap-2">
            {step === "calibrate" && (
              <button
                onClick={() => setStep("walls")}
                disabled={!mPerPx}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Volgende
              </button>
            )}
            {step === "walls" && candidates && (
              <>
                <button
                  onClick={() => void chooseDraw()}
                  disabled={busy}
                  className="rounded-lg border border-line bg-paper-raised px-3 py-2 text-sm font-medium text-ink-700 disabled:opacity-50"
                >
                  Liever zelf natekenen
                </button>
                <button
                  onClick={() => void acceptCandidates()}
                  disabled={busy || included === 0}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  <Check size={15} /> Voeg {included} muren toe
                </button>
              </>
            )}
          </div>
        </footer>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
