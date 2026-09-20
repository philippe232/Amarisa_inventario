import { createClient } from "@/lib/supabase/client";

// Ensures the current visitor has a real Supabase Auth session, so RLS
// can genuinely scope wishlist_items to auth.uid() — no login form, no
// password, nothing the visitor ever sees or fills in. Requires
// Anonymous Sign-ins enabled on the project (Authentication > Sign In /
// Providers in the Supabase dashboard); throws with that guidance if
// it's off.
export async function ensureAnonymousSession(): Promise<string> {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user) return session.user.id;

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
