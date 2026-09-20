"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Filter, X } from "lucide-react";
import ModalSheet from "@/components/ModalSheet";
import { selectAllOnFocus } from "@/lib/select-on-focus";

export type FilterChip = { id: string; label: string };

// Ported from reference/cereza/app/components/search-filter-bar.tsx —
// same shape: sticky pill-shaped search field with the filter icon
// inside it, capsule chips below for active filters, a bottom sheet
// (ModalSheet) for the filter panel, and an auto-hide-on-scroll-down
// header. sheetContent is a slot for each screen's own filter controls.
export default function SearchFilterBar({
  value,
  onChange,
  placeholder = "Buscar",
  chips = [],
  onRemoveChip,
  onClearAll,
  sheetTitle = "Filtrar",
  sheetContent,
  onOpenChange,
  showFilterBadge = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  chips?: FilterChip[];
  onRemoveChip?: (id: string) => void;
  onClearAll?: () => void;
  sheetTitle?: string;
  sheetContent?: React.ReactNode | ((closeSheet: () => void) => React.ReactNode);
  onOpenChange?: (open: boolean) => void;
  showFilterBadge?: boolean;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  function openSheet() {
    setSheetOpen(true);
    onOpenChange?.(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    onOpenChange?.(false);
  }

  // Auto-hide on scroll down, reveal on scroll up or at the top —
  // listens on <main> (AppShell's one real scroll container), same as
  // the reference implementation.
  const [hidden, setHidden] = useState(false);
  const lastScrollTop = useRef(0);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;

    function handleScroll() {
      const top = main!.scrollTop;
      const DOWN_THRESHOLD_PX = 8;
      const UP_THRESHOLD_PX = 8;
      if (top <= 0) {
        setHidden(false);
      } else if (top > lastScrollTop.current + DOWN_THRESHOLD_PX) {
        setHidden(true);
      } else if (top < lastScrollTop.current - UP_THRESHOLD_PX) {
        setHidden(false);
      }
      lastScrollTop.current = top;
    }

    main.addEventListener("scroll", handleScroll, { passive: true });
    return () => main.removeEventListener("scroll", handleScroll);
  }, []);

  // Never stay hidden while the filter sheet is open — derived directly
  // in render rather than a setState-in-effect resetting `hidden`
  // itself (this project's react-hooks/set-state-in-effect lint rule
  // rejects that shape, and there's no real reason to mutate state here
  // when the render-time combination already says what's needed).
  const effectivelyHidden = hidden && !sheetOpen;

  return (
    <div
      className={`sticky top-0 z-10 border-b border-line bg-card px-3.5 py-2 transition-transform duration-200 ease-out ${
        effectivelyHidden ? "-translate-y-full" : "translate-y-0"
      }`}
    >
      <div className="flex h-12 items-center rounded-full border border-line-strong bg-page pl-3">
        <Search className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={selectAllOnFocus}
          placeholder={placeholder}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-base text-ink placeholder:text-ink-faint focus:outline-none"
        />
        {sheetContent && (
          <button
            type="button"
            onClick={openSheet}
            aria-label="Filtros"
            className="relative flex h-12 w-12 shrink-0 items-center justify-center border-l border-line-strong text-ink"
          >
            <Filter className="h-4 w-4" aria-hidden="true" />
            {(showFilterBadge || chips.length > 0) && (
              <span aria-hidden className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-ink" />
            )}
          </button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <span
              key={chip.id}
              className="flex min-h-9 items-center gap-1.5 rounded-full border border-line-strong bg-card px-3 text-sm text-ink"
            >
              {chip.label}
              {onRemoveChip && (
                <button
                  type="button"
                  onClick={() => onRemoveChip(chip.id)}
                  aria-label={`Quitar ${chip.label}`}
                  className="text-ink-faint"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {sheetOpen && (
        <ModalSheet>
          <div className="sticky top-0 z-10 -mx-6 -mt-6 mb-10 flex min-h-[84px] items-center justify-between bg-card px-6 pt-6 pb-3">
            <h2 className="text-base font-semibold text-ink">{sheetTitle}</h2>
            <div className="flex items-center">
              {onClearAll && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="flex min-h-[48px] items-center px-3 text-sm font-semibold text-ink"
                >
                  Resetear
                </button>
              )}
              <button
                type="button"
                onClick={closeSheet}
                aria-label="Cerrar"
                className="-mr-3 flex h-12 w-12 items-center justify-center text-ink-soft"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
          {typeof sheetContent === "function" ? sheetContent(closeSheet) : sheetContent}
          <button
            type="button"
            onClick={closeSheet}
            className="mt-5 flex min-h-[48px] w-full items-center justify-center rounded-md bg-ink text-sm font-semibold text-white"
          >
            Aplicar
          </button>
        </ModalSheet>
      )}
    </div>
  );
}
