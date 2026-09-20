import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Ported from reference/cereza/lib/supabase/client.ts — same memoized-
// singleton shape, for the same reason: a fresh client instance on
// every call would make `supabase` an unstable useEffect/useCallback
// dependency, causing a fetch -> setState -> re-render -> new client ->
// re-fetch loop the moment a list screen depends on it.
//
// Deliberately plain @supabase/supabase-js, NOT @supabase/ssr's
// createBrowserClient — this app has zero server-side auth usage (every
// screen is "use client", no middleware, nothing ever reads a session
// from a cookie server-side), so there's no reason to be on it, and it
// actively broke real magic-link logins: createBrowserClient hardcodes
// flowType: "pkce" (confirmed in its source — applied after spreading
// caller options, so it can't be overridden), which requires the SAME
// browser/cookie-jar that requested the link to also complete it. Real
// email clients routinely violate that (Mail apps commonly open links
// in a different in-app browser/webview than wherever "Enviar enlace"
// was tapped) — found live, a real magic-link click landing back on the
// app still anonymous. The plain client defaults to implicit flow,
// where the session travels self-contained in the link's own hash
// fragment, so it works regardless of which browser context opens it.
function makeClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

let client: ReturnType<typeof makeClient> | undefined;

export function createClient() {
  if (!client) client = makeClient();
  return client;
}
