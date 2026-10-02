"use client";

import { ArrowLeft, Menu } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTopBarConfig } from "@/components/TopBarContext";
import { titleForPath } from "@/lib/nav";

// Ported from reference/cereza/app/(shell)/top-bar.tsx's layout (h-14
// header, hamburger button left, balancing spacer right so the title
// stays centered). Shows the name of the drawer screen you're on (Ventas,
// Catálogo...), the "Amarisa" brand outside the drawer's screens, and
// whatever a page asks for via useTopBar — an article's page puts its
// name and ref# here, with a back button on the left and the menu on the
// right.
export default function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  const router = useRouter();
  const config = useTopBarConfig();
  const screenTitle = titleForPath(usePathname());

  const menuButton = (
    <button
      type="button"
      onClick={onMenuClick}
      aria-label="Abrir menú"
      className="flex h-12 w-12 items-center justify-center rounded-md text-ink hover:bg-page"
    >
      <Menu className="h-5 w-5" aria-hidden="true" />
    </button>
  );

  if (config) {
    function goBack() {
      // Arrived by a direct link (nothing to go back to): fall back to the catalog.
      if (window.history.length > 1) router.back();
      else router.push("/items");
    }

    return (
      <header className="grid h-14 shrink-0 grid-cols-[3rem_1fr_3rem] items-center border-b border-line bg-card px-3">
        {config.back ? (
          <button
            type="button"
            onClick={goBack}
            aria-label="Volver"
            className="flex h-12 w-12 items-center justify-center rounded-md text-ink hover:bg-page"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : (
          menuButton
        )}

        <div className="min-w-0 px-1 text-center">
          <p className="truncate text-base leading-tight font-bold text-ink">{config.title}</p>
          {config.subtitle && <p className="truncate font-mono text-[11px] leading-tight text-ink-faint">{config.subtitle}</p>}
        </div>

        {config.back ? menuButton : <div className="h-12 w-12" aria-hidden="true" />}
      </header>
    );
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-card px-3">
      {menuButton}

      <h1 className="text-base font-bold text-ink">{screenTitle ?? "Amarisa"}</h1>

      <div className="h-12 w-12" aria-hidden="true" />
    </header>
  );
}
