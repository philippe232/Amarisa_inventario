"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, Heart, LogOut, LogIn, ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSessionInfo } from "@/lib/auth";

// Ported from reference/cereza/app/(shell)/drawer.tsx's overlay/panel
// shape (fixed inset-0 flex, w-72 panel + flex-1 backdrop button, no
// open animation) — simplified to a flat list since this app has no
// sections/badges to account for.
const VIEWER_NAV_ITEMS = [
  { href: "/items", label: "Inicio", icon: Home, external: false },
  { href: "/wishlist", label: "Mi lista", icon: Heart, external: false },
];
// Editor/Owner's whole app surface is list/detail/edit — Mi lista is a
// customer feature (bids on their own anonymous session's wishlist),
// meaningless for an admin identity. Scoped the same for Editor and
// Owner "for now" per explicit instruction, not a permissions split.
// "Revisión de Inventario" is external (a Claude artifact, not an app
// route) — opens in a new tab so the drawer's own navigation state
// isn't lost.
const ADMIN_NAV_ITEMS = [
  { href: "/items", label: "Inicio", icon: Home, external: false },
  {
    href: "https://claude.ai/artifact/KoNVMkdRQFZ9W3AdXxWncQ",
    label: "Revisión de Inventario",
    icon: ClipboardList,
    external: true,
  },
];

export default function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { isAnonymous, email, role } = useSessionInfo();

  if (!open) return null;

  const navItems = role ? ADMIN_NAV_ITEMS : VIEWER_NAV_ITEMS;

  async function handleLogout() {
    await createClient().auth.signOut();
    onClose();
    // /login always has a "Continuar como invitado" way out now, so
    // this is never a dead end regardless of who was signed in.
    router.push("/login");
  }

  return (
    <div className="fixed inset-0 z-20 flex">
      <div className="flex w-72 flex-col border-r border-line bg-card shadow-lg">
        <div className="border-b border-line p-4">
          <p className="text-sm font-bold text-ink">Amarisa</p>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {navItems.map(({ href, label, icon: Icon, external }) =>
            external ? (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className="flex min-h-11 items-center gap-3 rounded-md px-3 py-1.5 text-sm text-ink hover:bg-page"
              >
                <Icon className="h-5 w-5 shrink-0 text-ink-soft" aria-hidden="true" />
                <span className="flex-1">{label}</span>
              </a>
            ) : (
              <Link
                key={href}
                href={href}
                onClick={onClose}
                className="flex min-h-11 items-center gap-3 rounded-md px-3 py-1.5 text-sm text-ink hover:bg-page"
              >
                <Icon className="h-5 w-5 shrink-0 text-ink-soft" aria-hidden="true" />
                <span className="flex-1">{label}</span>
              </Link>
            )
          )}
        </nav>

        {/* Always one of the two states — a signed-in identity (email,
            role tag if applicable) + Cerrar sesión, or an Iniciar
            sesión link. Never blank, unlike the earlier version that
            hid this entirely for anonymous visitors. */}
        <div className="border-t border-line p-3">
          {isAnonymous ? (
            <Link
              href="/login"
              onClick={onClose}
              className="flex min-h-11 items-center gap-3 rounded-md px-3 py-1.5 text-sm text-ink hover:bg-page"
            >
              <LogIn className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
              Iniciar sesión
            </Link>
          ) : (
            <>
              <p className="truncate px-3 text-xs text-ink-soft">
                {email}
                {role && <> · {role === "owner" ? "Dueño" : "Editor"}</>}
              </p>
              <button
                type="button"
                onClick={handleLogout}
                className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm text-ink hover:bg-page"
              >
                <LogOut className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
                Cerrar sesión
              </button>
            </>
          )}
        </div>
      </div>
      <button type="button" aria-label="Cerrar menú" onClick={onClose} className="flex-1 bg-black/30" />
    </div>
  );
}
