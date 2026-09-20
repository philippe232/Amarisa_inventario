"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

function noopSubscribe() {
  return () => {};
}
function getMountedSnapshot() {
  return true;
}
function getServerMountedSnapshot() {
  return false;
}

// Shared bottom-sheet overlay — backdrop + card. Ported from
// reference/cereza/app/(shell)/modal-sheet.tsx, same reasoning:
// portaled to document.body so it can never get trapped under a sibling
// `sticky`/positioned element's own stacking context (SearchFilterBar is
// `sticky top-0 z-10`), and its own scroll-lock targets <main> (this
// app's one real scroll container, via AppShell) rather than document.body.
export default function ModalSheet({
  children,
  nested = false,
  onBackdropClick,
}: {
  children: React.ReactNode;
  // A sheet opened from inside another sheet needs a higher z-index to
  // guarantee it paints above the one underneath it.
  nested?: boolean;
  // Opt-in — undefined means only an explicit close control inside
  // `children` dismisses the sheet.
  onBackdropClick?: () => void;
}) {
  // Portals need a browser document — this reads false during SSR/the
  // first client render (getServerMountedSnapshot), then true right
  // after, without a setState-in-effect (this project's
  // react-hooks/set-state-in-effect lint rule rejects that shape; same
  // useSyncExternalStore idiom reference/cereza/app/(shell)/shell.tsx
  // uses for its own server/client identity-cache split).
  const mounted = useSyncExternalStore(noopSubscribe, getMountedSnapshot, getServerMountedSnapshot);

  useEffect(() => {
    const target = (document.querySelector("main") as HTMLElement | null) ?? document.body;
    const original = target.style.overflow;
    target.style.overflow = "hidden";
    return () => {
      target.style.overflow = original;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      onClick={onBackdropClick}
      className={`fixed inset-0 flex items-end justify-center overflow-x-hidden bg-black/30 sm:items-center ${nested ? "z-30" : "z-20"}`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full min-w-0 max-w-md overflow-y-auto overscroll-contain rounded-t-lg bg-white p-6 shadow-lg sm:rounded-lg"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
