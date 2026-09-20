import type { ItemStatus } from "@/lib/types";

// Same outline-badge convention as Cereza's "Nuevo"/estado badges
// (border/10-bg/text all the same semantic color, no filled background).
const LABELS: Record<ItemStatus, string> = {
  for_sale: "En venta",
  reserved: "Reservado",
  sold: "Vendido",
};

const COLORS: Record<ItemStatus, string> = {
  for_sale: "border-positive/30 bg-positive/10 text-positive",
  reserved: "border-neutral/30 bg-neutral/10 text-neutral",
  sold: "border-line-strong bg-page text-ink-faint",
};

export default function StatusBadge({ status }: { status: ItemStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${COLORS[status]}`}>
      {LABELS[status]}
    </span>
  );
}
