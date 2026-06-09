"use client";

// 3D-scherm: door het huis kijken. Three.js is client-only.

import dynamic from "next/dynamic";
import { useWalls } from "@/lib/hooks";
import { useEditor } from "@/lib/store/editor";

const Scene3D = dynamic(
  () => import("@/components/scene3d/Scene3D").then((m) => m.Scene3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-ink-500">
        3D laden…
      </div>
    ),
  },
);

const Edit3DToolbar = dynamic(
  () => import("@/components/scene3d/Edit3DToolbar").then((m) => m.Edit3DToolbar),
  { ssr: false },
);

export default function ThreeDPage() {
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const walls = useWalls(activeLevelId) ?? [];

  return (
    <div className="absolute inset-0">
      <Scene3D />
      {walls.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center px-4">
          <div className="pointer-events-auto rounded-xl border border-line bg-paper-raised/95 px-4 py-2.5 text-center text-sm text-ink-700 shadow-lg backdrop-blur">
            Teken eerst muren op de <span className="font-medium text-accent">Plattegrond</span> —
            ze verschijnen hier automatisch in 3D.
          </div>
        </div>
      )}
      <Edit3DToolbar />
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        <div className="rounded-full bg-ink-900/80 px-3 py-1 text-[11px] text-paper-raised backdrop-blur">
          Sleep om te draaien · knijp/scroll om te zoomen
        </div>
      </div>
    </div>
  );
}
