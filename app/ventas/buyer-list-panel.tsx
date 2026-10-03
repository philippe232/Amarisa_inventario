"use client";

import { useCallback, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { getDisplayName } from "@/lib/items";
import type { SaleOrder } from "@/lib/sales/types";
import PhotoLightbox from "@/components/PhotoLightbox";
import { PhotoThumb, formatDate, listLabel, listTotals, type BuyerList, type QueueItem } from "./shared";

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
  const [lightbox, setLightbox] = useState<{ photos: string[]; name: string } | null>(null);
  const closeLightbox = useCallback(() => setLightbox(null), []);

  const rows = list.items.map((entry) => {
    const item = itemsById.get(entry.itemId);
    const available = item ? item.quantity - (reservedByItem.get(entry.itemId) ?? 0) : 0;
    // Price per piece (their offer, else the list price) x the units they
    // asked for, as many as are still free.
    const price = entry.bid ?? item?.asking_price ?? 0;
    const units = Math.max(0, Math.min(entry.quantity, available));
    return { entry, item, available, price, units };
  });
  const addable = rows.filter((r) => r.item && r.units >= 1);
  const { total, pieces } = listTotals(list, itemsById, reservedByItem);

  return (
    <div className="space-y-4 pb-6">
      {lightbox && <PhotoLightbox photos={lightbox.photos} alt={lightbox.name} onClose={closeLightbox} />}
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
        {rows.map(({ entry, item, available, price, units }) => (
          <div key={entry.itemId} className="flex overflow-hidden rounded-md border border-line">
            <PhotoThumb item={item} onOpen={(photos, name) => setLightbox({ photos, name })} />
            <div className="flex min-w-0 flex-1 items-start gap-3 p-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{item ? getDisplayName(item) : "Artículo"}</p>
              <p className="text-xs text-ink-soft">
                {item?.ref_code && <>{item.ref_code} · </>}
                Precio de lista: {item?.asking_price != null ? formatCurrency(item.asking_price) : "—"}
                {entry.bid != null && <> · Oferta por pieza: <span className="font-medium text-ink">{formatCurrency(entry.bid)}</span></>}
              </p>
              <p className={`text-xs ${available >= entry.quantity ? "text-ink-soft" : "font-medium text-red-800"}`}>
                Pidió {entry.quantity} ·{" "}
                {available < 1
                  ? "sin unidades disponibles"
                  : available < entry.quantity
                    ? `solo hay ${available}, se agregarán ${units}`
                    : `disponibles: ${available}`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold text-ink">{formatCurrency(price * units)}</p>
              {units > 1 && <p className="text-xs text-ink-soft">{units} × {formatCurrency(price)}</p>}
            </div>
            </div>
          </div>
        ))}
        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <p className="text-sm text-ink-soft">
            Total · {pieces} {pieces === 1 ? "pieza" : "piezas"} de {addable.length} {addable.length === 1 ? "artículo" : "artículos"}
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
            Crea un carrito con las unidades que pidió de cada artículo (hasta lo disponible), a su oferta por pieza o al precio de lista; después ajustas unidades y precios y lo cierras.
          </p>
        </div>
      )}
    </div>
  );
}
