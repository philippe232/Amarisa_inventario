import RevisionList from "./revision-list";

// Entirely client-fetched (Supabase, session-gated) — same reasoning as
// items/page.tsx: force-dynamic skips static generation, which a build-
// time createBrowserClient() call can't survive.
export const dynamic = "force-dynamic";

export default function RevisionPage() {
  return (
    <div className="min-h-screen bg-white">
      <h1 className="px-3.5 pt-4 text-lg font-bold text-ink">Revisión de Inventario</h1>
      <RevisionList />
    </div>
  );
}
