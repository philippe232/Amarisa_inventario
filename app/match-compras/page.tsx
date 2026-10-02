import MatchComprasScreen from "./match-compras-screen";

// Entirely client-fetched (Supabase, session-gated) — same reasoning as
// items/page.tsx and revision/page.tsx: force-dynamic skips static
// generation, which a build-time createBrowserClient() call can't survive.
export const dynamic = "force-dynamic";

export default function MatchComprasPage() {
  return (
    <div className="min-h-screen bg-white">
      <MatchComprasScreen />
    </div>
  );
}
