"use client";

// Kengetal-tegel. Gedeeld door dashboard, inspector en kostenoverzicht zodat
// bedragen overal dezelfde typografie en uitlijning hebben.

import clsx from "clsx";

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  size = "md",
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "neutral" | "accent" | "ok" | "warn" | "danger";
  size?: "sm" | "md";
  className?: string;
}) {
  const toneClass = {
    neutral: "text-ink-900",
    accent: "text-accent-ink",
    ok: "text-ok",
    warn: "text-warn",
    danger: "text-danger",
  }[tone];

  return (
    <div
      className={clsx(
        "rounded-card border border-line bg-paper-raised p-3 shadow-raised",
        className,
      )}
    >
      <div className="label-micro truncate">{label}</div>
      <div
        className={clsx(
          "tabular mt-1 font-black leading-none",
          size === "sm" ? "text-lg" : "text-2xl",
          toneClass,
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-1 truncate text-[11px] text-ink-400">{sub}</div>}
    </div>
  );
}
