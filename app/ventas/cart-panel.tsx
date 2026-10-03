"use client";

import { useCallback, useState } from "react";
import { ArrowLeft, FileDown, Plus, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import { getDisplayName } from "@/lib/items";
import { lineTotal, orderTotals, round2, totalPaid as sumPaid, type OrderDiscount } from "@/lib/sales/orders";
import { downloadOrderPdf } from "@/lib/sales/pdf";
import { FORMA_DE_PAGO_OPTIONS, PAYMENT_METHOD_LABELS, PAYMENT_METHOD_OPTIONS } from "@/lib/sales/status";
import type { FormaDePago, ItemSale, OrderPayment, PaymentMethod, SaleOrder } from "@/lib/sales/types";
import MoneyInput from "@/components/MoneyInput";
import PhotoLightbox from "@/components/PhotoLightbox";
import { OrderStatusBadge, PhotoThumb, formatDate, type PaymentInput, type QueueItem } from "./shared";

// What the three linked inputs of a line hold while being typed, as
// strings so "12." or an empty field survive mid-edit. Persisted (and
// dropped) when the field loses focus.
type Draft = { qty: string; unit: string; total: string };
export type LinePatch = Pick<ItemSale, "quantity" | "final_price" | "line_total">;

const num = (n: number) => String(round2(n));
const inputClass = "mt-1 h-9 w-full rounded-md border border-line-strong px-2 text-sm text-ink disabled:bg-page disabled:text-ink-soft";

export default function CartPanel({
  order,
  lines,
  itemsById,
  reservedByItem,
  payments,
  onBack,
  onUpdateOrder,
  onUpdateLine,
  onRemoveLine,
  onAddArticles,
  onAddPayment,
  onDeletePayment,
  onSetClosed,
  onDelete,
}: {
  order: SaleOrder;
  lines: ItemSale[];
  itemsById: Map<string, QueueItem>;
  // Units of each item spoken for by every order (this one included) —
  // a line can grow only into what's left.
  reservedByItem: Map<string, number>;
  payments: OrderPayment[];
  onBack: () => void;
  onUpdateOrder: (
    patch: Partial<Pick<SaleOrder, "name" | "buyer_contact" | "notes" | "requires_invoice" | "payment_method" | "discount_type" | "discount_value">>,
  ) => Promise<void>;
  onUpdateLine: (lineId: string, patch: LinePatch) => Promise<void>;
  onRemoveLine: (lineId: string) => Promise<void>;
  onAddArticles: () => void;
  onAddPayment: (p: PaymentInput) => Promise<void>;
  onDeletePayment: (paymentId: string) => Promise<void>;
  onSetClosed: (closed: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const closed = order.status === "closed";

  const [name, setName] = useState(order.name);
  const [contact, setContact] = useState(order.buyer_contact ?? "");
  const [notes, setNotes] = useState(order.notes ?? "");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [closing, setClosing] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: string[]; name: string } | null>(null);
  const closeLightbox = useCallback(() => setLightbox(null), []);
  // The discount being typed; saved when the field loses focus (or the %/$
  // switch is flipped), but it drives the totals as soon as it changes.
  const [discType, setDiscType] = useState<"percent" | "amount">(order.discount_type ?? "percent");
  const [discText, setDiscText] = useState(order.discount_value != null ? String(order.discount_value) : "");

  const [payAmount, setPayAmount] = useState("");
  // null = follow the order's forma de pago until a payment says otherwise
  // ("Por Pagar" isn't a way of paying, so it falls back to Efectivo).
  const [payMethodPick, setPayMethodPick] = useState<PaymentMethod | null>(null);
  const payMethod: PaymentMethod = payMethodPick ?? (order.payment_method && order.payment_method !== "por_pagar" ? order.payment_method : "efectivo");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payNote, setPayNote] = useState("");
  const [addingPayment, setAddingPayment] = useState(false);

  function draftFor(line: ItemSale): Draft {
    return drafts[line.id] ?? { qty: String(line.quantity), unit: num(line.final_price), total: num(lineTotal(line)) };
  }
  function setDraft(line: ItemSale, next: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [line.id]: { ...draftFor(line), ...next } }));
  }

  // The three fields move together: price per unit and total are two
  // views of the same amount, and changing the units keeps the price per
  // unit and re-prices the total.
  function changeQty(line: ItemSale, v: string) {
    const d = draftFor(line);
    const q = Number(v);
    setDraft(line, { qty: v, total: q > 0 ? num((Number(d.unit) || 0) * q) : d.total });
  }
  function changeUnit(line: ItemSale, v: string) {
    setDraft(line, { unit: v, total: num((Number(v) || 0) * (Number(draftFor(line).qty) || 0)) });
  }
  function changeTotal(line: ItemSale, v: string) {
    const d = draftFor(line);
    const q = Number(d.qty) || 0;
    setDraft(line, { total: v, unit: q > 0 ? num((Number(v) || 0) / q) : d.unit });
  }

  async function commitLine(line: ItemSale, max: number) {
    const d = drafts[line.id];
    if (!d) return;
    setDrafts((all) => Object.fromEntries(Object.entries(all).filter(([id]) => id !== line.id)));
    const qty = Math.floor(Number(d.qty));
    const unit = round2(Number(d.unit));
    const total = round2(Number(d.total));
    // Out-of-range values aren't saved; dropping the draft snaps the
    // fields back to what is.
    if (!(qty >= 1 && qty <= max) || !(unit >= 0) || !(total >= 0)) return;
    if (qty === line.quantity && unit === line.final_price && total === lineTotal(line)) return;
    await onUpdateLine(line.id, { quantity: qty, final_price: unit, line_total: total });
  }

  // A percentage tops out at 100; empty or zero means no discount.
  function commitDiscount(type: "percent" | "amount", text: string) {
    const typed = Number(text);
    const value = typed > 0 ? round2(type === "percent" ? Math.min(typed, 100) : typed) : null;
    setDiscText(value == null ? "" : String(value));
    const next = value == null ? { discount_type: null, discount_value: null } : { discount_type: type, discount_value: value };
    if (next.discount_type === order.discount_type && next.discount_value === order.discount_value) return;
    void onUpdateOrder(next);
  }

  // Downloads this cart as a PDF — what's saved (a field still being
  // typed in is saved when the button takes focus).
  async function handlePdf() {
    setPdfBusy(true);
    setPdfError(null);
    try {
      await downloadOrderPdf(
        order,
        lines.map((l) => {
          const item = itemsById.get(l.item_id);
          return { name: item ? getDisplayName(item) : "Artículo", ref: item?.ref_code ?? null, qty: l.quantity, unit: l.final_price, total: lineTotal(l) };
        }),
        payments,
      );
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "No se pudo generar el PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  const effectiveTotal = (line: ItemSale) => (drafts[line.id] ? Number(drafts[line.id].total) || 0 : lineTotal(line));
  const discountDraft: OrderDiscount = Number(discText) > 0 ? { type: discType, value: Number(discText) } : null;
  const { subtotal, discount, iva, total } = orderTotals(lines.map(effectiveTotal), order.requires_invoice, discountDraft);
  const paid = sumPaid(payments);
  const saldo = Math.max(0, round2(total - paid));
  const pieces = lines.reduce((n, l) => n + (Number(drafts[l.id]?.qty) || l.quantity), 0);

  return (
    <div className="space-y-4 pb-6">
      {lightbox && <PhotoLightbox photos={lightbox.photos} alt={lightbox.name} onClose={closeLightbox} />}
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-ink-soft md:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver
      </button>

      <div className="space-y-3 rounded-md border border-line bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">Carrito</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePdf}
              disabled={pdfBusy || lines.length === 0}
              title="Descargar este carrito como PDF"
              className="flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-card px-2.5 text-xs font-semibold text-ink disabled:opacity-50"
            >
              <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
              {pdfBusy ? "Generando..." : "PDF"}
            </button>
            <OrderStatusBadge status={order.status} />
          </div>
        </div>
        {pdfError && <p className="text-xs text-negative">{pdfError}</p>}
        <label className="block">
          <span className="text-xs font-medium text-ink-soft">Nombre (comprador)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const trimmed = name.trim();
              if (!trimmed) setName(order.name);
              else if (trimmed !== order.name) void onUpdateOrder({ name: trimmed });
            }}
            className={inputClass}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-ink-soft">Contacto</span>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              onBlur={() => contact.trim() !== (order.buyer_contact ?? "") && void onUpdateOrder({ buyer_contact: contact.trim() || null })}
              placeholder="Teléfono, WhatsApp, correo..."
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-soft">Notas</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes.trim() !== (order.notes ?? "") && void onUpdateOrder({ notes: notes.trim() || null })}
              className={inputClass}
            />
          </label>
        </div>
      </div>

      <div className="space-y-3 rounded-md border border-line bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink">Artículos</p>
          {!closed && (
            <button
              type="button"
              onClick={onAddArticles}
              className="flex min-h-8 items-center gap-1 rounded-md border border-line-strong px-2.5 text-xs font-semibold text-ink"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Agregar artículos
            </button>
          )}
        </div>

        {lines.length === 0 && (
          <p className="text-sm text-ink-soft">
            El carrito está vacío. Usa <span className="font-medium">Agregar artículos</span> para buscar y añadir.
          </p>
        )}

        {lines.map((line) => {
          const item = itemsById.get(line.item_id);
          const max = item ? item.quantity - ((reservedByItem.get(line.item_id) ?? 0) - line.quantity) : line.quantity;
          const d = draftFor(line);
          const qtyBad = !(Number(d.qty) >= 1 && Number(d.qty) <= max);
          return (
            <div key={line.id} className="flex overflow-hidden rounded-md border border-line">
              <PhotoThumb item={item} onOpen={(photos, name) => setLightbox({ photos, name })} />
              <div className="min-w-0 flex-1 space-y-2 p-2.5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{item ? getDisplayName(item) : "Artículo"}</p>
                  <p className="text-xs text-ink-soft">
                    {item?.ref_code && <>{item.ref_code} · </>}
                    Precio de lista: {item?.asking_price != null ? formatCurrency(item.asking_price) : "—"}
                  </p>
                </div>
                {!closed && (
                  <button type="button" onClick={() => onRemoveLine(line.id)} aria-label="Quitar del carrito" className="shrink-0 text-ink-faint">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <label className="block">
                  <span className="text-xs font-medium whitespace-nowrap text-ink-soft">Unidades</span>
                  <input
                    type="number"
                    min={1}
                    max={max}
                    step={1}
                    disabled={closed}
                    value={d.qty}
                    onChange={(e) => changeQty(line, e.target.value)}
                    onBlur={() => commitLine(line, max)}
                    aria-label={`Unidades de ${item?.name ?? "artículo"}`}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium whitespace-nowrap text-ink-soft">Pagado c/u</span>
                  <MoneyInput
                    disabled={closed}
                    value={d.unit}
                    onChange={(v) => changeUnit(line, v)}
                    onBlur={() => commitLine(line, max)}
                    ariaLabel={`Precio pagado por unidad de ${item?.name ?? "artículo"}`}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium whitespace-nowrap text-ink-soft">Total pagado</span>
                  <MoneyInput
                    disabled={closed}
                    value={d.total}
                    onChange={(v) => changeTotal(line, v)}
                    onBlur={() => commitLine(line, max)}
                    ariaLabel={`Total pagado por ${item?.name ?? "artículo"}`}
                    className={inputClass}
                  />
                </label>
              </div>
              {qtyBad && <p className="text-xs text-negative">Unidades: entre 1 y {max}.</p>}
              </div>
            </div>
          );
        })}

        {lines.length > 0 && (
          <div className="flex items-baseline justify-between border-t border-line pt-3">
            <p className="text-sm text-ink-soft">
              Total del carrito · {lines.length} {lines.length === 1 ? "artículo" : "artículos"} · {pieces} {pieces === 1 ? "pieza" : "piezas"}
            </p>
            <p className="text-lg font-bold text-ink">{formatCurrency(subtotal)}</p>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-md border border-line bg-card p-3">
        <p className="text-sm font-semibold text-ink">Cierre y pago</p>

        <label className="block">
          <span className="text-xs font-medium text-ink-soft">Forma de pago</span>
          <select
            value={order.payment_method ?? "efectivo"}
            onChange={(e) => void onUpdateOrder({ payment_method: e.target.value as FormaDePago })}
            className="mt-1 h-10 w-full rounded-md border border-line-strong bg-card px-2 text-sm text-ink"
          >
            {FORMA_DE_PAGO_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <div>
          <span className="text-xs font-medium text-ink-soft">Descuento</span>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex shrink-0 overflow-hidden rounded-md border border-line-strong" role="group" aria-label="Tipo de descuento">
              {(["percent", "amount"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  disabled={closed}
                  aria-pressed={discType === type}
                  onClick={() => {
                    setDiscType(type);
                    commitDiscount(type, discText);
                  }}
                  className={`h-9 w-10 text-sm font-semibold disabled:opacity-60 ${discType === type ? "bg-ink text-white" : "bg-card text-ink"}`}
                >
                  {type === "percent" ? "%" : "$"}
                </button>
              ))}
            </div>
            {discType === "percent" ? (
              <input
                type="number"
                min={0}
                step="0.01"
                disabled={closed}
                value={discText}
                onChange={(e) => setDiscText(e.target.value)}
                onBlur={() => commitDiscount(discType, discText)}
                placeholder="0 %"
                aria-label="Descuento en porcentaje"
                className="h-9 min-w-0 flex-1 rounded-md border border-line-strong px-2 text-sm text-ink disabled:bg-page disabled:text-ink-soft"
              />
            ) : (
              <MoneyInput
                disabled={closed}
                value={discText}
                onChange={setDiscText}
                onBlur={() => commitDiscount(discType, discText)}
                placeholder="$0"
                ariaLabel="Descuento en monto"
                className="h-9 min-w-0 flex-1 rounded-md border border-line-strong px-2 text-sm text-ink disabled:bg-page disabled:text-ink-soft"
              />
            )}
            {discount > 0 && <p className="shrink-0 text-sm font-semibold text-positive">−{formatCurrency(discount)}</p>}
          </div>
          {discType === "amount" && subtotal > 0 && Number(discText) > subtotal && (
            <p className="mt-1 text-xs text-negative">No puede ser mayor al subtotal ({formatCurrency(subtotal)}).</p>
          )}
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={order.requires_invoice}
            disabled={closed}
            onChange={(e) => void onUpdateOrder({ requires_invoice: e.target.checked })}
            className="h-4 w-4"
          />
          <span className="text-sm text-ink">Requiere factura</span>
        </label>
        {order.requires_invoice && (
          <div className="grid grid-cols-2 gap-3 rounded-md border border-line bg-page p-2.5">
            <div>
              <p className="text-xs font-medium text-ink-soft">IVA (16%)</p>
              <p className="text-sm font-semibold text-ink">{formatCurrency(iva)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-ink-soft">Monto + IVA a transferir</p>
              <p className="text-sm font-semibold text-ink">{formatCurrency(total)}</p>
            </div>
          </div>
        )}

        {discount > 0 && (
          <div className="space-y-0.5 text-sm">
            <div className="flex justify-between text-ink-soft">
              <span>Subtotal</span>
              <span className="[font-variant-numeric:tabular-nums]">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-positive">
              <span>Descuento{discType === "percent" ? ` (${Number(discText)}%)` : ""}</span>
              <span className="[font-variant-numeric:tabular-nums]">−{formatCurrency(discount)}</span>
            </div>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-semibold text-ink">Total a pagar</p>
          <p className="text-lg font-bold text-ink">{formatCurrency(total)}</p>
        </div>

        <div className="space-y-2 border-t border-line pt-3">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold text-ink">Pagos</p>
            <p className="text-xs text-ink-soft">
              Pagado {formatCurrency(paid)} de {formatCurrency(total)}
              {saldo > 0 && <> · Saldo {formatCurrency(saldo)}</>}
            </p>
          </div>

          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-sm">
              <div>
                <p className={`font-medium ${p.amount < 0 ? "text-negative" : "text-ink"}`}>
                  {formatCurrency(p.amount)} · {PAYMENT_METHOD_LABELS[p.method]}
                  {p.amount < 0 && " · devolución"}
                </p>
                <p className="text-xs text-ink-soft">
                  {formatDate(p.paid_at)}
                  {p.note && <> · {p.note}</>}
                </p>
              </div>
              <button type="button" onClick={() => onDeletePayment(p.id)} aria-label="Eliminar pago" className="text-ink-faint">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}

          <div className="grid grid-cols-2 gap-2">
            <div className="flex gap-1.5">
              <MoneyInput
                value={payAmount}
                onChange={setPayAmount}
                allowNegative
                placeholder="Monto"
                ariaLabel="Monto del pago"
                className="h-9 w-full min-w-0 rounded-md border border-line-strong px-2 text-sm text-ink"
              />
              <button
                type="button"
                disabled={saldo <= 0}
                onClick={() => setPayAmount(String(saldo))}
                title="Poner el saldo pendiente"
                className="h-9 shrink-0 rounded-md border border-line-strong px-2 text-xs font-medium text-ink disabled:opacity-40"
              >
                Saldo
              </button>
            </div>
            <select
              value={payMethod}
              onChange={(e) => setPayMethodPick(e.target.value as PaymentMethod)}
              className="h-9 w-full rounded-md border border-line-strong bg-card px-2 text-sm text-ink"
            >
              {PAYMENT_METHOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className="h-9 w-full rounded-md border border-line-strong px-2 text-sm text-ink"
            />
            <input
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="Nota (opcional)"
              className="h-9 w-full rounded-md border border-line-strong px-2 text-sm text-ink"
            />
          </div>
          <button
            type="button"
            disabled={addingPayment || !Number.isFinite(Number(payAmount)) || Number(payAmount) === 0}
            onClick={async () => {
              setAddingPayment(true);
              await onAddPayment({ amount: round2(Number(payAmount)), method: payMethod, paid_at: payDate, note: payNote.trim() || null });
              setPayAmount("");
              setPayNote("");
              setAddingPayment(false);
            }}
            className="flex min-h-9 items-center gap-1.5 rounded-md border border-line-strong px-3 text-sm font-medium text-ink disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Agregar pago
          </button>
          <p className="text-xs text-ink-faint">Un monto negativo registra una devolución.</p>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {closed ? (
            <>
              <p className="flex min-h-10 items-center text-sm text-ink-soft">Pedido cerrado el {formatDate(order.closed_at)}.</p>
              <button
                type="button"
                disabled={closing}
                onClick={async () => {
                  setClosing(true);
                  await onSetClosed(false);
                  setClosing(false);
                }}
                className="flex min-h-10 items-center rounded-md border border-line-strong px-3 text-sm font-semibold text-ink"
              >
                Reabrir pedido
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={closing || lines.length === 0}
              onClick={async () => {
                setClosing(true);
                await onSetClosed(true);
                setClosing(false);
              }}
              className="flex min-h-10 items-center rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Cerrar pedido
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`¿Eliminar el carrito de ${order.name}? Se quitan sus artículos y pagos.`)) void onDelete();
            }}
            className="flex min-h-10 items-center rounded-md border border-negative/30 bg-negative/5 px-3 text-sm font-semibold text-negative"
          >
            Eliminar carrito
          </button>
        </div>
      </div>
    </div>
  );
}
