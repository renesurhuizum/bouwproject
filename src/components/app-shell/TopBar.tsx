"use client";

// Compacte topbar met projectnaam en (op de plattegrond/3D) een verdieping-kiezer.

import { usePathname } from "next/navigation";
import { useProject, useLevels } from "@/lib/hooks";
import { useEditor } from "@/lib/store/editor";

export function TopBar() {
  const pathname = usePathname();
  const project = useProject();
  const levels = useLevels(project?.id);
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const setActiveLevel = useEditor((s) => s.setActiveLevel);

  const showLevels = pathname === "/plattegrond" || pathname === "/3d";

  return (
    <header className="no-print safe-top z-20 flex items-center justify-between gap-2 border-b border-line bg-paper-raised px-3 pb-2">
      <div className="min-w-0">
        <div className="truncate text-[15px] font-bold leading-tight text-ink-900">
          {project?.name ?? "Bouwproject"}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ink-400">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full bg-ok"
            title="Opgeslagen"
          />
          Opgeslagen
        </div>
      </div>

      {showLevels && levels && levels.length > 0 && (
        <div className="flex shrink-0 gap-1 rounded-full bg-paper-sunken p-1">
          {levels.map((lvl) => {
            const active = lvl.id === activeLevelId;
            return (
              <button
                key={lvl.id}
                onClick={() => setActiveLevel(lvl.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-ink-900 text-paper-raised"
                    : "text-ink-500 hover:text-ink-900"
                }`}
              >
                {lvl.name}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
