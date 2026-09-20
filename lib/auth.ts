import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type AdminRole = "owner" | "editor" | null;

// Calls the my_admin_role() RPC (0004_admin_roles_and_photo_uploads.sql)
// rather than querying the admins table directly — that table has zero
// read policies, by design, so this SECURITY DEFINER function is the
// only sanctioned way to learn whether the current session's verified
// email is on the list. Returns null for every non-admin session,
// including every anonymous one (their JWT has no email claim at all).
//
// UI-only signal: actual enforcement is RLS (is_admin()) on the tables
// themselves, so this hook returning the wrong thing for a moment
// during load can never let a write through it shouldn't.
export function useAdminRole(): { role: AdminRole; loading: boolean } {
  const [role, setRole] = useState<AdminRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!session || session.user.is_anonymous) {
        setRole(null);
        setLoading(false);
        return;
      }
      const { data } = await supabase.rpc("my_admin_role");
      if (cancelled) return;
      setRole((data as AdminRole) ?? null);
      setLoading(false);
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

  return { role, loading };
}
