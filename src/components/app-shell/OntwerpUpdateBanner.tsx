"use client";

// Meldt dat er een nieuwere versie van het basisontwerp is dan in de lokale
// database staat, en biedt aan om bij te werken. Projectdata staat in
// IndexedDB, dus een nieuwe app-versie verandert het opgeslagen ontwerp niet
// vanzelf.

import { useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { useProject } from "@/lib/hooks";
import { useEditor } from "@/lib/store/editor";
import { laadOntwerpDeBoer, ONTWERP_NAAM, ONTWERP_VERSIE } from "@/lib/templates/ontwerpDeBoer";

export function OntwerpUpdateBanner() {
  const project = useProject();
  const setActiveLevel = useEditor((s) => s.setActiveLevel);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  if (!project || hidden) return null;
  // Alleen voor projecten die met het basisontwerp zijn aangemaakt.
  const uitSjabloon = project.ontwerpVersie !== undefined || (project.description ?? "").includes(ONTWERP_NAAM);
  if (!uitSjabloon || (project.ontwerpVersie ?? 1) >= ONTWERP_VERSIE) return null;

  async function bijwerken() {
    if (!project) return;
    if (
      !confirm(
        "Het basisontwerp bijwerken naar de nieuwste versie (rieten dak, antraciet pannen, gevels volgens de schetsen)? " +
          "Muren, ruimtes, installaties en inrichting worden vervangen; fasering, kosten en taken blijven staan.",
      )
    )
      return;
    setBusy(true);
    try {
      const { groundLevelId } = await laadOntwerpDeBoer(project.id);
      setActiveLevel(groundLevelId);
    } catch (e) {
      alert("Bijwerken mislukt: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <span className="flex-1">
        Er is een nieuwere versie van het basisontwerp beschikbaar (o.a. rieten dak en antraciet dakpannen).
      </span>
      <button
        onClick={bijwerken}
        disabled={busy}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> {busy ? "Bezig…" : "Bijwerken"}
      </button>
      <button onClick={() => setHidden(true)} aria-label="Sluiten" className="shrink-0 text-amber-700 hover:text-amber-900">
        <X size={16} />
      </button>
    </div>
  );
}
