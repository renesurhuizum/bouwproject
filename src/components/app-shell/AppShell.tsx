"use client";

// Mobiel-first app-shell: compacte topbar + content + onderbalk-navigatie.

import { TopBar } from "./TopBar";
import { BottomNav } from "./BottomNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-paper">
      <TopBar />
      <main className="relative flex-1 overflow-hidden">{children}</main>
      <BottomNav />
    </div>
  );
}
