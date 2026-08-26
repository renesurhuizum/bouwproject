"use client";

// Eén tab-component voor de hele app. Verving drie bijna-identieke pill-tab
// implementaties (kosten/page.tsx, TopBar verdiepingkiezer, Toolbar-tabbladen)
// die elk net andere maten en radii hadden.

import clsx from "clsx";

export type Segment<T extends string> = {
  key: T;
  label: React.ReactNode;
  /** Optionele kleuraccent voor de actieve stand, bv. per installatielaag. */
  activeClassName?: string;
  title?: string;
};

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  size = "md",
  variant = "pill",
  className,
  ariaLabel,
}: {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (key: T) => void;
  size?: "sm" | "md";
  /** pill = afgeronde schakelaar, underline = tabbladen met onderlijn. */
  variant?: "pill" | "underline";
  className?: string;
  ariaLabel?: string;
}) {
  const pill = variant === "pill";

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={clsx(
        pill ? "flex gap-1 rounded-control bg-paper-sunken p-1" : "flex border-b border-line",
        className,
      )}
    >
      {segments.map((s) => {
        const active = s.key === value;
        return (
          <button
            key={s.key}
            role="tab"
            type="button"
            aria-selected={active}
            title={s.title}
            onClick={() => onChange(s.key)}
            className={clsx(
              "flex-1 truncate font-semibold transition-colors",
              size === "sm" ? "text-xs" : "text-sm",
              pill
                ? [
                    "rounded-control",
                    size === "sm" ? "py-1" : "py-1.5",
                    active
                      ? s.activeClassName ?? "bg-ink-900 text-paper-raised"
                      : "text-ink-500 hover:text-ink-900",
                  ]
                : [
                    "border-b-2 py-2",
                    active
                      ? s.activeClassName ?? "border-accent text-accent-ink"
                      : "border-transparent text-ink-500 hover:text-ink-900",
                  ],
            )}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
