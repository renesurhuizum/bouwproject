"use client";

// IFC-import: model van architect/tekenaar inlezen als startpunt of onderlegger.
// web-ifc (WebAssembly) wordt pas geladen als je een bestand kiest, en draait
// volledig lokaal — er wordt niets geüpload.

import { useRef, useState } from "react";
import { FileUp, Check, Loader2 } from "lucide-react";
import type { ProjectModel } from "@/lib/model";
import type { WallStatus } from "@/lib/domain/types";
import type { ImportResult } from "@/lib/ifc/importIfc";
import { applyImport, mapLevels } from "@/lib/ifc/applyImport";
import { getDB } from "@/lib/db/db";

type IfcApiInstance = import("web-ifc").IfcAPI;
let apiPromise: Promise<IfcApiInstance> | null = null;

async function getApi(): Promise<IfcApiInstance> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const WebIFC = await import("web-ifc");
      const api = new WebIFC.IfcAPI();
      api.SetWasmPath("/web-ifc/", true);
      await api.Init(undefined, true); // single-thread: geen speciale headers nodig
      return api;
    })();
    apiPromise.catch(() => (apiPromise = null));
  }
  return apiPromise;
}

export function IfcImport({ model }: { model: ProjectModel }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState<WallStatus>("existing");
  const [replace, setReplace] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const existingLevels = model.levels.map((l) => l.level);

  async function readFile(file: File) {
    setError(null);
    setDone(null);
    setResult(null);
    setFileName(file.name);
    setBusy("IFC-lezer laden…");
    try {
      const api = await getApi();
      setBusy("Model analyseren…");
      const buf = new Uint8Array(await file.arrayBuffer());
      // Even de UI laten verversen vóór het zware werk.
      await new Promise((r) => setTimeout(r, 30));
      const { importIfc } = await import("@/lib/ifc/importIfc");
      const res = importIfc(api as unknown as Parameters<typeof importIfc>[0], buf);
      if (res.levels.length === 0) setError("Geen muren, ruimtes of constructie gevonden in dit bestand.");
      else setResult(res);
    } catch (e) {
      setError(`Kon het bestand niet lezen: ${(e as Error).message}`);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function apply() {
    if (!result) return;
    if (replace && !confirm("Bestaande muren, kozijnen, ruimtes, kolommen en balken op de gekoppelde verdiepingen worden vervangen. Doorgaan?")) return;
    setBusy("Importeren…");
    try {
      const c = await applyImport(getDB(), result, existingLevels, {
        projectId: model.project.id,
        defaultStatus: status,
        replaceExisting: replace,
      });
      setDone(
        `${c.walls} muren, ${c.openings} kozijnen, ${c.rooms} ruimtes, ${c.columns} kolommen en ${c.beams} balken geïmporteerd` +
          (c.levels ? ` · ${c.levels} nieuwe verdieping(en)` : "") +
          (c.removed ? ` · ${c.removed} oude elementen vervangen` : ""),
      );
      setResult(null);
    } catch (e) {
      setError(`Importeren mislukt: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const mapping = result ? mapLevels(result, existingLevels) : [];

  return (
    <section className="space-y-3 rounded-card border border-line bg-paper-raised p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">IFC-import</h2>
      <p className="text-sm text-ink-700">
        Heb je een model van de architect, tekenaar of een 3D-scan als <strong>.ifc</strong>? Lees het in, dan hoef je
        niet alles over te tekenen. Muren, deuren, ramen, ruimtes, kolommen en balken worden overgenomen.
      </p>

      <input ref={fileRef} type="file" accept=".ifc" className="hidden" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={!!busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-line-strong bg-paper py-2.5 text-sm font-semibold text-ink-900 disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />} {busy ?? "Kies .ifc-bestand"}
      </button>

      {error && <p className="text-xs text-danger">{error}</p>}
      {done && (
        <p className="flex items-start gap-1.5 text-xs text-ok">
          <Check size={14} className="mt-0.5 shrink-0" /> {done}
        </p>
      )}

      {result && (
        <div className="space-y-3 rounded-lg border border-line bg-paper p-3">
          <div className="text-xs text-ink-500">
            <span className="font-medium text-ink-900">{fileName}</span>
            {result.projectName ? ` · ${result.projectName}` : ""}
            {result.schema ? ` · ${result.schema}` : ""}
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[11px] text-ink-500">
                <th className="py-1 font-medium">Bouwlaag (peil)</th>
                <th className="py-1 font-medium">Wordt</th>
                <th className="py-1 text-right font-medium">Muren</th>
                <th className="py-1 text-right font-medium">Kozijnen</th>
                <th className="py-1 text-right font-medium">Ruimtes</th>
              </tr>
            </thead>
            <tbody>
              {result.levels.map((l, i) => (
                <tr key={i} className="border-t border-line/60">
                  <td className="py-1.5 text-ink-900">
                    {l.name} <span className="text-ink-500">({l.elevation.toFixed(2)} m)</span>
                  </td>
                  <td className="py-1.5 text-ink-700">{mapping[i].existing ? `→ ${mapping[i].existing!.name}` : "nieuwe verdieping"}</td>
                  <td className="tabular py-1.5 text-right">{l.walls.length}</td>
                  <td className="tabular py-1.5 text-right">{l.openings.length}</td>
                  <td className="tabular py-1.5 text-right">{l.rooms.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.skipped.length > 0 && (
            <p className="text-[11px] text-ink-500">{result.skipped.length} element(en) overgeslagen (bv. gebogen of schuine muren — die kun je natekenen).</p>
          )}
          {(result.offset.x !== 0 || result.offset.y !== 0) && (
            <p className="text-[11px] text-ink-500">Het model stond op RD-/kaartcoördinaten en is naar de oorsprong verschoven.</p>
          )}

          <label className="flex items-center justify-between gap-2 text-xs">
            <span className="text-ink-700">Muren zonder status in het bestand zijn</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as WallStatus)} className="rounded-md border border-line bg-paper-raised px-2 py-1 text-xs">
              <option value="existing">Bestaand (opname/inmeting)</option>
              <option value="new">Nieuw (ontwerp)</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-700">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="accent-accent" />
            Bestaande tekening op gekoppelde verdiepingen vervangen (anders wordt het toegevoegd)
          </label>
          <div className="flex gap-2">
            <button onClick={apply} disabled={!!busy} className="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-white disabled:opacity-50">
              Importeren
            </button>
            <button onClick={() => setResult(null)} className="rounded-lg bg-paper-sunken px-3 py-2 text-sm text-ink-700">
              Annuleren
            </button>
          </div>
        </div>
      )}

      <p className="text-[11px] leading-snug text-ink-500">
        Werkt met IFC2x3 en IFC4 uit o.a. Revit, ArchiCAD, Vectorworks en Bonsai. Maten worden uit de 3D-vorm gehaald;
        rechte muren komen het best over. Installaties, trappen en daken worden (nog) niet ingelezen. Tip: maak eerst
        een backup via Instellingen.
      </p>
    </section>
  );
}
