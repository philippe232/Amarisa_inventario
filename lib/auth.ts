import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type AdminRole = "owner" | "editor" | null;

export type SessionInfo = {
  loading: boolean;
  // True for the invisible per-visitor session everyone gets automatically
  // (see ensureAnonymousSession) — false once they've linked or signed in
  // with a real email, whether or not that email is an admin.
  isAnonymous: boolean;
  email: string | null;
  role: AdminRole;
};

// Single source of truth for "who is this session" — used by the wishlist
// save prompt (isAnonymous/email) and by the item screens (role). Calls
// the my_admin_role() RPC rather than querying the admins table directly
// — that table has zero read policies, by design, so this SECURITY
// DEFINER function is the only sanctioned way to learn whether the
// current session's verified email is on the list.
export function useSessionInfo(): SessionInfo {
  const [state, setState] = useState<SessionInfo>({ loading: true, isAnonymous: true, email: null, role: null });

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!session || session.user.is_anonymous) {
        setState({ loading: false, isAnonymous: true, email: null, role: null });
        return;
      }

      const { data } = await supabase.rpc("my_admin_role");
      if (cancelled) return;
      setState({ loading: false, isAnonymous: false, email: session.user.email ?? null, role: (data as AdminRole) ?? null });
    }

    check();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => check());

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}

// Shared by SaveWishlistPrompt and the unified /login screen — tries
// updateUser() first (called on whatever anonymous session the caller
// already has, so it LINKS this email to that session's existing
// user_id rather than creating a disconnected one, preserving any
// wishlist_items already under it), falling back to signInWithOtp (a
// plain sign-in to a pre-existing account) only when that email is
// already registered — e.g. recovering a previously-saved list on a
// new device, where there's nothing local worth preserving anyway.
export async function sendMagicLink(email: string, emailRedirectTo: string): Promise<void> {
  const supabase = createClient();
  const { error: linkError } = await supabase.auth.updateUser({ email }, { emailRedirectTo });
  if (linkError) {
    const { error: otpError } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } });
    if (otpError) throw otpError;
  }
}
