"use client";

// 4D-bediening in 3D: schuif door de fasering en zie het huis "groeien".
// Stap 0 = huidige situatie, daarna per fase; geel = wat in deze fase nieuw is.

import { useEffect, useRef, useState } from "react";
import { Play, Pause, X, Clock } from "lucide-react";
import type { Phase } from "@/lib/domain/types";
import { useBuildSequence } from "@/lib/buildSequence";

export function BuildSequenceBar({ phases }: { phases: Phase[] }) {
  const step = useBuildSequence((s) => s.step);
  const setStep = useBuildSequence((s) => s.setStep);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const sorted = [...phases].sort((a, b) => a.order - b.order);
  const maxStep = sorted.length ? sorted[sorted.length - 1].order : 12;

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      const cur = useBuildSequence.getState().step ?? 0;
      if (cur >= maxStep) {
        setPlaying(false);
        return;
      }
      useBuildSequence.getState().setStep(cur + 1);
    }, 1400);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, maxStep]);

  // Bij verlaten van de 3D-pagina weer het eindontwerp tonen.
  useEffect(() => () => useBuildSequence.getState().setStep(null), []);

  if (step == null) {
    return (
      <button
        onClick={() => setStep(0)}
        className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-xl border border-white/20 bg-ink-900/80 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur hover:bg-ink-900"
        title="Bekijk het model per fase (4D)"
      >
        <Clock size={14} /> Bouwvolgorde
      </button>
    );
  }

  const current = sorted.find((p) => p.order === step);
  const label = step === 0 ? "Huidige situatie" : current ? `${current.order}. ${current.name}` : `Stap ${step}`;

  return (
    <div className="absolute left-3 top-3 z-10 w-[min(20rem,calc(100vw-6rem))] rounded-xl border border-white/15 bg-ink-900/85 p-3 text-white shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => {
            if (!playing && step >= maxStep) setStep(0);
            setPlaying((p) => !p);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-accent"
          title={playing ? "Pauze" : "Afspelen"}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold">{label}</div>
          {current?.status && (
            <div className="text-[10px] text-white/60">
              {current.status === "done" ? "Afgerond" : current.status === "in-progress" ? "Bezig" : "Nog te doen"}
            </div>
          )}
        </div>
        <button
          onClick={() => {
            setPlaying(false);
            setStep(null);
          }}
          className="rounded p-1 text-white/70 hover:text-white"
          title="Eindontwerp tonen"
        >
          <X size={14} />
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={maxStep}
        value={step}
        onChange={(e) => {
          setPlaying(false);
          setStep(Number(e.target.value));
        }}
        className="w-full accent-accent"
      />
      <div className="mt-1 flex items-center gap-3 text-[10px] text-white/60">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-[#facc15]" /> nieuw in deze fase
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-[#dc2626]" /> wordt gesloopt
        </span>
      </div>
    </div>
  );
}
