import type { Item } from "@/lib/types";
import { round2 } from "@/lib/sales/orders";
import type { OrderStatus, PaymentMethod } from "@/lib/sales/types";

export type QueueItem = Pick<Item, "id" | "name" | "brand" | "model" | "area" | "quantity" | "ref_code" | "status" | "asking_price"> & {
  photoUrl: string | null;
  // Every photo, in order (photoUrl is the first), for the full-size viewer.
  photoUrls: string[];
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

// A buyer's "Mi lista", as returned to the owner by owner_wishlists()
// (db/migrations/0037): one row per listed article.
export type WishRow = {
  user_id: string;
  email: string | null;
  is_anonymous: boolean;
  item_id: string;
  quantity: number;
  bid_amount: number | string | null;
  created_at: string;
};

export type BuyerList = {
  key: string;
  email: string | null;
  anonymous: boolean;
  // bid is the offer per piece; quantity is how many the buyer asked for.
  items: { itemId: string; quantity: number; bid: number | null; addedAt: string }[];
  lastAt: string;
};

export function listLabel(list: Pick<BuyerList, "email" | "key">): string {
  return list.email ?? `Anónimo · ${list.key.slice(0, 4)}`;
}

// Lists with a linked email first (the ones the owner can actually reach),
// each group most recently touched first.
export function buildBuyerLists(rows: WishRow[]): BuyerList[] {
  const byUser = new Map<string, BuyerList>();
  for (const r of rows) {
    let list = byUser.get(r.user_id);
    if (!list) {
      list = { key: r.user_id, email: r.email, anonymous: r.is_anonymous || !r.email, items: [], lastAt: r.created_at };
      byUser.set(r.user_id, list);
    }
    list.items.push({ itemId: r.item_id, quantity: r.quantity ?? 1, bid: r.bid_amount == null ? null : Number(r.bid_amount), addedAt: r.created_at });
    if (r.created_at > list.lastAt) list.lastAt = r.created_at;
  }
  return [...byUser.values()].sort((a, b) => Number(a.anonymous) - Number(b.anonymous) || b.lastAt.localeCompare(a.lastAt));
}

// What a buyer's list comes to: each article's units (as many as they
// asked for, capped at what's still free) at their offer per piece or the
// list price. Shared by the list row's chip and the list's own panel so
// the two can never disagree.
export function listTotals(
  list: BuyerList,
  itemsById: Map<string, QueueItem>,
  reservedByItem: Map<string, number>,
): { total: number; pieces: number } {
  let total = 0;
  let pieces = 0;
  for (const entry of list.items) {
    const item = itemsById.get(entry.itemId);
    if (!item) continue;
    const available = item.quantity - (reservedByItem.get(entry.itemId) ?? 0);
    const units = Math.max(0, Math.min(entry.quantity, available));
    if (units < 1) continue;
    total += (entry.bid ?? item.asking_price ?? 0) * units;
    pieces += units;
  }
  return { total: round2(total), pieces };
}
