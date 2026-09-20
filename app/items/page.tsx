import ItemsList from "./items-list";

// ItemsList is entirely client-fetched (Supabase, no session data at
// build time) — force-dynamic skips static generation for this route,
// which is what a build-time createBrowserClient() call was failing
// against (see items-list.tsx's own history: "Invalid supabaseUrl"
// during prerendering, not at real runtime).
export const dynamic = "force-dynamic";

export default function ItemsPage() {
  return (
    <div className="min-h-screen bg-white">
      <h1 className="px-3.5 pt-4 text-lg font-bold text-ink">Artículos</h1>
      <ItemsList />
    </div>
  );
}
