"use client";

// Onderbalk-navigatie (mobiel-first, grote tikdoelen).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LayoutTemplate, Box, ListChecks, Receipt } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Start", icon: LayoutDashboard },
  { href: "/plattegrond", label: "Plattegrond", icon: LayoutTemplate },
  { href: "/3d", label: "3D", icon: Box },
  { href: "/fases", label: "Fases", icon: ListChecks },
  { href: "/kosten", label: "Kosten", icon: Receipt },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Hoofdnavigatie"
      className="no-print safe-bottom z-20 grid grid-cols-5 border-t border-line bg-paper-raised"
    >
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className="relative flex flex-col items-center gap-1 pb-2 pt-2.5 text-[10px] font-semibold transition-colors"
            style={{ color: active ? "var(--color-accent)" : "var(--color-ink-400)" }}
          >
            {/* Actieve indicator pill bovenaan */}
            <span
              aria-hidden
              className="absolute left-1/2 top-0 h-0.5 w-6 -translate-x-1/2 rounded-full transition-all duration-200"
              style={{
                background: active ? "var(--color-accent)" : "transparent",
              }}
            />

            <Icon
              size={22}
              strokeWidth={active ? 2.5 : 1.7}
              aria-hidden
            />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
