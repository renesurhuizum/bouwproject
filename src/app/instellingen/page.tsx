"use client";

// Projectinstellingen: naam, omschrijving, noordrichting, startdatum
// en data-beheer (backup downloaden / importeren / project resetten).

import { useEffect, useRef, useState } from "react";
import { Download, Upload, RotateCcw, Compass, Check } from "lucide-react";
import { useProject } from "@/lib/hooks";
import { update } from "@/lib/db/repo";
import { getDB } from "@/lib/db/db";
import { useDialog } from "@/components/app-shell/Dialog";

interface Backup {
  app: "bouwproject";
  version: number;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

// Blob ⇄ dataURL zodat afbeeldingen mee kunnen in JSON.
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

const BLOB_FIELDS: Record<string, string[] | undefined> = {
  photos: ["blob"],
  levels: ["bgImageBlob"],
};

export default function InstellingenPage() {
  const project = useProject();
  const dialog = useDialog();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    navigator.storage
      ?.persisted?.()
      .then((v) => setPersisted(v))
      .catch(() => setPersisted(null));
  }, []);

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  async function patchProject(patch: Record<string, unknown>) {
    if (!project) return;
    await update("projects", project.id, patch);
    flashSaved();
  }

  async function downloadBackup() {
    setBusy("export");
    try {
      const db = getDB();
      const data: Record<string, unknown[]> = {};
      // Tabellen komen uit het Dexie-schema zelf, zodat stores uit latere
      // migraties automatisch in de backup meegaan.
      for (const table of db.tables) {
        const rows = (await table.toArray()) as Record<string, unknown>[];
        const blobFields = BLOB_FIELDS[table.name];
        data[table.name] = blobFields
          ? await Promise.all(
              rows.map(async (row) => {
                // Serialiseer naar een kopie; muteer de live rijen niet.
                const copy: Record<string, unknown> = { ...row };
                for (const f of blobFields) {
                  if (copy[f] instanceof Blob) {
                    copy[f] = { __blob: await blobToDataUrl(copy[f] as Blob) };
                  }
                }
                return copy;
              }),
            )
          : rows;
      }
      const backup: Backup = {
        app: "bouwproject",
        version: 3,
        exportedAt: new Date().toISOString(),
        data,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `bouwproject-backup-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(null);
    }
  }

  async function importBackup(file: File) {
    setBusy("import");
    try {
      const text = await file.text();
      const backup = JSON.parse(text) as Backup;
      if (backup.app !== "bouwproject" || !backup.data) {
        dialog.notify("Dit bestand is geen geldige bouwproject-backup.", "error");
        return;
      }
      const ok = await dialog.confirm({
        title: "Backup importeren",
        message: "Importeren overschrijft alle huidige projectdata met de backup. Doorgaan?",
        confirmLabel: "Importeren",
        danger: true,
      });
      if (!ok) return;

      const db = getDB();
      for (const table of db.tables) {
        const rows = (backup.data[table.name] ?? []) as Record<string, unknown>[];
        const blobFields = BLOB_FIELDS[table.name];
        const restored: Record<string, unknown>[] = [];
        for (const row of rows) {
          const copy: Record<string, unknown> = { ...row };
          if (blobFields) {
            for (const f of blobFields) {
              const v = copy[f] as { __blob?: string } | undefined;
              if (v && typeof v === "object" && v.__blob) {
                copy[f] = await dataUrlToBlob(v.__blob);
              }
            }
          }
          restored.push(copy);
        }
        await table.clear();
        if (restored.length) await table.bulkPut(restored);
      }
      dialog.notify("Backup hersteld — de pagina wordt herladen…");
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      dialog.notify("Importeren mislukt: " + (e as Error).message, "error");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function resetProject() {
    const eerste = await dialog.confirm({
      title: "Project resetten",
      message: "Weet je het zeker? Dit verwijdert ALLE projectdata definitief van dit apparaat.",
      confirmLabel: "Verwijderen",
      danger: true,
    });
    if (!eerste) return;
    const tweede = await dialog.confirm({
      title: "Laatste waarschuwing",
      message: "Dit kan niet ongedaan worden gemaakt.",
      confirmLabel: "Definitief verwijderen",
      danger: true,
    });
    if (!tweede) return;
    setBusy("reset");
    try {
      const db = getDB();
      for (const table of db.tables) await table.clear();
      location.reload();
    } finally {
      setBusy(null);
    }
  }

  const north = project?.northDegrees ?? 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-5 p-4 pb-24">
        <header className="flex items-baseline justify-between px-1">
          <h1 className="text-xl font-bold text-ink-900">Instellingen</h1>
          {saved && (
            <span className="flex items-center gap-1 text-xs font-medium text-ok">
              <Check size={14} /> Opgeslagen
            </span>
          )}
        </header>

        {/* Projectgegevens */}
        <section className="space-y-3 rounded-card border border-line bg-paper-raised p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Project
          </h2>
          <label className="block">
            <span className="mb-1 block text-xs text-ink-500">Naam</span>
            <input
              defaultValue={project?.name ?? ""}
              onBlur={(e) => patchProject({ name: e.target.value.trim() || "Bouwproject" })}
              className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-900"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-ink-500">Omschrijving</span>
            <textarea
              defaultValue={project?.description ?? ""}
              onBlur={(e) => patchProject({ description: e.target.value.trim() })}
              rows={2}
              className="w-full resize-none rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-900"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-ink-500">Startdatum renovatie</span>
            <input
              type="date"
              defaultValue={project?.startDate ?? ""}
              onChange={(e) => patchProject({ startDate: e.target.value })}
              className="tabular w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-900"
            />
            <span className="mt-1 block text-[11px] text-ink-400">
              Bepaalt het startpunt van de tijdlijn (Gantt).
            </span>
          </label>
        </section>

        {/* Noordrichting */}
        <section className="space-y-3 rounded-card border border-line bg-paper-raised p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Oriëntatie
          </h2>
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-20 shrink-0 rounded-full border-2 border-line">
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ transform: `rotate(${north}deg)` }}
              >
                <Compass size={52} className="text-accent" />
              </div>
            </div>
            <div className="flex-1">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-xs text-ink-500">Noordrichting</span>
                <span className="tabular text-sm font-semibold text-ink-900">{north}°</span>
              </div>
              <input
                type="range"
                min={0}
                max={359}
                value={north}
                onChange={(e) => patchProject({ northDegrees: Number(e.target.value) })}
                className="w-full accent-accent"
              />
              <span className="mt-1 block text-[11px] text-ink-400">
                Hoek van het noorden t.o.v. &ldquo;omhoog&rdquo; op de plattegrond.
                Gebruikt voor de noordpijl op het werkblad.
              </span>
            </div>
          </div>
        </section>

        {/* Locatie (zonberekening) */}
        <section className="space-y-3 rounded-card border border-line bg-paper-raised p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Locatie (zonnestand 3D)
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-ink-500">Breedtegraad</span>
              <input
                type="number"
                step="0.1"
                defaultValue={project?.lat ?? 52.3}
                onBlur={(e) => patchProject({ lat: Number(e.target.value) })}
                className="tabular w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-900"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-ink-500">Lengtegraad</span>
              <input
                type="number"
                step="0.1"
                defaultValue={project?.lng ?? 5.3}
                onBlur={(e) => patchProject({ lng: Number(e.target.value) })}
                className="tabular w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink-900"
              />
            </label>
          </div>
          <span className="block text-[11px] text-ink-400">
            Bepaalt de zonnestand en schaduwen in de 3D-weergave. Standaard: Nederland (52.3, 5.3).
          </span>
        </section>

        {/* Databeheer */}
        <section className="space-y-3 rounded-card border border-line bg-paper-raised p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Data &amp; backup
          </h2>
          <p className="text-[11px] text-ink-400">
            Alle data staat lokaal op dit apparaat. Maak regelmatig een backup.
          </p>
          {persisted !== null && (
            <p className={`text-[11px] ${persisted ? "text-ok" : "text-ink-400"}`}>
              {persisted
                ? "Opslag is beschermd: de browser mag deze data niet automatisch wissen."
                : "Opslag is nog niet beschermd — de browser mag lokale data wissen bij ruimtegebrek. Een backup is extra belangrijk."}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              onClick={downloadBackup}
              disabled={busy !== null}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-ink-900 py-2.5 text-sm font-medium text-paper-raised disabled:opacity-50"
            >
              <Download size={16} /> {busy === "export" ? "Bezig…" : "Download backup"}
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy !== null}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-line bg-paper-raised py-2.5 text-sm font-medium text-ink-700 disabled:opacity-50"
            >
              <Upload size={16} /> {busy === "import" ? "Bezig…" : "Importeer backup"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importBackup(f);
              }}
            />
          </div>
        </section>

        {/* Gevarenzone */}
        <section className="space-y-3 rounded-card border border-danger/30 bg-paper-raised p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-danger">
            Gevarenzone
          </h2>
          <button
            onClick={resetProject}
            disabled={busy !== null}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-danger/40 py-2.5 text-sm font-medium text-danger disabled:opacity-50"
          >
            <RotateCcw size={16} /> {busy === "reset" ? "Bezig…" : "Project resetten"}
          </button>
        </section>
      </div>
      {dialog.element}
    </div>
  );
}
