"use client";

import { formatCurrency } from "@/lib/currency";
import { lineTotal, orderDiscountOf, orderTotals, round2, totalPaid } from "@/lib/sales/orders";
import { FORMA_DE_PAGO_LABELS, PAYMENT_METHOD_OPTIONS } from "@/lib/sales/status";
import type { ItemSale, OrderPayment, SaleOrder } from "@/lib/sales/types";
import { formatDate } from "./shared";

// Closed orders only — an open cart is still being put together, so it
// isn't revenue yet. Pure aggregation over what VentasScreen already
// loaded.
export default function ResumenView({
  orders,
  linesByOrder,
  paymentsByOrder,
  onOpenOrder,
}: {
  orders: SaleOrder[];
  linesByOrder: Map<string, ItemSale[]>;
  paymentsByOrder: Map<string, OrderPayment[]>;
  onOpenOrder: (orderId: string) => void;
}) {
  const openCount = orders.filter((o) => o.status === "open").length;

  const rows = orders
    .filter((o) => o.status === "closed")
    .map((order) => {
      const lines = linesByOrder.get(order.id) ?? [];
      const payments = paymentsByOrder.get(order.id) ?? [];
      const { total } = orderTotals(lines.map(lineTotal), order.requires_invoice, orderDiscountOf(order));
      const paid = totalPaid(payments);
      return {
        order,
        total,
        paid,
        saldo: Math.max(0, round2(total - paid)),
        articles: lines.length,
        pieces: lines.reduce((n, l) => n + l.quantity, 0),
        payments,
      };
    })
    .sort((a, b) => (b.order.closed_at ?? "").localeCompare(a.order.closed_at ?? ""));

  const totalVendido = round2(rows.reduce((s, r) => s + r.total, 0));
  const totalCobrado = round2(rows.reduce((s, r) => s + r.paid, 0));
  const saldoPendiente = round2(rows.reduce((s, r) => s + r.saldo, 0));

  const byMethod = new Map<string, number>();
  for (const r of rows) for (const p of r.payments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount);

  return (
    <div className="px-3.5 py-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-md border border-line bg-card p-3">
          <p className="text-xs text-ink-soft">Total vendido</p>
          <p className="text-lg font-bold text-ink">{formatCurrency(totalVendido)}</p>
        </div>
        <div className="rounded-md border border-line bg-card p-3">
          <p className="text-xs text-ink-soft">Total cobrado</p>
          <p className="text-lg font-bold text-ink">{formatCurrency(totalCobrado)}</p>
        </div>
        <div className="rounded-md border border-line bg-card p-3">
          <p className="text-xs text-ink-soft">Saldo pendiente</p>
          <p className={`text-lg font-bold ${saldoPendiente > 0 ? "text-negative" : "text-ink"}`}>{formatCurrency(saldoPendiente)}</p>
        </div>
        <div className="rounded-md border border-line bg-card p-3">
          <p className="text-xs text-ink-soft">Pedidos cerrados</p>
          <p className="text-lg font-bold text-ink">{rows.length}</p>
        </div>
      </div>
      {openCount > 0 && (
        <p className="mt-2 text-xs text-ink-soft">
          {openCount} {openCount === 1 ? "carrito abierto" : "carritos abiertos"} sin cerrar (no incluidos arriba).
        </p>
      )}

      {byMethod.size > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {PAYMENT_METHOD_OPTIONS.map((o) =>
            byMethod.has(o.value) ? (
              <span key={o.value} className="rounded-full border border-line-strong bg-card px-3 py-1 text-xs text-ink-soft">
                {o.label}: <span className="font-semibold text-ink">{formatCurrency(byMethod.get(o.value)!)}</span>
              </span>
            ) : null,
          )}
        </div>
      )}

      <div className="mt-4 space-y-1.5">
        {rows.map(({ order, total, saldo, articles, pieces }) => (
          <button
            key={order.id}
            type="button"
            onClick={() => onOpenOrder(order.id)}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-line bg-card px-3 py-2.5 text-left"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{order.name}</p>
              <p className="truncate text-xs text-ink-soft">
                {formatDate(order.closed_at)} · {articles} {articles === 1 ? "artículo" : "artículos"} · {pieces} pzas
              </p>
              <p className="truncate text-xs text-ink-soft">
                Forma de pago: {order.payment_method ? FORMA_DE_PAGO_LABELS[order.payment_method] : "—"}
                {order.requires_invoice && " · Con factura"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold text-ink">{formatCurrency(total)}</p>
              <p className={`text-xs ${saldo > 0 ? "text-negative" : "text-positive"}`}>{saldo > 0 ? `Saldo ${formatCurrency(saldo)}` : "Pagado"}</p>
            </div>
          </button>
        ))}
        {rows.length === 0 && <p className="p-4 text-sm text-ink-soft">Todavía no hay pedidos cerrados.</p>}
      </div>
    </div>
  );
}
