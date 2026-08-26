"use client";

// Topbar: projectnaam (klikbaar om te hernoemen), opslagstatus en — op desktop —
// de hoofdnavigatie. De verdiepingkiezer die hier stond is vervallen: de
// werkruimte heeft de volledige LevelSwitcher, die ook hernoemen, toevoegen en
// een onderlegger plaatsen kan. Twee kiezers naast elkaar was verwarrend.

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Settings, LayoutTemplate, ListChecks, Receipt, ClipboardList, Frame } from "lucide-react";
import { useProject } from "@/lib/hooks";
import { update } from "@/lib/db/repo";

const NAV = [
  { href: "/plattegrond", label: "Werkruimte", icon: LayoutTemplate },
  { href: "/fases", label: "Fases", icon: ListChecks },
  { href: "/kosten", label: "Kosten", icon: Receipt },
  { href: "/aanzichten", label: "Aanzichten", icon: Frame },
  { href: "/werkblad", label: "Werkblad", icon: ClipboardList },
] as const;

export function TopBar() {
  const pathname = usePathname();
  const project = useProject();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    if (!project) return;
    setName(project.name);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  async function commit() {
    if (!project) return;
    const trimmed = name.trim();
    if (trimmed && trimmed !== project.name) await update("projects", project.id, { name: trimmed });
    setEditing(false);
  }

  return (
    <header className="no-print safe-top z-20 flex items-center justify-between gap-3 border-b border-line bg-paper-raised px-3 pb-2">
      <div className="min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commit();
              if (e.key === "Escape") setEditing(false);
            }}
            aria-label="Projectnaam"
            className="w-48 rounded-control bg-paper-sunken px-2 py-0.5 text-[15px] font-bold text-ink-900 outline-none ring-1 ring-accent"
            autoFocus
          />
        ) : (
          <button
            onClick={startEdit}
            title="Klik om het project te hernoemen"
            className="block max-w-full truncate text-left text-[15px] font-bold leading-tight text-ink-900 hover:text-accent-ink"
          >
            {project?.name ?? "Bouwproject"}
          </button>
        )}
        <div className="label-micro flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-ok" />
          Opgeslagen
        </div>
      </div>

      {/* Desktopnavigatie. Op mobiel doet de onderbalk dit. */}
      <nav aria-label="Hoofdnavigatie" className="hidden items-center gap-0.5 lg:flex">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex h-[var(--control-h-sm)] items-center gap-1.5 rounded-control px-2.5 text-xs font-semibold transition-colors",
                active
                  ? "bg-ink-900 text-paper-raised"
                  : "text-ink-600 hover:bg-paper-sunken hover:text-ink-900",
              )}
            >
              <Icon size={14} aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/instellingen"
        aria-label="Instellingen"
        className={clsx(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
          pathname === "/instellingen"
            ? "bg-ink-900 text-paper-raised"
            : "text-ink-500 hover:bg-paper-sunken hover:text-ink-900",
        )}
      >
        <Settings size={17} />
      </Link>
    </header>
  );
}
