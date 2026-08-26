"use client";

// Label + bediening op één rij. Generaliseert Row/NumberField die alleen in
// SelectionPanel bestonden, zodat inspector, toolbar en instellingen dezelfde
// uitlijning en tikdoelen krijgen.

import clsx from "clsx";

export function Field({
  label,
  hint,
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={clsx("flex items-center justify-between gap-3 py-1", className)}>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-ink-600">{label}</div>
        {hint && <div className="truncate text-[11px] text-ink-400">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </div>
  );
}

export function NumberField({
  value,
  onChange,
  step = 0.01,
  min,
  max,
  unit,
  /** Weergavefactor: sla op in meters, toon in cm met scale={100}. */
  scale = 1,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "step" | "min" | "max"> & {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  scale?: number;
}) {
  return (
    <div
      className={clsx(
        "flex h-[var(--control-h-sm)] items-center gap-1 rounded-control border border-line bg-paper-raised px-2 focus-within:border-blueprint",
        className,
      )}
    >
      <input
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? Math.round(value * scale * 1000) / 1000 : ""}
        step={step * scale}
        min={min != null ? min * scale : undefined}
        max={max != null ? max * scale : undefined}
        onChange={(e) => {
          const next = parseFloat(e.target.value);
          if (Number.isFinite(next)) onChange(next / scale);
        }}
        className="tabular w-14 bg-transparent text-right text-xs font-semibold text-ink-900 outline-none"
        {...props}
      />
      {unit && <span className="text-[11px] text-ink-400">{unit}</span>}
    </div>
  );
}
