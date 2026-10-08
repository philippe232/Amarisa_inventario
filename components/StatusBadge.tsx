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
  reserved: "border-neutral/30 bg-neutral/10 text-neutral",
  sold: "border-line-strong bg-page text-ink-faint",
};

export default function StatusBadge({ status, compact = false }: { status: ItemStatus; compact?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border font-bold ${
        compact ? "px-1.5 text-[11px] leading-4" : "px-2.5 py-0.5 text-xs"
      } ${COLORS[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
