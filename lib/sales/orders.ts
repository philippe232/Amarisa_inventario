import type { ItemStatus } from "@/lib/types";
import type { ItemSale, OrderPayment, SaleOrder } from "@/lib/sales/types";

export const IVA_RATE = 0.16;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// What a cart line cost in total. line_total is the exact amount typed;
// rows from before orders existed only have price * units.
export function lineTotal(line: Pick<ItemSale, "final_price" | "quantity" | "line_total">): number {
  return line.line_total ?? round2(line.final_price * line.quantity);
}

// A discount on an order's total: a percentage, or a fixed amount.
export type OrderDiscount = { type: "percent" | "amount"; value: number } | null;

export function orderDiscountOf(order: Pick<SaleOrder, "discount_type" | "discount_value">): OrderDiscount {
  return order.discount_type && order.discount_value != null ? { type: order.discount_type, value: order.discount_value } : null;
}

// How much comes off the subtotal — never negative, never more than the
// subtotal itself (a percentage over 100 counts as 100).
export function discountAmount(subtotal: number, discount: OrderDiscount): number {
  if (!discount || !(discount.value > 0)) return 0;
  const raw = discount.type === "percent" ? round2((subtotal * Math.min(discount.value, 100)) / 100) : discount.value;
  return round2(Math.min(Math.max(raw, 0), subtotal));
}

// An order's money: the lines' totals, less any discount, plus IVA on top
// when the buyer needs a factura. IVA is worked out once, on the
// discounted subtotal (what's actually invoiced), not summed from
// per-line roundings.
export function orderTotals(
  lineTotals: number[],
  requiresInvoice: boolean,
  discount: OrderDiscount = null,
): { subtotal: number; discount: number; base: number; iva: number; total: number } {
  const subtotal = round2(lineTotals.reduce((s, t) => s + t, 0));
  const off = discountAmount(subtotal, discount);
  const base = round2(subtotal - off);
  const iva = requiresInvoice ? round2(base * IVA_RATE) : 0;
  return { subtotal, discount: off, base, iva, total: round2(base + iva) };
}

export function totalPaid(payments: Pick<OrderPayment, "amount">[]): number {
  return round2(payments.reduce((s, p) => s + p.amount, 0));
}

// Units of an item spoken for by ANY order, open or closed — what
// "available" is measured against, so the same unit can't go into two
// carts. Lines from before orders existed count too.
export function reservedQty(lines: Pick<ItemSale, "quantity">[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0);
}

// Units actually sold: lines of closed orders (or of no order at all —
// the pre-cart sales). A line sitting in an open cart isn't sold yet.
export function soldQty(lines: Pick<ItemSale, "quantity" | "order_id">[], ordersById: Map<string, Pick<SaleOrder, "status">>): number {
  return lines.reduce((n, l) => {
    const order = l.order_id ? ordersById.get(l.order_id) : null;
    return !l.order_id || order?.status === "closed" ? n + l.quantity : n;
  }, 0);
}

// The item's own status (the "Venta" column in revisión, the badge in
// the catalog): sold once every unit is sold, otherwise still for sale —
// a single status can't say "3 of 10 sold", and the rest must stay
// visible in the catalog.
export function itemStatusFor(sold: number, itemQty: number): ItemStatus {
  return sold >= itemQty ? "sold" : "for_sale";
}
