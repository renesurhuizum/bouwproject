"use client";

// Paneel-omhulsel voor de werkruimte. Bepaalt zelf géén positie: op desktop
// dokt de WorkspaceLayout het in een grid-kolom, op mobiel zweeft het als
// sheet. Daardoor konden Toolbar/SelectionPanel/ComplianceBanner ongewijzigd
// blijven — alleen hun buitenste absolute-wrapper is hierdoor vervangen.

import clsx from "clsx";

export function Panel({
  className,
  floating,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  /** Zwevend boven het canvas (mobiel) i.p.v. gedockt (desktop). */
  floating?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex flex-col border-line bg-paper-raised",
        floating
          ? "rounded-panel border shadow-panel backdrop-blur supports-[backdrop-filter]:bg-paper-raised/95"
          : "border-0",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2",
        className,
      )}
    >
      <h2 className="label-micro truncate">{title}</h2>
      {action}
    </div>
  );
}

export function PanelSection({
  title,
  action,
  className,
  children,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={clsx("border-b border-line px-3 py-2.5 last:border-b-0", className)}>
      {title && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="label-micro truncate">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
