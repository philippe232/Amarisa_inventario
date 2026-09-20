"use client";

import Link from "next/link";
import { Home, Heart } from "lucide-react";

// Ported from reference/cereza/app/(shell)/drawer.tsx's overlay/panel
// shape (fixed inset-0 flex, w-72 panel + flex-1 backdrop button, no
// open animation) — simplified to a flat two-item list since this app
// has no roles/sections/badges to account for.
const NAV_ITEMS = [
  { href: "/items", label: "Inicio", icon: Home },
  { href: "/wishlist", label: "Mi lista", icon: Heart },
];

export default function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-20 flex">
      <div className="flex w-72 flex-col border-r border-line bg-card shadow-lg">
        <div className="border-b border-line p-4">
          <p className="text-sm font-bold text-ink">Amarisa</p>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className="flex min-h-11 items-center gap-3 rounded-md px-3 py-1.5 text-sm text-ink hover:bg-page"
            >
              <Icon className="h-5 w-5 shrink-0 text-ink-soft" aria-hidden="true" />
              <span className="flex-1">{label}</span>
            </Link>
          ))}
        </nav>
      </div>
      <button type="button" aria-label="Cerrar menú" onClick={onClose} className="flex-1 bg-black/30" />
    </div>
  );
}
