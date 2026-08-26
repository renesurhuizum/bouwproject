"use client";

// Zet de werkruimte op de gevraagde weergave en navigeert erheen. Gebruikt door
// de oude routes /3d en /aanzichten, die nu onderdeel van de werkruimte zijn.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useEditor, type ViewMode } from "@/lib/store/editor";

export function ViewRedirect({ view, label }: { view: ViewMode; label: string }) {
  const router = useRouter();
  const setViewMode = useEditor((s) => s.setViewMode);

  useEffect(() => {
    setViewMode(view);
    router.replace("/plattegrond");
  }, [view, setViewMode, router]);

  return (
    <div className="flex h-full items-center justify-center text-sm text-ink-500">
      {label} openen…
    </div>
  );
}
