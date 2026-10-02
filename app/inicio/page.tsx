import Link from "next/link";

// Placeholder for the welcome page, still to be designed. The root route
// (/) keeps redirecting to the catalog on purpose — that's where buyers
// land — so this lives at its own path and the drawer's "Inicio" points
// here.
export default function InicioPage() {
  return (
    <div className="min-h-screen bg-white">
      <h1 className="px-3.5 pt-4 text-lg font-bold text-ink">Inicio</h1>
      <div className="px-3.5 py-6">
        <p className="text-sm text-ink-soft">Página de bienvenida: próximamente.</p>
        <Link href="/items" className="mt-3 inline-block text-sm font-medium text-ink underline">
          Ver el catálogo →
        </Link>
      </div>
    </div>
  );
}
