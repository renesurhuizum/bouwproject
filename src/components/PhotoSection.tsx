"use client";

// Herbruikbare fotosectie: upload (bestand/camera) → blob in Dexie,
// thumbnails met lightbox en verwijderen. Koppelbaar aan een ruimte
// (selectiepaneel) of een fase (voortgangsfoto's).

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDB } from "@/lib/db/db";
import { create, remove } from "@/lib/db/repo";
import type { Photo } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";

interface Props {
  projectId: string;
  /** Koppelveld: foto's horen bij deze ruimte of fase. */
  link: { field: "roomId" | "phaseId"; id: string };
}

export function PhotoSection({ projectId, link }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<Photo | null>(null);

  const photos = useLiveQuery(
    async () => {
      const rows = await getDB().photos.where(link.field).equals(link.id).toArray();
      return rows.filter((p) => !p.deleted);
    },
    [link.field, link.id],
    [] as Photo[],
  );

  async function addPhoto(file: File) {
    if (!projectId) return;
    await create<Photo>("photos", {
      projectId,
      [link.field]: link.id,
      blob: file,
      caption: file.name,
      takenAt: new Date().toISOString().slice(0, 10),
    });
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs text-ink-500">Foto&apos;s</span>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 rounded-md bg-paper-sunken px-2 py-1 text-[11px] text-ink-700 hover:bg-line"
        >
          <Camera size={11} /> Toevoegen
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void addPhoto(file);
          e.target.value = "";
        }}
      />
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {photos.map((ph) => (
            <PhotoThumb key={ph.id} photo={ph} onClick={() => setLightbox(ph)} />
          ))}
        </div>
      )}
      {lightbox && (
        <Lightbox
          photo={lightbox}
          onClose={() => setLightbox(null)}
          onDelete={() => {
            void remove("photos", lightbox.id);
            setLightbox(null);
          }}
        />
      )}
    </div>
  );
}

export function PhotoThumb({
  photo,
  onClick,
  className = "h-14 w-14",
}: {
  photo: Photo;
  onClick: () => void;
  className?: string;
}) {
  // Object-URL tijdens render aanmaken; cleanup via effect (geen setState-cascade).
  const src = useMemo(
    () => (photo.blob ? URL.createObjectURL(photo.blob) : null),
    [photo.blob],
  );
  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);
  if (!src) return null;
  return (
    <button
      onClick={onClick}
      className={`${className} overflow-hidden rounded-lg border border-line bg-paper-sunken`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={photo.caption ?? ""} className="h-full w-full object-cover" />
    </button>
  );
}

export function Lightbox({
  photo,
  onClose,
  onDelete,
}: {
  photo: Photo;
  onClose: () => void;
  onDelete: () => void;
}) {
  const src = useMemo(
    () => (photo.blob ? URL.createObjectURL(photo.blob) : null),
    [photo.blob],
  );
  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-4"
      onClick={onClose}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={photo.caption ?? ""}
          className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
        />
      )}
      <div
        className="flex items-center gap-3 text-xs text-white/80"
        onClick={(e) => e.stopPropagation()}
      >
        {photo.takenAt && <span>{formatDate(photo.takenAt)}</span>}
        <button
          onClick={onDelete}
          className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 font-medium text-white hover:bg-danger"
        >
          <Trash2 size={13} /> Verwijderen
        </button>
      </div>
    </div>
  );
}
