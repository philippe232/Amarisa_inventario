import { createBrowserClient } from "@supabase/ssr";

// Ported from reference/cereza/lib/supabase/client.ts — same memoized-
// singleton shape, for the same reason: a fresh createBrowserClient()
// instance on every call would make `supabase` an unstable useEffect/
// useCallback dependency, causing a fetch -> setState -> re-render ->
// new client -> re-fetch loop the moment a list screen depends on it.
function makeClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

let client: ReturnType<typeof makeClient> | undefined;

export function createClient() {
  if (!client) client = makeClient();
  return client;
}
