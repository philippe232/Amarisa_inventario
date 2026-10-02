"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSessionInfo } from "@/lib/auth";
import { formatCurrency } from "@/lib/currency";
import { getDisplayName } from "@/lib/items";
import StatusBadge from "@/components/StatusBadge";
import Pill from "@/components/Pill";
import { PAYMENT_METHOD_OPTIONS, PAYMENT_METHOD_LABELS } from "@/lib/sales/status";
import type { ItemSale, ItemSalePayment, PaymentMethod } from "@/lib/sales/types";
import type { Item, ItemStatus } from "@/lib/types";

type QueueItem = Pick<Item, "id" | "name" | "brand" | "model" | "area" | "quantity" | "ref_code" | "status" | "asking_price"> & {
  photoUrl: string | null;
};

type SalePatch = Pick<ItemSale, "final_price" | "quantity" | "requires_invoice" | "buyer_name" | "buyer_contact" | "notes">;
type PaymentInput = { amount: number; method: PaymentMethod; paid_at: string; note: string | null };

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" });
}

function soldQtyOf(sales: ItemSale[]): number {
  return sales.reduce((n, s) => n + s.quantity, 0);
}

// "Efectivo, SPEI" — the distinct ways this sale has actually been paid,
// in the same order as the payment-method picker. Derived from the
// payments themselves (each payment carries its own method), so a sale
// settled half in cash and half by SPEI shows both.
function paymentMethodsLabel(payments: ItemSalePayment[]): string {
  const used = new Set(payments.map((p) => p.method));
  const labels = PAYMENT_METHOD_OPTIONS.filter((o) => used.has(o.value)).map((o) => o.label);
  return labels.length > 0 ? labels.join(", ") : "—";
}

// The item's own status (the "Venta" column in revisión, the badge in
// the catalog) follows the units sold: every unit sold across its sales
// reads as "sold", whether or not the money is all in yet — what's still
// owed is tracked per sale (saldo), not here. Until the last unit goes
// the item stays for_sale, since a single status can't say "3 of 10
// sold" and the remaining units must stay visible in the catalog. Run
// right after every sale is saved or deleted so the two never drift.
function computeItemStatus(soldQty: number, itemQty: number): ItemStatus {
  return soldQty >= itemQty ? "sold" : "for_sale";
}

export default function VentasScreen() {
  const router = useRouter();
  const { role, loading: roleLoading, email } = useSessionInfo();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  // An item can have several sales (units sold to different buyers),
  // oldest first.
  const [salesByItem, setSalesByItem] = useState<Map<string, ItemSale[]>>(new Map());
  const [paymentsBySale, setPaymentsBySale] = useState<Map<string, ItemSalePayment[]>>(new Map());

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"buscar" | "resumen">("buscar");

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
        supabase.from("item_sales").select("*").order("sold_at"),
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
      const bySale = new Map<string, ItemSale[]>();
      for (const s of (salesRes.data ?? []) as ItemSale[]) {
        if (!bySale.has(s.item_id)) bySale.set(s.item_id, []);
        bySale.get(s.item_id)!.push(s);
      }
      setSalesByItem(bySale);
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
    return items.filter((i) =>
      [i.name, i.brand, i.model, i.area, i.ref_code].filter(Boolean).some((f) => (f as string).toLowerCase().includes(q)),
    );
  }, [items, search]);

  const soldCount = items.filter((i) => i.status === "sold").length;

  // Takes the item's sales explicitly (rather than reading state)
  // because it runs right after a write, before React has applied the
  // matching setState.
  async function syncItemStatus(itemId: string, sales: ItemSale[]) {
    const itemQty = items.find((i) => i.id === itemId)?.quantity ?? 1;
    const newStatus = computeItemStatus(soldQtyOf(sales), itemQty);
    const { error: err } = await supabase.from("items").update({ status: newStatus }).eq("id", itemId);
    if (err) {
      setError(err.message);
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, status: newStatus } : i)));
  }

  // saleId null = a new sale. Returns whether it saved, so the form can
  // stay open with what was typed if it didn't.
  async function saveSale(itemId: string, saleId: string | null, patch: SalePatch): Promise<boolean> {
    const query = saleId
      ? supabase.from("item_sales").update({ ...patch, sold_by: email }).eq("id", saleId)
      : supabase.from("item_sales").insert({ item_id: itemId, ...patch, sold_by: email });
    const { data, error: err } = await query.select().single();
    if (err || !data) {
      setError(err?.message ?? "No se pudo guardar la venta");
      return false;
    }
    const sale = data as ItemSale;
    const current = salesByItem.get(itemId) ?? [];
    const next = saleId ? current.map((s) => (s.id === saleId ? sale : s)) : [...current, sale];
    setSalesByItem((prev) => new Map(prev).set(itemId, next));
    await syncItemStatus(itemId, next);
    return true;
  }

  async function deleteSale(itemId: string, saleId: string) {
    const { error: err } = await supabase.from("item_sales").delete().eq("id", saleId);
    if (err) {
      setError(err.message);
      return;
    }
    const next = (salesByItem.get(itemId) ?? []).filter((s) => s.id !== saleId);
    const nextPayments = new Map(paymentsBySale);
    nextPayments.delete(saleId);
    setSalesByItem((prev) => new Map(prev).set(itemId, next));
    setPaymentsBySale(nextPayments);
    await syncItemStatus(itemId, next);
  }

  async function addPayment(saleId: string, payment: PaymentInput) {
    const { data, error: err } = await supabase.from("item_sale_payments").insert({ ...payment, item_sale_id: saleId }).select().single();
    if (err || !data) {
      setError(err?.message ?? "No se pudo guardar el pago");
      return;
    }
    setPaymentsBySale((prev) => new Map(prev).set(saleId, [...(prev.get(saleId) ?? []), data as ItemSalePayment]));
  }

  async function deletePayment(saleId: string, paymentId: string) {
    const { error: err } = await supabase.from("item_sale_payments").delete().eq("id", paymentId);
    if (err) {
      setError(err.message);
      return;
    }
    setPaymentsBySale((prev) => new Map(prev).set(saleId, (prev.get(saleId) ?? []).filter((p) => p.id !== paymentId)));
  }

  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null;

  if (roleLoading || role !== "owner") return <p className="p-4 text-sm text-ink-soft">Cargando...</p>;

  return (
    <div className="pb-8">
      <div className="border-b border-line px-3.5 py-3">
        <div className="flex gap-2">
          <Pill active={view === "buscar"} onClick={() => setView("buscar")}>
            Por artículo
          </Pill>
          <Pill active={view === "resumen"} onClick={() => setView("resumen")}>
            Resumen
          </Pill>
        </div>
        {view === "buscar" && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar artículo..."
            className="mt-3 h-11 w-full rounded-full border border-line-strong bg-page px-4 text-base text-ink placeholder:text-ink-faint focus:outline-none"
          />
        )}
        <p className="mt-2 text-sm text-ink-soft">
          {soldCount} de {items.length} vendidos
        </p>
      </div>

      {error && <p className="px-3.5 py-2 text-sm text-red-600">Error: {error}</p>}

      {loading ? (
        <p className="p-4 text-sm text-ink-soft">Cargando...</p>
      ) : view === "resumen" ? (
        <ResumenView
          items={items}
          salesByItem={salesByItem}
          paymentsBySale={paymentsBySale}
          onSelectItem={(itemId) => {
            setSelectedItemId(itemId);
            setView("buscar");
          }}
        />
      ) : (
        <div className="md:grid md:grid-cols-[360px_1fr] md:items-start md:gap-4 md:px-3.5">
          <div
            className={`${selectedItemId ? "hidden md:block" : ""} space-y-1.5 px-3.5 py-3 md:overflow-y-auto md:px-0 md:py-3 md:[height:calc(100dvh-160px)]`}
          >
            {filteredItems.map((item) => {
              const soldQty = soldQtyOf(salesByItem.get(item.id) ?? []);
              return (
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
                    <p className="truncate text-xs text-ink-soft">
                      {item.area ?? "—"}
                      {soldQty > 0 && item.quantity > 1 && <> · {soldQty}/{item.quantity} vendidas</>}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </button>
              );
            })}
            {filteredItems.length === 0 && <p className="p-4 text-sm text-ink-soft">Sin artículos.</p>}
          </div>

          <div className={`${selectedItemId ? "" : "hidden md:block"} px-3.5 py-3 md:overflow-y-auto md:px-0 md:py-3 md:[height:calc(100dvh-160px)]`}>
            {selectedItem ? (
              <ItemSalePanel
                key={selectedItem.id}
                item={selectedItem}
                sales={salesByItem.get(selectedItem.id) ?? []}
                paymentsBySale={paymentsBySale}
                onBack={() => setSelectedItemId(null)}
                onSaveSale={(saleId, patch) => saveSale(selectedItem.id, saleId, patch)}
                onDeleteSale={(saleId) => deleteSale(selectedItem.id, saleId)}
                onAddPayment={addPayment}
                onDeletePayment={deletePayment}
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

// --------------------------------------------------------------------
// Resumen — every sale so far, most recent first, with totals across
// all of them and a breakdown by how the money actually came in. Pure
// client-side aggregation over data VentasScreen already loaded, no
// extra query.
// --------------------------------------------------------------------
function ResumenView({
  items,
  salesByItem,
  paymentsBySale,
  onSelectItem,
}: {
  items: QueueItem[];
  salesByItem: Map<string, ItemSale[]>;
  paymentsBySale: Map<string, ItemSalePayment[]>;
  onSelectItem: (itemId: string) => void;
}) {
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const rows = useMemo(
    () =>
      [...salesByItem.values()]
        .flat()
        .map((sale) => {
          const item = itemsById.get(sale.item_id);
          const payments = paymentsBySale.get(sale.id) ?? [];
          const paid = payments.reduce((s, p) => s + p.amount, 0);
          return { item, sale, payments, paid, saldo: Math.max(0, sale.total_with_iva - paid) };
        })
        .filter((r): r is typeof r & { item: QueueItem } => Boolean(r.item))
        .sort((a, b) => b.sale.sold_at.localeCompare(a.sale.sold_at)),
    [salesByItem, paymentsBySale, itemsById],
  );

  const totalVendido = rows.reduce((s, r) => s + r.sale.total_with_iva, 0);
  const totalCobrado = rows.reduce((s, r) => s + r.paid, 0);
  const saldoPendiente = rows.reduce((s, r) => s + r.saldo, 0);

  const byMethod = new Map<string, number>();
  for (const r of rows) {
    for (const p of r.payments) {
      byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount);
    }
  }

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
          <p className="text-xs text-ink-soft">Ventas</p>
          <p className="text-lg font-bold text-ink">{rows.length}</p>
        </div>
      </div>

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
        {rows.map(({ item, sale, payments, saldo }) => (
          <button
            key={sale.id}
            type="button"
            onClick={() => onSelectItem(item.id)}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-line bg-card px-3 py-2.5 text-left"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{getDisplayName(item)}</p>
              <p className="truncate text-xs text-ink-soft">
                {sale.buyer_name ?? "Sin comprador"} · {formatDate(sale.sold_at)}
                {sale.quantity > 1 && <> · {sale.quantity} pzas</>}
              </p>
              <p className="truncate text-xs text-ink-soft">Forma de pago: {paymentMethodsLabel(payments)}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold text-ink">{formatCurrency(sale.total_with_iva)}</p>
              <p className={`text-xs ${saldo > 0 ? "text-negative" : "text-positive"}`}>{saldo > 0 ? `Saldo ${formatCurrency(saldo)}` : "Pagado"}</p>
            </div>
          </button>
        ))}
        {rows.length === 0 && <p className="p-4 text-sm text-ink-soft">Sin ventas registradas todavía.</p>}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------
// One article's sales: a card per sale (its own buyer, price, factura
// and payments) plus a form for the next one while units remain.
// --------------------------------------------------------------------
function ItemSalePanel({
  item,
  sales,
  paymentsBySale,
  onBack,
  onSaveSale,
  onDeleteSale,
  onAddPayment,
  onDeletePayment,
}: {
  item: QueueItem;
  sales: ItemSale[];
  paymentsBySale: Map<string, ItemSalePayment[]>;
  onBack: () => void;
  onSaveSale: (saleId: string | null, patch: SalePatch) => Promise<boolean>;
  onDeleteSale: (saleId: string) => Promise<void>;
  onAddPayment: (saleId: string, p: PaymentInput) => Promise<void>;
  onDeletePayment: (saleId: string, paymentId: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);

  const soldQty = soldQtyOf(sales);
  const available = item.quantity - soldQty;
  // With no sales yet the form is simply there; afterwards it opens on
  // demand, and only while units remain.
  const showDraft = sales.length === 0 || (adding && available > 0);

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
          {item.quantity > 1 && sales.length > 0 && (
            <p className="mt-0.5 text-xs text-ink-soft">
              Vendidas {soldQty} de {item.quantity} · Disponibles {Math.max(0, available)}
            </p>
          )}
        </div>
        <StatusBadge status={item.status} />
      </div>

      {sales.map((sale, idx) => (
        <SaleCard
          key={sale.id}
          item={item}
          title={`Venta ${idx + 1}`}
          sale={sale}
          maxQty={item.quantity - (soldQty - sale.quantity)}
          payments={paymentsBySale.get(sale.id) ?? []}
          onSave={(patch) => onSaveSale(sale.id, patch)}
          onDelete={() => onDeleteSale(sale.id)}
          onAddPayment={(p) => onAddPayment(sale.id, p)}
          onDeletePayment={(paymentId) => onDeletePayment(sale.id, paymentId)}
        />
      ))}

      {showDraft && (
        <SaleCard
          key="new"
          item={item}
          title={sales.length === 0 ? "Datos de la venta" : "Nueva venta"}
          sale={null}
          maxQty={available}
          payments={[]}
          onSave={async (patch) => {
            const saved = await onSaveSale(null, patch);
            if (saved) setAdding(false);
            return saved;
          }}
          onCancel={sales.length > 0 ? () => setAdding(false) : undefined}
        />
      )}

      {!showDraft && sales.length > 0 && available > 0 && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex min-h-10 items-center gap-1.5 rounded-md border border-line-strong bg-card px-3 text-sm font-semibold text-ink"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Agregar otra venta ({available} disponibles)
        </button>
      )}
    </div>
  );
}

function SaleCard({
  item,
  title,
  sale,
  maxQty,
  payments,
  onSave,
  onDelete,
  onCancel,
  onAddPayment,
  onDeletePayment,
}: {
  item: QueueItem;
  title: string;
  sale: ItemSale | null;
  // Most units this sale can cover: the item's quantity minus what its
  // other sales already took.
  maxQty: number;
  payments: ItemSalePayment[];
  onSave: (patch: SalePatch) => Promise<boolean>;
  onDelete?: () => Promise<void>;
  onCancel?: () => void;
  onAddPayment?: (p: PaymentInput) => Promise<void>;
  onDeletePayment?: (paymentId: string) => Promise<void>;
}) {
  const [finalPrice, setFinalPrice] = useState(sale ? String(sale.final_price) : "");
  const [quantity, setQuantity] = useState(sale ? String(sale.quantity) : "1");
  const [requiresInvoice, setRequiresInvoice] = useState(sale?.requires_invoice ?? false);
  const [buyerName, setBuyerName] = useState(sale?.buyer_name ?? "");
  const [buyerContact, setBuyerContact] = useState(sale?.buyer_contact ?? "");
  const [notes, setNotes] = useState(sale?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("efectivo");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentNote, setPaymentNote] = useState("");
  const [addingPayment, setAddingPayment] = useState(false);

  // Only multi-unit items get a quantity field; a single piece is always
  // quantity 1. The price field is per piece, so everything owed scales
  // with the units sold.
  const multi = item.quantity > 1;
  const qtyNumber = multi ? Math.floor(Number(quantity)) || 0 : 1;
  const qtyValid = qtyNumber >= 1 && qtyNumber <= maxQty;
  const units = Math.min(Math.max(qtyNumber, 1), Math.max(maxQty, 1));

  const priceNumber = Number(finalPrice) || 0;
  const subtotal = Math.round(priceNumber * units * 100) / 100;
  const previewIva = requiresInvoice ? Math.round(subtotal * 0.16 * 100) / 100 : null;
  const previewTotal = requiresInvoice ? Math.round(subtotal * 1.16 * 100) / 100 : subtotal;
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const totalOwed = sale?.total_with_iva ?? previewTotal;
  const saldoPendiente = Math.max(0, totalOwed - totalPaid);

  const askingPrice = item.asking_price;
  const discountAmount = askingPrice != null ? askingPrice - priceNumber : null;
  const discountPct = askingPrice != null && askingPrice > 0 ? (discountAmount! / askingPrice) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-md border border-line bg-card p-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-ink">{title}</p>
          {sale && <p className="text-xs text-ink-soft">{formatDate(sale.sold_at)}</p>}
        </div>
        <label className="block">
          <span className="text-xs font-medium text-ink-soft">Precio de venta (lista)</span>
          <p className="mt-1 flex h-10 w-full items-center rounded-md border border-line bg-page px-2 text-sm text-ink-soft">
            {askingPrice != null ? formatCurrency(askingPrice) : "Sin precio de lista"}
          </p>
        </label>
        {multi && (
          <label className="block">
            <span className="text-xs font-medium text-ink-soft">Cantidad (de {maxQty} disponibles)</span>
            <input
              type="number"
              min={1}
              max={maxQty}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-line-strong px-2 text-sm text-ink"
            />
            {!qtyValid && <span className="mt-1 block text-xs text-negative">Debe ser entre 1 y {maxQty}.</span>}
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-ink-soft">{multi ? "Precio final (por pieza)" : "Precio final"}</span>
            <input
              type="number"
              value={finalPrice}
              onChange={(e) => setFinalPrice(e.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-line-strong px-2 text-sm text-ink"
            />
          </label>
          <div className="flex flex-col justify-end pb-2.5">
            <span className="text-xs font-medium text-ink-soft">{multi ? "Descuento (por pieza)" : "Descuento"}</span>
            <p className={`text-sm font-medium ${discountAmount != null && discountAmount > 0 ? "text-positive" : "text-ink"}`}>
              {discountAmount != null ? `${formatCurrency(discountAmount)} (${discountPct!.toFixed(1)}%)` : "—"}
            </p>
          </div>
        </div>

        {multi && (
          <div className="rounded-md border border-line bg-page p-2.5 text-sm text-ink">
            <p>
              {units} × {formatCurrency(priceNumber)} = <span className="font-semibold">{formatCurrency(subtotal)}</span>
            </p>
            {units < maxQty && <p className="mt-0.5 text-xs text-ink-soft">Quedan {maxQty - units} sin vender.</p>}
          </div>
        )}

        <label className="flex items-center gap-2">
          <input type="checkbox" checked={requiresInvoice} onChange={(e) => setRequiresInvoice(e.target.checked)} className="h-4 w-4" />
          <span className="text-sm text-ink">Requiere factura</span>
        </label>
        {requiresInvoice && (
          <div className="grid grid-cols-2 gap-3 rounded-md border border-line bg-page p-2.5">
            <div>
              <p className="text-xs font-medium text-ink-soft">IVA (16%)</p>
              <p className="text-sm font-semibold text-ink">{previewIva != null ? formatCurrency(previewIva) : "—"}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-ink-soft">Monto + IVA a transferir</p>
              <p className="text-sm font-semibold text-ink">{formatCurrency(previewTotal)}</p>
            </div>
          </div>
        )}

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
            disabled={saving || !finalPrice || !qtyValid}
            onClick={async () => {
              setSaving(true);
              await onSave({
                final_price: priceNumber,
                quantity: qtyNumber,
                requires_invoice: requiresInvoice,
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
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex min-h-10 items-center rounded-md border border-line-strong px-3 text-sm font-semibold text-ink"
            >
              Cancelar
            </button>
          )}
          {sale && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex min-h-10 items-center rounded-md border border-negative/30 bg-negative/5 px-3 text-sm font-semibold text-negative"
            >
              Eliminar venta
            </button>
          )}
        </div>
      </div>

      {sale && onAddPayment && onDeletePayment && (
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
