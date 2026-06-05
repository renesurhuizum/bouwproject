"use client";

// Initialiseert de lokale database (seed) en zet een standaard actieve verdieping.
// Toont kinderen pas zodra de db klaar is.

import { useEffect, useState } from "react";
import { ensureSeed } from "@/lib/db/seed";
import { getDB } from "@/lib/db/db";
import { useEditor } from "@/lib/store/editor";

export function Bootstrap({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const setActiveLevel = useEditor((s) => s.setActiveLevel);
  const activeLevelId = useEditor((s) => s.activeLevelId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const project = await ensureSeed();
      // Kies een standaard verdieping als er nog geen actieve is.
      const levels = await getDB()
        .levels.where("projectId")
        .equals(project.id)
        .sortBy("order");
      const valid = levels.filter((l) => !l.deleted);
      if (!cancelled) {
        if (!activeLevelId || !valid.some((l) => l.id === activeLevelId)) {
          if (valid[0]) setActiveLevel(valid[0].id);
        }
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return (
      <div className="flex h-dvh items-center justify-center text-ink-500">
        <div className="animate-pulse text-sm tracking-wide">Laden…</div>
      </div>
    );
  }

  return <>{children}</>;
}
