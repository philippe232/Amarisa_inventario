"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { getDisplayName } from "@/lib/items";
import type { SaleOrder } from "@/lib/sales/types";
import { formatDate, listLabel, type BuyerList, type QueueItem } from "./shared";

// A buyer's own list shown as a cart: each article they saved, at their
// offer (or the list price), with what's still available. "Convertir en
// carrito" makes it a real cart to edit and close out.
export default function BuyerListPanel({
  list,
  itemsById,
  reservedByItem,
  existingOrder,
  onBack,
  onConvert,
  onOpenOrder,
}: {
  list: BuyerList;
  itemsById: Map<string, QueueItem>;
  reservedByItem: Map<string, number>;
  // An open cart already made from this buyer's email, if any.
  existingOrder: SaleOrder | null;
  onBack: () => void;
  onConvert: () => Promise<void>;
  onOpenOrder: (orderId: string) => void;
}) {
  const [converting, setConverting] = useState(false);

  const rows = list.items.map((entry) => {
    const item = itemsById.get(entry.itemId);
    const available = item ? item.quantity - (reservedByItem.get(entry.itemId) ?? 0) : 0;
    const price = entry.bid ?? item?.asking_price ?? 0;
    return { entry, item, available, price };
  });
  const addable = rows.filter((r) => r.item && r.available >= 1);
  const total = addable.reduce((s, r) => s + r.price, 0);

  return (
    <div className="space-y-4 pb-6">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-ink-soft md:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
      </button>

      <div className="rounded-md border border-line bg-card p-3">
        <p className="text-sm font-semibold break-all text-ink">{listLabel(list)}</p>
        <p className="mt-0.5 text-xs text-ink-soft">
          Lista de comprador · {list.items.length} {list.items.length === 1 ? "artículo" : "artículos"} · última actividad{" "}
          {formatDate(list.lastAt)}
          {list.anonymous && " · sin email"}
        </p>
      </div>

      <div className="space-y-2 rounded-md border border-line bg-card p-3">
        <p className="text-sm font-semibold text-ink">Artículos de su lista</p>
        {rows.map(({ entry, item, available, price }) => (
          <div key={entry.itemId} className="flex items-start justify-between gap-3 rounded-md border border-line p-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{item ? getDisplayName(item) : "Artículo"}</p>
              <p className="text-xs text-ink-soft">
                {item?.ref_code && <>{item.ref_code} · </>}
                Precio de lista: {item?.asking_price != null ? formatCurrency(item.asking_price) : "—"}
                {entry.bid != null && <> · Oferta: <span className="font-medium text-ink">{formatCurrency(entry.bid)}</span></>}
              </p>
              <p className={`text-xs ${available >= 1 ? "text-ink-soft" : "font-medium text-red-800"}`}>
                {available >= 1 ? `Disponibles: ${available}` : "Sin unidades disponibles"}
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold text-ink">{formatCurrency(price)}</p>
          </div>
        ))}
        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <p className="text-sm text-ink-soft">
            Total · 1 unidad de {addable.length} {addable.length === 1 ? "artículo disponible" : "artículos disponibles"}
          </p>
          <p className="text-lg font-bold text-ink">{formatCurrency(total)}</p>
        </div>
      </div>

      {existingOrder ? (
        <div className="space-y-2">
          <p className="text-sm text-ink-soft">Ya hay un carrito abierto con este email.</p>
          <button
            type="button"
            onClick={() => onOpenOrder(existingOrder.id)}
            className="flex min-h-10 items-center rounded-md border border-line-strong bg-card px-4 text-sm font-semibold text-ink"
          >
            Abrir su carrito
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            disabled={converting || addable.length === 0}
            onClick={async () => {
              setConverting(true);
              await onConvert();
              setConverting(false);
            }}
            className="flex min-h-10 items-center rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Convertir en carrito
          </button>
          <p className="text-xs text-ink-soft">
            Crea un carrito con 1 unidad de cada artículo disponible, a su oferta o al precio de lista; después ajustas unidades y precios y lo cierras.
          </p>
        </div>
      )}
    </div>
  );
}
