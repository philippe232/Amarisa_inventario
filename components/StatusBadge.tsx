import { Flame } from "lucide-react";
import type { ItemStatus } from "@/lib/types";

// Same outline-badge convention as Cereza's "Nuevo"/estado badges
// (border/10-bg/text all the same semantic color, no filled background).
const LABELS: Record<ItemStatus, string> = {
  for_sale: "En venta",
  // What a buyer reads on an article that already has an offer on it
  // (items.status "reserved"): somebody wants it, but it's still in play.
  reserved: "Ya ofertaron",
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
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-bold ${
        compact ? "px-2 py-px text-[11px] leading-5 tracking-wide uppercase" : "px-2.5 py-0.5 text-xs"
      } ${COLORS[status]}`}
    >
      {status === "reserved" && (
        <Flame className={`${compact ? "h-3 w-3" : "h-3.5 w-3.5"} shrink-0 fill-red-700 text-red-700`} aria-hidden="true" />
      )}
      {LABELS[status]}
    </span>
  );
}
