"use client";

import { useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { getDisplayName } from "@/lib/items";
import { lineTotal, reservedQty, soldQty } from "@/lib/sales/orders";
import type { ItemSale, SaleOrder } from "@/lib/sales/types";
import StatusBadge from "@/components/StatusBadge";
import { OrderStatusBadge, type QueueItem } from "./shared";

const NEW_CART = "__new__";

export type AddTarget = { orderId: string } | { newName: string };

// One article: how many units are left, where the rest went, and the
// control that puts units into a cart.
export default function ItemPanel({
  item,
  lines,
  ordersById,
  openOrders,
  activeOrderId,
  onBack,
  onAdd,
  onOpenOrder,
}: {
  item: QueueItem;
  lines: ItemSale[];
  ordersById: Map<string, SaleOrder>;
  openOrders: SaleOrder[];
  activeOrderId: string | null;
  onBack: () => void;
  onAdd: (target: AddTarget, qty: number) => Promise<boolean>;
  onOpenOrder: (orderId: string) => void;
}) {
  const reserved = reservedQty(lines);
  const sold = soldQty(lines, ordersById);
  const inCarts = reserved - sold;
  const available = item.quantity - reserved;

  // Which cart the units go to: null = follow the default (the cart
  // being worked on, else the newest open one, else a new cart).
  const [targetPick, setTargetPick] = useState<string | null>(null);
  const defaultTarget =
    activeOrderId && openOrders.some((o) => o.id === activeOrderId) ? activeOrderId : (openOrders[0]?.id ?? NEW_CART);
  const target = targetPick && (targetPick === NEW_CART || openOrders.some((o) => o.id === targetPick)) ? targetPick : defaultTarget;
  const [newName, setNewName] = useState("");
  const [qty, setQty] = useState("1");
  const [adding, setAdding] = useState(false);

  const qtyNumber = Math.floor(Number(qty)) || 0;
  const qtyValid = qtyNumber >= 1 && qtyNumber <= available;
  const nameValid = target !== NEW_CART || newName.trim().length > 0;

  return (
    <div className="space-y-4 pb-6">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-ink-soft md:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
      </button>

      <div className="flex items-start gap-3">
        {item.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-md border border-line object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink">{getDisplayName(item)}</p>
          <p className="text-sm text-ink-soft">
            {item.area ?? "—"} · Cant. {item.quantity} {item.ref_code && <>· {item.ref_code}</>}
          </p>
          <p className="mt-0.5 text-xs text-ink-soft">
            Precio de lista: {item.asking_price != null ? formatCurrency(item.asking_price) : "—"}
          </p>
        </div>
        <StatusBadge status={item.status} />
      </div>

      <div className="rounded-md border border-line bg-card p-3 text-sm text-ink">
        <p>
          <span className="font-semibold">Disponibles {Math.max(0, available)}</span> de {item.quantity}
        </p>
        {(inCarts > 0 || sold > 0) && (
          <p className="mt-0.5 text-xs text-ink-soft">
            {inCarts > 0 && <>En carritos abiertos: {inCarts}</>}
            {inCarts > 0 && sold > 0 && " · "}
            {sold > 0 && <>Vendidas: {sold}</>}
          </p>
        )}
      </div>

      <div className="space-y-3 rounded-md border border-line bg-card p-3">
        <p className="text-sm font-semibold text-ink">Agregar al carrito</p>
        {available <= 0 ? (
          <p className="text-sm text-ink-soft">No quedan unidades disponibles.</p>
        ) : (
          <>
            <label className="block">
              <span className="text-xs font-medium text-ink-soft">Carrito</span>
              <select
                value={target}
                onChange={(e) => setTargetPick(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-line-strong bg-card px-2 text-sm text-ink"
              >
                {openOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
                <option value={NEW_CART}>+ Nuevo carrito…</option>
              </select>
            </label>
            {target === NEW_CART && (
              <label className="block">
                <span className="text-xs font-medium text-ink-soft">Nombre del carrito (comprador)</span>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej. Ana López"
                  className="mt-1 h-10 w-full rounded-md border border-line-strong px-2 text-sm text-ink"
                />
              </label>
            )}
            <label className="block">
              <span className="text-xs font-medium text-ink-soft">Unidades (de {available} disponibles)</span>
              <input
                type="number"
                min={1}
                max={available}
                step={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-line-strong px-2 text-sm text-ink"
              />
              {!qtyValid && <span className="mt-1 block text-xs text-negative">Debe ser entre 1 y {available}.</span>}
            </label>
            <button
              type="button"
              disabled={adding || !qtyValid || !nameValid}
              onClick={async () => {
                setAdding(true);
                const ok = await onAdd(target === NEW_CART ? { newName: newName.trim() } : { orderId: target }, qtyNumber);
                setAdding(false);
                if (ok) {
                  setQty("1");
                  setNewName("");
                  setTargetPick(null);
                }
              }}
              className="flex min-h-10 items-center gap-1.5 rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Agregar al carrito
            </button>
          </>
        )}
      </div>

      {lines.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-ink">En pedidos</p>
          {lines.map((line) => {
            const order = line.order_id ? ordersById.get(line.order_id) : null;
            const content = (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{order?.name ?? "Venta anterior"}</p>
                  <p className="text-xs text-ink-soft">
                    {line.quantity} {line.quantity === 1 ? "unidad" : "unidades"} · {formatCurrency(lineTotal(line))}
                  </p>
                </div>
                {order && <OrderStatusBadge status={order.status} />}
              </>
            );
            return order ? (
              <button
                key={line.id}
                type="button"
                onClick={() => onOpenOrder(order.id)}
                className="flex w-full items-center gap-2 rounded-md border border-line bg-card px-3 py-2 text-left"
              >
                {content}
              </button>
            ) : (
              <div key={line.id} className="flex w-full items-center gap-2 rounded-md border border-line bg-card px-3 py-2">
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
