"use client";

// Compliance-hints: NEN 1010 (elektra) + Bouwbesluit 2012 (ruimtes).
// Verschijnt als inklapbare banner linksonder zodra er meldingen zijn.

import { useMemo, useState } from "react";
import { AlertTriangle, Info, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { useProject, useLevels, useRooms, useElectrical } from "@/lib/hooks";
import { useEditor } from "@/lib/store/editor";
import { validateElectrical, validateRooms, type ValidationIssue } from "@/lib/validation";

export function ComplianceBanner() {
  const project = useProject();
  const levels = useLevels(project?.id) ?? [];
  const activeLevelId = useEditor((s) => s.activeLevelId);
  const level = levels.find((l) => l.id === activeLevelId) ?? levels[0] ?? null;

  const rooms = useRooms(level?.id) ?? [];
  const electrical = useElectrical(level?.id) ?? [];
  const [open, setOpen] = useState(false);

  const issues = useMemo<ValidationIssue[]>(() => {
    if (!level) return [];
    return [
      ...validateElectrical(electrical),
      ...validateRooms(rooms, [level]),
    ];
  }, [electrical, rooms, level]);

  if (issues.length === 0) return null;

  const errors = issues.filter((i) => i.severity === "error").length;
  const warns = issues.filter((i) => i.severity === "warn").length;
  const infos = issues.filter((i) => i.severity === "info").length;

  const worst: ValidationIssue["severity"] = errors > 0 ? "error" : warns > 0 ? "warn" : "info";
  const tone =
    worst === "error"
      ? { bg: "bg-danger/10", border: "border-danger/40", text: "text-danger" }
      : worst === "warn"
        ? { bg: "bg-warn/10", border: "border-warn/40", text: "text-warn" }
        : { bg: "bg-blueprint/10", border: "border-blueprint/40", text: "text-blueprint" };

  return (
    <div className="no-print pointer-events-auto absolute bottom-[76px] left-3 z-10 w-[min(20rem,calc(100vw-1.5rem))]">
      <div className={`rounded-xl border ${tone.border} ${tone.bg} shadow-lg backdrop-blur`}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2"
        >
          <ShieldCheck size={16} className={tone.text} />
          <span className={`text-xs font-semibold ${tone.text}`}>
            {warns + errors > 0
              ? `${warns + errors} aandachtspunt${warns + errors > 1 ? "en" : ""}`
              : `${infos} tip${infos > 1 ? "s" : ""}`}
          </span>
          <span className="ml-auto text-ink-500">
            {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </span>
        </button>
        {open && (
          <ul className="max-h-48 space-y-1.5 overflow-y-auto border-t border-line/60 px-3 py-2">
            {issues.map((iss, idx) => (
              <li key={idx} className="flex items-start gap-1.5 text-[11px] text-ink-700">
                {iss.severity === "info" ? (
                  <Info size={13} className="mt-0.5 shrink-0 text-blueprint" />
                ) : (
                  <AlertTriangle
                    size={13}
                    className={`mt-0.5 shrink-0 ${iss.severity === "error" ? "text-danger" : "text-warn"}`}
                  />
                )}
                <span>{iss.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
