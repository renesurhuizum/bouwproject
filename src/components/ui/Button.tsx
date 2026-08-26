"use client";

// Gedeelde knop. Verving de ad-hoc Tailwind-combinaties die per scherm
// verschilden (rounded-lg/xl/full door elkaar, wisselende tekstgroottes).

import clsx from "clsx";

export type ButtonVariant = "primary" | "accent" | "soft" | "ghost" | "outline" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  // Gevuld donker — de primaire actie en de "aan"-stand van een schakelaar.
  primary: "bg-ink-900 text-paper-raised hover:bg-ink-800",
  // Gevuld oranje. accent-ink i.p.v. accent zodat witte tekst AA haalt.
  accent: "bg-accent-ink text-white hover:bg-accent",
  // Rustige vulling op papier — de standaard voor tool-knoppen.
  soft: "bg-paper-sunken text-ink-700 hover:text-ink-900 hover:bg-line",
  ghost: "text-ink-600 hover:bg-paper-sunken hover:text-ink-900",
  outline: "border border-line bg-paper-raised text-ink-700 hover:border-line-strong hover:text-ink-900",
  danger: "bg-danger text-white hover:brightness-95",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-[var(--control-h-sm)] px-2.5 text-xs gap-1.5",
  md: "h-[var(--control-h)] px-3.5 text-sm gap-2",
};

export function Button({
  variant = "soft",
  size = "md",
  active,
  iconOnly,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ingedrukte/geselecteerde stand — schakelt naar de primary-look. */
  active?: boolean;
  iconOnly?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-control font-semibold transition-colors",
        "disabled:pointer-events-none disabled:opacity-40",
        active ? VARIANTS.primary : VARIANTS[variant],
        SIZES[size],
        iconOnly && (size === "sm" ? "w-[var(--control-h-sm)] px-0" : "w-[var(--control-h)] px-0"),
        className,
      )}
      {...props}
    />
  );
}
