import { createClient } from "@/lib/supabase/client";

// Ensures the current visitor has a real Supabase Auth session, so RLS
// can genuinely scope wishlist_items to auth.uid() — no login form, no
// password, nothing the visitor ever sees or fills in. Requires
// Anonymous Sign-ins enabled on the project (Authentication > Sign In /
// Providers in the Supabase dashboard); throws with that guidance if
// it's off.
//
// forceNew skips the "reuse the existing session" check — for recovering
// from a session whose underlying auth.users row is gone (e.g. deleted
// server-side after the browser cached it), where getSession() still
// returns a locally-valid-looking session object, but any write
// referencing it fails with a foreign-key violation. See callers for the
// retry-on-failure pattern that actually detects this case.
export async function ensureAnonymousSession(forceNew = false): Promise<string> {
  const supabase = createClient();

  if (!forceNew) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) return session.user.id;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    throw new Error(
      error?.message === "Anonymous sign-ins are disabled"
        ? "La lista de intereses necesita que se active \"Anonymous Sign-ins\" en Supabase (Authentication > Sign In / Providers)."
        : (error?.message ?? "No se pudo iniciar sesión."),
    );
  }
  return data.user.id;
}
