"use client";

// NEN 1010- en Bouwbesluit-meldingen als werklijst. Een melding aanklikken
// selecteert het betreffende element in de editor, zodat je van "er is iets
// mis" direct naar "hier is het" gaat.

import clsx from "clsx";
import { AlertTriangle, Info, ShieldCheck, XCircle } from "lucide-react";
import { useIssues } from "@/lib/hooks";
import { useEditor } from "@/lib/store/editor";
import type { ValidationIssue } from "@/lib/validation";

const TONE: Record<ValidationIssue["severity"], { icon: typeof Info; className: string }> = {
  error: { icon: XCircle, className: "text-danger" },
  warn: { icon: AlertTriangle, className: "text-warn" },
  info: { icon: Info, className: "text-blueprint" },
};

const SEVERITY_ORDER: ValidationIssue["severity"][] = ["error", "warn", "info"];

export function IssuesList() {
  const { issues, resolveSelection } = useIssues();
  const select = useEditor((s) => s.select);

  if (issues.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
        <ShieldCheck size={22} className="text-ok" aria-hidden />
        <p className="text-xs text-ink-500">
          Geen meldingen. Elektra, ruimtes en installaties voldoen aan de gecontroleerde regels.
        </p>
      </div>
    );
  }

  const sorted = issues
    .slice()
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  return (
    <ul className="min-h-0 flex-1 overflow-y-auto">
      {sorted.map((issue, i) => {
        const { icon: Icon, className } = TONE[issue.severity];
        const target = resolveSelection(issue.entityId);
        return (
          <li key={`${issue.message}-${i}`}>
            <button
              disabled={!target}
              onClick={() => target && select(target)}
              className={clsx(
                "flex w-full items-start gap-2 border-b border-line px-3 py-2 text-left text-[11px] leading-snug",
                target ? "hover:bg-paper-sunken" : "cursor-default",
              )}
              title={target ? "Toon dit element in de plattegrond" : undefined}
            >
              <Icon size={13} className={clsx("mt-0.5 shrink-0", className)} aria-hidden />
              <span className="min-w-0 flex-1 text-ink-700">{issue.message}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
