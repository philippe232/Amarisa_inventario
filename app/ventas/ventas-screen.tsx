"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSessionInfo } from "@/lib/auth";
import { formatCurrency } from "@/lib/currency";
import { getDisplayName } from "@/lib/items";
import StatusBadge from "@/components/StatusBadge";
import { PAYMENT_METHOD_OPTIONS, PAYMENT_METHOD_LABELS } from "@/lib/sales/status";
import type { ItemSale, ItemSalePayment, PaymentMethod } from "@/lib/sales/types";
import type { Item, ItemStatus } from "@/lib/types";

type QueueItem = Pick<Item, "id" | "name" | "brand" | "model" | "area" | "quantity" | "ref_code" | "status" | "asking_price"> & {
  photoUrl: string | null;
};

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" });
}

// The item's own status IS the sale-progress indicator — no payments
// yet (or no sale record at all) reads as whatever it already was
// (for_sale unless something else reserved it), any payment at all but
// short of the full total is "reserved", paid in full is "sold". One
// computation, always run right after writing a sale or a payment, so
// the queue's status badges never drift from what the payments actually
// say.
function computeItemStatus(totalOwed: number, totalPaid: number): ItemStatus {
  return totalOwed > 0 && totalPaid >= totalOwed ? "sold" : "reserved";
}

export default function VentasScreen() {
  const router = useRouter();
  const { role, loading: roleLoading, email } = useSessionInfo();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [salesByItem, setSalesByItem] = useState<Map<string, ItemSale>>(new Map());
  const [paymentsBySale, setPaymentsBySale] = useState<Map<string, ItemSalePayment[]>>(new Map());

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Exclusive to Owner — Editor gets everything else this app has, just
  // not this. Redirects the same way every other admin screen redirects
  // a non-admin, just checking a narrower condition.
  useEffect(() => {
    if (!roleLoading && role !== "owner") router.replace("/items");
  }, [role, roleLoading, router]);

  useEffect(() => {
    if (role !== "owner") return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [itemsRes, salesRes, paymentsRes] = await Promise.all([
        supabase
          .from("items")
          .select("id, name, brand, model, area, quantity, ref_code, status, asking_price, item_photos(url)")
          .order("sort_order", { referencedTable: "item_photos" })
          .order("name"),
        supabase.from("item_sales").select("*"),
        supabase.from("item_sale_payments").select("*").order("paid_at"),
      ]);
      if (cancelled) return;

      if (itemsRes.error || salesRes.error || paymentsRes.error) {
        setError(itemsRes.error?.message ?? salesRes.error?.message ?? paymentsRes.error?.message ?? "Error");
        setLoading(false);
        return;
      }

      setItems(
        (itemsRes.data ?? []).map((row) => {
          const photos = (row as unknown as { item_photos: { url: string }[] }).item_photos;
          return { ...row, photoUrl: photos?.[0]?.url ?? null } as QueueItem;
        }),
      );
      setSalesByItem(new Map((salesRes.data ?? []).map((s) => [s.item_id, s as ItemSale])));
      const byPayment = new Map<string, ItemSalePayment[]>();
      for (const p of (paymentsRes.data ?? []) as ItemSalePayment[]) {
        if (!byPayment.has(p.item_sale_id)) byPayment.set(p.item_sale_id, []);
        byPayment.get(p.item_sale_id)!.push(p);
      }
      setPaymentsBySale(byPayment);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, role]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => [i.name, i.brand, i.model, i.area].filter(Boolean).some((f) => (f as string).toLowerCase().includes(q)));
  }, [items, search]);

  const soldCount = items.filter((i) => i.status === "sold").length;

  async function syncItemStatus(itemId: string, sale: ItemSale | undefined, payments: ItemSalePayment[]) {
    const newStatus: ItemStatus = sale ? computeItemStatus(sale.total_with_iva, payments.reduce((s, p) => s + p.amount, 0)) : "for_sale";
    const { error: err } = await supabase.from("items").update({ status: newStatus }).eq("id", itemId);
    if (err) {
      setError(err.message);
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, status: newStatus } : i)));
  }

  async function saveSale(itemId: string, patch: Pick<ItemSale, "final_price" | "iva_included" | "buyer_name" | "buyer_contact" | "notes">) {
    const existing = salesByItem.get(itemId);
    const { data, error: err } = await supabase
      .from("item_sales")
      .upsert({ ...(existing ? { id: existing.id } : {}), item_id: itemId, ...patch, sold_by: email }, { onConflict: "item_id" })
      .select()
      .single();
    if (err || !data) {
      setError(err?.message ?? "No se pudo guardar la venta");
      return;
    }
    const sale = data as ItemSale;
    setSalesByItem((prev) => new Map(prev).set(itemId, sale));
    await syncItemStatus(itemId, sale, paymentsBySale.get(sale.id) ?? []);
  }

  async function deleteSale(itemId: string) {
    const sale = salesByItem.get(itemId);
    if (!sale) return;
    const { error: err } = await supabase.from("item_sales").delete().eq("id", sale.id);
    if (err) {
      setError(err.message);
      return;
    }
    setSalesByItem((prev) => {
      const next = new Map(prev);
      next.delete(itemId);
      return next;
    });
    setPaymentsBySale((prev) => {
      const next = new Map(prev);
      next.delete(sale.id);
      return next;
    });
    await syncItemStatus(itemId, undefined, []);
  }

  async function addPayment(itemId: string, saleId: string, payment: { amount: number; method: PaymentMethod; paid_at: string; note: string | null }) {
    const { data, error: err } = await supabase.from("item_sale_payments").insert({ ...payment, item_sale_id: saleId }).select().single();
    if (err || !data) {
      setError(err?.message ?? "No se pudo guardar el pago");
      return;
    }
    const next = [...(paymentsBySale.get(saleId) ?? []), data as ItemSalePayment];
    setPaymentsBySale((prev) => new Map(prev).set(saleId, next));
    const sale = salesByItem.get(itemId);
    if (sale) await syncItemStatus(itemId, sale, next);
  }

  async function deletePayment(itemId: string, saleId: string, paymentId: string) {
    const { error: err } = await supabase.from("item_sale_payments").delete().eq("id", paymentId);
    if (err) {
      setError(err.message);
      return;
    }
    const next = (paymentsBySale.get(saleId) ?? []).filter((p) => p.id !== paymentId);
    setPaymentsBySale((prev) => new Map(prev).set(saleId, next));
    const sale = salesByItem.get(itemId);
    if (sale) await syncItemStatus(itemId, sale, next);
  }

  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null;

  if (roleLoading || role !== "owner") return <p className="p-4 text-sm text-ink-soft">Cargando...</p>;

  return (
    <div className="pb-8">
      <div className="border-b border-line px-3.5 py-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar artículo..."
          className="h-11 w-full rounded-full border border-line-strong bg-page px-4 text-base text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <p className="mt-2 text-sm text-ink-soft">
          {soldCount} de {items.length} vendidos
        </p>
      </div>

      {error && <p className="px-3.5 py-2 text-sm text-red-600">Error: {error}</p>}

      {loading ? (
        <p className="p-4 text-sm text-ink-soft">Cargando...</p>
      ) : (
        <div className="md:grid md:grid-cols-[360px_1fr] md:items-start md:gap-4 md:px-3.5">
          <div
            className={`${selectedItemId ? "hidden md:block" : ""} space-y-1.5 px-3.5 py-3 md:overflow-y-auto md:px-0 md:py-3 md:[height:calc(100dvh-160px)]`}
          >
            {filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedItemId(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-md border px-3 py-2.5 text-left ${
                  selectedItemId === item.id ? "border-ink bg-page" : "border-line bg-card"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{getDisplayName(item)}</p>
                  <p className="truncate text-xs text-ink-soft">{item.area ?? "—"}</p>
                </div>
                <StatusBadge status={item.status} />
              </button>
            ))}
            {filteredItems.length === 0 && <p className="p-4 text-sm text-ink-soft">Sin artículos.</p>}
          </div>

          <div className={`${selectedItemId ? "" : "hidden md:block"} px-3.5 py-3 md:overflow-y-auto md:px-0 md:py-3 md:[height:calc(100dvh-160px)]`}>
            {selectedItem ? (
              <ItemSalePanel
                key={selectedItem.id}
                item={selectedItem}
                sale={salesByItem.get(selectedItem.id) ?? null}
                payments={salesByItem.get(selectedItem.id) ? (paymentsBySale.get(salesByItem.get(selectedItem.id)!.id) ?? []) : []}
                onBack={() => setSelectedItemId(null)}
                onSaveSale={(patch) => saveSale(selectedItem.id, patch)}
                onDeleteSale={() => deleteSale(selectedItem.id)}
                onAddPayment={async (p) => {
                  const sale = salesByItem.get(selectedItem.id);
                  if (sale) await addPayment(selectedItem.id, sale.id, p);
                }}
                onDeletePayment={async (paymentId) => {
                  const sale = salesByItem.get(selectedItem.id);
                  if (sale) await deletePayment(selectedItem.id, sale.id, paymentId);
                }}
              />
            ) : (
              <p className="hidden p-4 text-sm text-ink-soft md:block">Selecciona un artículo de la lista.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ItemSalePanel({
  item,
  sale,
  payments,
  onBack,
  onSaveSale,
  onDeleteSale,
  onAddPayment,
  onDeletePayment,
}: {
  item: QueueItem;
  sale: ItemSale | null;
  payments: ItemSalePayment[];
  onBack: () => void;
  onSaveSale: (patch: Pick<ItemSale, "final_price" | "iva_included" | "buyer_name" | "buyer_contact" | "notes">) => Promise<void>;
  onDeleteSale: () => Promise<void>;
  onAddPayment: (p: { amount: number; method: PaymentMethod; paid_at: string; note: string | null }) => Promise<void>;
  onDeletePayment: (paymentId: string) => Promise<void>;
}) {
  const [finalPrice, setFinalPrice] = useState(sale ? String(sale.final_price) : "");
  const [ivaIncluded, setIvaIncluded] = useState(sale?.iva_included ?? true);
  const [buyerName, setBuyerName] = useState(sale?.buyer_name ?? "");
  const [buyerContact, setBuyerContact] = useState(sale?.buyer_contact ?? "");
  const [notes, setNotes] = useState(sale?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentNote, setPaymentNote] = useState("");
  const [addingPayment, setAddingPayment] = useState(false);

  const priceNumber = Number(finalPrice) || 0;
  const previewTotal = ivaIncluded ? priceNumber : Math.round(priceNumber * 1.16 * 100) / 100;
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const totalOwed = sale?.total_with_iva ?? previewTotal;
  const saldoPendiente = Math.max(0, totalOwed - totalPaid);

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
          {item.asking_price != null && <p className="text-sm text-ink-soft">Precio de venta: {formatCurrency(item.asking_price)}</p>}
        </div>
        <StatusBadge status={item.status} />
      </div>

      <div className="space-y-3 rounded-md border border-line bg-card p-3">
        <p className="text-sm font-semibold text-ink">Datos de la venta</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-ink-soft">Precio final</span>
            <input
              type="number"
              value={finalPrice}
              onChange={(e) => setFinalPrice(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-line-strong px-2 text-sm text-ink"
            />
          </label>
          <label className="flex items-end gap-2 pb-2.5">
            <input type="checkbox" checked={ivaIncluded} onChange={(e) => setIvaIncluded(e.target.checked)} className="h-4 w-4" />
            <span className="text-sm text-ink">IVA incluido</span>
          </label>
        </div>
        <p className="text-xs text-ink-soft">Total {ivaIncluded ? "(IVA incluido)" : "con IVA (+16%)"}: {formatCurrency(previewTotal)}</p>

        <label className="block">
          <span className="text-xs font-medium text-ink-soft">Nombre del comprador</span>
          <input
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            className="mt-1 h-10 w-full rounded-md border border-line-strong px-2 text-sm text-ink"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-soft">Contacto del comprador</span>
          <input
            value={buyerContact}
            onChange={(e) => setBuyerContact(e.target.value)}
            placeholder="Teléfono, WhatsApp, correo..."
            className="mt-1 h-10 w-full rounded-md border border-line-strong px-2 text-sm text-ink"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-soft">Notas</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-line-strong p-2 text-sm text-ink"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving || !finalPrice}
            onClick={async () => {
              setSaving(true);
              await onSaveSale({
                final_price: priceNumber,
                iva_included: ivaIncluded,
                buyer_name: buyerName.trim() || null,
                buyer_contact: buyerContact.trim() || null,
                notes: notes.trim() || null,
              });
              setSaving(false);
            }}
            className="flex min-h-10 items-center rounded-md bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sale ? "Guardar cambios" : "Registrar venta"}
          </button>
          {sale && (
            <button
              type="button"
              onClick={onDeleteSale}
              className="flex min-h-10 items-center rounded-md border border-negative/30 bg-negative/5 px-3 text-sm font-semibold text-negative"
            >
              Eliminar venta
            </button>
          )}
        </div>
      </div>

      {sale && (
        <div className="space-y-3 rounded-md border border-line bg-card p-3">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold text-ink">Pagos</p>
            <p className="text-xs text-ink-soft">
              Pagado {formatCurrency(totalPaid)} de {formatCurrency(totalOwed)}
              {saldoPendiente > 0 && <> · Saldo {formatCurrency(saldoPendiente)}</>}
            </p>
          </div>

          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-ink">
                  {formatCurrency(p.amount)} · {PAYMENT_METHOD_LABELS[p.method]}
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

          <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
            <input
              type="number"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder="Monto"
              className="h-9 w-full rounded-md border border-line-strong px-2 text-sm text-ink"
            />
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="h-9 w-full rounded-md border border-line-strong px-2 text-sm text-ink"
            >
              {PAYMENT_METHOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="h-9 w-full rounded-md border border-line-strong px-2 text-sm text-ink"
            />
            <input
              value={paymentNote}
              onChange={(e) => setPaymentNote(e.target.value)}
              placeholder="Nota (opcional)"
              className="h-9 w-full rounded-md border border-line-strong px-2 text-sm text-ink"
            />
          </div>
          <button
            type="button"
            disabled={addingPayment || !paymentAmount}
            onClick={async () => {
              setAddingPayment(true);
              await onAddPayment({
                amount: Number(paymentAmount) || 0,
                method: paymentMethod,
                paid_at: paymentDate,
                note: paymentNote.trim() || null,
              });
              setPaymentAmount("");
              setPaymentNote("");
              setAddingPayment(false);
            }}
            className="flex min-h-9 items-center gap-1.5 rounded-md border border-line-strong px-3 text-sm font-medium text-ink"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Agregar pago
          </button>
        </div>
      )}
    </div>
  );
}
