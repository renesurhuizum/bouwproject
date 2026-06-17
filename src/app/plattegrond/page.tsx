"use client";

// Plattegrond-scherm: canvas-editor (client-only) + tools + selectie-paneel.

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Pencil, Sparkles, ListChecks } from "lucide-react";
import { useEditor } from "@/lib/store/editor";
import { Toolbar } from "@/components/editor2d/Toolbar";
import { SelectionPanel } from "@/components/editor2d/SelectionPanel";
import { ComplianceBanner } from "@/components/editor2d/ComplianceBanner";
import { LevelSwitcher } from "@/components/editor2d/LevelSwitcher";
import { IndelingGenerator } from "@/components/indeling/IndelingGenerator";
import { useProject } from "@/lib/hooks";
import { update } from "@/lib/db/repo";

// Konva heeft window nodig → alleen in de browser laden.
const PlanEditor = dynamic(
  () => import("@/components/editor2d/PlanEditor").then((m) => m.PlanEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-ink-500">
        Plattegrond laden…
      </div>
    ),
  },
);

export default function PlattegrondPage() {
  const [showGen, setShowGen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const project = useProject();
  const phaseOverlay = useEditor((s) => s.phaseOverlay);
  const togglePhaseOverlay = useEditor((s) => s.togglePhaseOverlay);

  function startEdit() {
    if (!project) return;
    setNameValue(project.name);
    setEditingName(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function commitName() {
    if (!project) return;
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== project.name) {
      await update("projects", project.id, { name: trimmed });
    }
    setEditingName(false);
  }

  function onNameKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") void commitName();
    if (e.key === "Escape") setEditingName(false);
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      <PlanEditor />
      <LevelSwitcher />
      <ComplianceBanner />

      {/* Onderste bediening: het selectie-paneel stapelt in normale flow bóven
          de toolbar, zodat een hoger contextueel paneel (bv. Daktype) het
          paneel nooit kan overlappen. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center">
        <SelectionPanel />
        <Toolbar />
      </div>

      {/* Projectnaam — klikbaar om te bewerken */}
      {project && (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-xl border border-line bg-paper-raised/95 px-3 py-2 shadow-lg backdrop-blur">
          {editingName ? (
            <input
              ref={inputRef}
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onBlur={() => void commitName()}
              onKeyDown={onNameKeyDown}
              className="w-40 bg-transparent text-xs font-semibold text-ink-800 outline-none"
              autoFocus
            />
          ) : (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 text-xs font-semibold text-ink-700 hover:text-ink-900"
              title="Projectnaam bewerken"
            >
              <span>{project.name}</span>
              <Pencil size={11} className="text-ink-400" />
            </button>
          )}
        </div>
      )}

      {/* Indeling-generator + fase-overlay */}
      <div className="absolute left-3 top-3 z-10 flex gap-2">
        <button
          onClick={() => setShowGen(true)}
          className="flex items-center gap-1.5 rounded-xl border border-accent/40 bg-paper-raised/95 px-3 py-2 text-xs font-semibold text-accent shadow-lg backdrop-blur"
        >
          <Sparkles size={15} /> Indeling
        </button>
        <button
          onClick={togglePhaseOverlay}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur ${
            phaseOverlay
              ? "border-ink-900 bg-ink-900 text-paper-raised"
              : "border-line bg-paper-raised/95 text-ink-700"
          }`}
          title="Kleur ruimtes op werkvoortgang (taken per ruimte)"
        >
          <ListChecks size={15} /> Voortgang
        </button>
      </div>

      {showGen && <IndelingGenerator onClose={() => setShowGen(false)} />}
    </div>
  );
}
