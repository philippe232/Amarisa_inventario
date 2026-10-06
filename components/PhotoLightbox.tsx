"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

function noopSubscribe() {
  return () => {};
}

// Full-screen photo viewer — dark backdrop, image contained (never
// cropped), prev/next + arrow keys when an item has several photos,
// Escape/backdrop/X to close. Portaled to <body> for the same reason as
// ModalSheet: a sticky table column or scroll container can never trap it.
export default function PhotoLightbox({
  photos,
  alt,
  startIndex = 0,
  onClose,
}: {
  photos: string[];
  alt: string;
  startIndex?: number;
  onClose: () => void;
}) {
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const [index, setIndex] = useState(startIndex);
  const count = photos.length;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + count) % count);
      else if (e.key === "ArrowRight") setIndex((i) => (i + 1) % count);
    }
    window.addEventListener("keydown", onKey);
    const target = (document.querySelector("main") as HTMLElement | null) ?? document.body;
    const original = target.style.overflow;
    target.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      target.style.overflow = original;
    };
  }, [count, onClose]);

  if (!mounted || count === 0) return null;

  const navButton = "absolute top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/85 p-4"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photos[index]}
        alt={alt}
        decoding="async"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88dvh] max-w-full rounded object-contain"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute top-3 right-3 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Foto anterior"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i - 1 + count) % count);
            }}
            className={`${navButton} left-3`}
          >
            <ChevronLeft className="h-6 w-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Foto siguiente"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i + 1) % count);
            }}
            className={`${navButton} right-3`}
          >
            <ChevronRight className="h-6 w-6" aria-hidden="true" />
          </button>
          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-1 text-xs font-semibold text-white [font-variant-numeric:tabular-nums]">
            {index + 1} / {count}
          </p>
        </>
      )}
    </div>,
    document.body,
  );
}
