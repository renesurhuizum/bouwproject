"use client";

// Onderbalk-navigatie (mobiel-first, grote tikdoelen).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, PencilRuler, Box, ListChecks, Euro } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Start", icon: LayoutDashboard },
  { href: "/plattegrond", label: "Plattegrond", icon: PencilRuler },
  { href: "/3d", label: "3D", icon: Box },
  { href: "/fases", label: "Fases", icon: ListChecks },
  { href: "/kosten", label: "Kosten", icon: Euro },
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
            className={`flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors ${
              active ? "text-accent" : "text-ink-500"
            }`}
          >
            <Icon
              size={22}
              strokeWidth={active ? 2.4 : 1.8}
              className={active ? "text-accent" : "text-ink-500"}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
