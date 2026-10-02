import type { Item } from "@/lib/types";
import type { OrderStatus, PaymentMethod } from "@/lib/sales/types";

export type QueueItem = Pick<Item, "id" | "name" | "brand" | "model" | "area" | "quantity" | "ref_code" | "status" | "asking_price"> & {
  photoUrl: string | null;
};

export type PaymentInput = { amount: number; method: PaymentMethod; paid_at: string; note: string | null };

export function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" });
}

const ORDER_LABELS: Record<OrderStatus, string> = { open: "Abierto", closed: "Cerrado" };
const ORDER_COLORS: Record<OrderStatus, string> = {
  open: "border-positive/30 bg-positive/10 text-positive",
  closed: "border-line-strong bg-page text-ink-faint",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${ORDER_COLORS[status]}`}>
      {ORDER_LABELS[status]}
    </span>
  );
}
