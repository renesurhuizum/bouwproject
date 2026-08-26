"use client";

// De werkruimte-schil: rail links, viewport in het midden, inspector rechts,
// statusbalk onderaan. Alleen vanaf lg (1024px).
//
// Onder lg krijgen de rail- en inspector-wrappers `display: contents`. Daardoor
// verdwijnen ze uit de layout en positioneren hun kinderen zich weer absoluut
// t.o.v. de werkruimte — precies zoals de app zich op de telefoon al gedroeg.
// Zo verandert de desktopstructuur zonder dat de mobiele bediening meebeweegt.

import clsx from "clsx";

export function WorkspaceLayout({
  rail,
  viewport,
  inspector,
  statusbar,
}: {
  rail: React.ReactNode;
  viewport: React.ReactNode;
  inspector: React.ReactNode;
  statusbar?: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "absolute inset-0 overflow-hidden bg-paper",
        "lg:grid lg:grid-cols-[var(--rail-w)_minmax(0,1fr)_var(--inspector-w)]",
        "lg:grid-rows-[minmax(0,1fr)_auto]",
      )}
    >
      <aside
        aria-label="Gereedschap en fasering"
        className="contents lg:flex lg:min-h-0 lg:flex-col lg:border-r lg:border-line lg:bg-paper-raised"
      >
        {rail}
      </aside>

      {/* Het canvas zelf. Op mobiel vult dit het scherm en zweven de panelen
          eroverheen; op desktop is het de middenkolom. */}
      <div className="absolute inset-0 lg:relative lg:col-start-2 lg:row-start-1">
        {viewport}
      </div>

      <aside
        aria-label="Eigenschappen en staat"
        className="contents lg:flex lg:min-h-0 lg:flex-col lg:border-l lg:border-line lg:bg-paper-raised"
      >
        {inspector}
      </aside>

      {statusbar && (
        <div className="hidden lg:col-span-3 lg:row-start-2 lg:block lg:border-t lg:border-line lg:bg-paper-raised">
          {statusbar}
        </div>
      )}
    </div>
  );
}
