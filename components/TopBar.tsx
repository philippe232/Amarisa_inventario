"use client";

import { Menu } from "lucide-react";

// Ported from reference/cereza/app/(shell)/top-bar.tsx's layout (h-14
// header, hamburger button left, balancing spacer right so the title
// stays centered) — simplified to a static brand label since this app
// has no per-route title lookup like Cereza's nav-config.
export default function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-card px-3">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Abrir menú"
        className="flex h-12 w-12 items-center justify-center rounded-md text-ink hover:bg-page"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      <h1 className="text-base font-bold text-ink">Amarisa</h1>

      <div className="h-12 w-12" aria-hidden="true" />
    </header>
  );
}
