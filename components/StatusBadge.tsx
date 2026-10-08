import type { ItemStatus } from "@/lib/types";

// Same outline-badge convention as Cereza's "Nuevo"/estado badges
// (border/10-bg/text all the same semantic color, no filled background).
const LABELS: Record<ItemStatus, string> = {
  for_sale: "En venta",
  reserved: "Apartado",
  sold: "Vendido",
};

const COLORS: Record<ItemStatus, string> = {
  for_sale: "border-positive/30 bg-positive/10 text-positive",
  // Filled gold, not an outline like the rest: an article someone has
  // already set aside should catch the eye of the next buyer.
  reserved: "border-yellow bg-yellow text-ink",
  sold: "border-line-strong bg-page text-ink-faint",
};

export default function StatusBadge({ status, compact = false }: { status: ItemStatus; compact?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border font-bold ${
        compact ? "px-2 py-px text-[11px] leading-5 tracking-wide uppercase" : "px-2.5 py-0.5 text-xs"
      } ${COLORS[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
