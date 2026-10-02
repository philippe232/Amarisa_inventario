import VentasScreen from "./ventas-screen";

// Entirely client-fetched (Supabase, session-gated) — same reasoning as
// items/page.tsx, revision/page.tsx and match-compras/page.tsx:
// force-dynamic skips static generation, which a build-time
// createBrowserClient() call can't survive.
export const dynamic = "force-dynamic";

export default function VentasPage() {
  return (
    <div className="min-h-screen bg-white">
      <VentasScreen />
    </div>
  );
}
