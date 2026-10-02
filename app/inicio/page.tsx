import Link from "next/link";
import { BadgePercent, Filter, Heart } from "lucide-react";

// Welcome page. The root route (/) still redirects to the catalog on
// purpose — that's where buyers land — so this lives at its own path and
// the drawer's "Inicio" points here.
const TIPS = [
  {
    icon: Filter,
    text: "Utiliza la barra de búsqueda y los filtros para explorar por producto, área o tipo, y ordena por precio.",
  },
  {
    icon: Heart,
    text: "¿Algo te late? Guárdalo en tu lista — así no lo pierdes de vista.",
  },
  {
    icon: BadgePercent,
    text: "Los precios son negociables. Si te interesan varios artículos, pregúntanos por descuento extra o algo de pilón.",
  },
];

export default function InicioPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-xl px-3.5 py-6">
        <h2 className="text-2xl font-bold text-ink">Gracias por pasar por aquí 👋</h2>
        <p className="mt-2 text-base text-ink-soft">
          Estamos cerrando Amarisa Café y estamos vendiendo todo: equipo, muebles, vajilla y más.
        </p>

        <ul className="mt-6 space-y-4">
          {TIPS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-card text-ink">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="pt-2 text-[15px] text-ink">{text}</p>
            </li>
          ))}
        </ul>

        <Link
          href="/items"
          className="mt-8 flex h-12 w-full items-center justify-center rounded-md bg-ink text-sm font-semibold text-white"
        >
          Ver el catálogo
        </Link>
      </div>
    </div>
  );
}
