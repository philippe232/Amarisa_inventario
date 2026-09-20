"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, Heart, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSessionInfo } from "@/lib/auth";

// Ported from reference/cereza/app/(shell)/drawer.tsx's overlay/panel
// shape (fixed inset-0 flex, w-72 panel + flex-1 backdrop button, no
// open animation) — simplified to a flat two-item list since this app
// has no roles/sections/badges to account for.
const NAV_ITEMS = [
  { href: "/items", label: "Inicio", icon: Home },
  { href: "/wishlist", label: "Mi lista", icon: Heart },
];

export default function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { isAnonymous, email, role } = useSessionInfo();

  if (!open) return null;

  async function handleLogout() {
    // Captured before signOut() — role resets to null once the session
    // is gone, which would make every logout look non-admin by the time
    // we decide where to send them.
    const wasAdmin = role != null;
    await createClient().auth.signOut();
    onClose();
    // Only an admin gets bounced to /login — it's a password-only page
    // with nothing a plain viewer could do there, so sending them there
    // too would just be a dead end (and re-expose "admin access" as a
    // concept to someone who saved their wishlist via email, which is
    // exactly what keeping this page unlinked was meant to avoid).
    if (wasAdmin) router.push("/login");
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

        {/* No public login entry point here — signing in only happens
            contextually, from the "save my list" prompt on /wishlist
            (SaveWishlistPrompt), never framed as "admin access." This
            footer only ever shows state for a session that's already
            real (linked/signed in), whether or not that email happens
            to be an admin; a plain anonymous visitor sees nothing here
            at all. */}
        {!isAnonymous && (
          <div className="border-t border-line p-3">
            <p className="truncate px-3 text-xs text-ink-soft">
              {role ? `Sesión: ${role === "owner" ? "Dueño" : "Editor"}` : `Lista guardada: ${email}`}
            </p>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-1.5 text-left text-sm text-ink hover:bg-page"
            >
              <LogOut className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden="true" />
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
      <button type="button" aria-label="Cerrar menú" onClick={onClose} className="flex-1 bg-black/30" />
    </div>
  );
}
