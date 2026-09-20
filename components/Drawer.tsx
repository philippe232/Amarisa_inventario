"use client";

import Link from "next/link";
import { Home, Heart, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAdminRole } from "@/lib/auth";

// Ported from reference/cereza/app/(shell)/drawer.tsx's overlay/panel
// shape (fixed inset-0 flex, w-72 panel + flex-1 backdrop button, no
// open animation) — simplified to a flat two-item list since this app
// has no roles/sections/badges to account for.
const NAV_ITEMS = [
  { href: "/items", label: "Inicio", icon: Home },
  { href: "/wishlist", label: "Mi lista", icon: Heart },
];

export default function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { role } = useAdminRole();

  if (!open) return null;

  async function handleLogout() {
    await createClient().auth.signOut();
    onClose();
  }

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

        {/* Low-key admin entry point — most visitors never touch this.
            Signed-in-as-admin state shows a role label + Cerrar sesión;
            everyone else (including every anonymous wishlist session)
            just sees a small "Acceder" link to /login. */}
        <div className="border-t border-line p-3">
          {role ? (
            <>
              <p className="px-3 text-xs text-ink-soft">Sesión: {role === "owner" ? "Dueño" : "Editor"}</p>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm text-ink hover:bg-page"
              >
                <LogOut className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
                Cerrar sesión
              </button>
            </>
          ) : (
            <Link
              href="/login"
              onClick={onClose}
              className="block px-3 py-1.5 text-xs text-ink-faint hover:text-ink-soft"
            >
              Acceso de administrador
            </Link>
          )}
        </div>
      </div>
      <button type="button" aria-label="Cerrar menú" onClick={onClose} className="flex-1 bg-black/30" />
    </div>
  );
}
