"use client";

// Visuele keuzeknop: een staaltje (materiaaltextuur of vormicoon) met label,
// in plaats van een tekstknopje. Zo zie je wát je kiest voordat je klikt.

import clsx from "clsx";

export function Swatch({
  label,
  /** CSS-background dat de textuur tekent (zie WALL_MATERIAL_SWATCH). */
  background,
  /** Alternatief voor background: een vorm-icoon, bv. een daksilhouet. */
  icon,
  selected,
  onClick,
  title,
  className,
}: {
  label: React.ReactNode;
  background?: string;
  icon?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={selected}
      className={clsx(
        "group flex flex-col items-center gap-1 rounded-control border p-1.5 transition-colors",
        selected
          ? "border-ink-900 bg-paper-sunken"
          : "border-line bg-paper-raised hover:border-line-strong",
        className,
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "flex h-8 w-full items-center justify-center overflow-hidden rounded-[0.25rem] ring-1 ring-inset ring-ink-900/10",
          selected && "ring-ink-900/25",
        )}
        style={background ? { background } : undefined}
      >
        {icon}
      </span>
      <span
        className={clsx(
          "w-full truncate text-center text-[10px] font-semibold leading-tight",
          selected ? "text-ink-900" : "text-ink-500",
        )}
      >
        {label}
      </span>
    </button>
  );
}

export function SwatchGrid({
  columns = 4,
  className,
  children,
}: {
  columns?: 3 | 4;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={clsx("grid gap-1.5", columns === 3 ? "grid-cols-3" : "grid-cols-4", className)}
    >
      {children}
    </div>
  );
}
