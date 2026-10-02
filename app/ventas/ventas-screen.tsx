"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSessionInfo } from "@/lib/auth";
import { formatCurrency } from "@/lib/currency";
import { getDisplayName } from "@/lib/items";
import { itemStatusFor, lineTotal, orderTotals, reservedQty, round2, soldQty } from "@/lib/sales/orders";
import type { ItemSale, OrderPayment, SaleOrder } from "@/lib/sales/types";
import type { ItemStatus } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import Pill from "@/components/Pill";
import CartPanel, { type LinePatch } from "./cart-panel";
import ItemPanel, { type AddTarget } from "./item-panel";
import ResumenView from "./resumen-view";
import { OrderStatusBadge, type PaymentInput, type QueueItem } from "./shared";

type View = "articulos" | "carritos" | "resumen";
type OrderPatch = Partial<Pick<SaleOrder, "name" | "buyer_contact" | "notes" | "requires_invoice" | "payment_method">>;

function groupBy<T>(rows: T[], key: (row: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (k == null) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(row);
  }
  return map;
}

// numeric columns can arrive as strings; everything downstream does math.
const normLine = (l: ItemSale): ItemSale => ({
  ...l,
  final_price: Number(l.final_price),
  line_total: l.line_total == null ? null : Number(l.line_total),
});
const normPayment = (p: OrderPayment): OrderPayment => ({ ...p, amount: Number(p.amount) });

export default function VentasScreen() {
  const { role, loading, email } = useSessionInfo();
  const supabase = useMemo(() => createClient(), []);
  return <VentasView supabase={supabase} role={role} roleLoading={loading} email={email} />;
}

// Everything the screen does, with its Supabase client and session handed
// in — so it can run against a stand-in database when testing.
export function VentasView({
  supabase,
  role,
  roleLoading,
  email,
}: {
  supabase: ReturnType<typeof createClient>;
  role: ReturnType<typeof useSessionInfo>["role"];
  roleLoading: boolean;
  email: string | null;
}) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [orders, setOrders] = useState<SaleOrder[]>([]);
  // Every item_sales row: a cart line when order_id is set.
  const [lines, setLines] = useState<ItemSale[]>([]);
  const [payments, setPayments] = useState<OrderPayment[]>([]);

  const [view, setView] = useState<View>("articulos");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  // The cart articles get added to unless another is picked.
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [newCartName, setNewCartName] = useState("");

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
      const [itemsRes, ordersRes, linesRes, paymentsRes] = await Promise.all([
        supabase
          .from("items")
          .select("id, name, brand, model, area, quantity, ref_code, status, asking_price, item_photos(url)")
          .order("sort_order", { referencedTable: "item_photos" })
          .order("name"),
        supabase.from("sale_orders").select("*").order("created_at"),
        supabase.from("item_sales").select("*").order("sold_at"),
        supabase.from("sale_order_payments").select("*").order("paid_at"),
      ]);
      if (cancelled) return;

      const failed = itemsRes.error ?? ordersRes.error ?? linesRes.error ?? paymentsRes.error;
      if (failed) {
        setError(failed.message);
        setLoading(false);
        return;
      }

      setItems(
        (itemsRes.data ?? []).map((row) => {
          const photos = (row as unknown as { item_photos: { url: string }[] }).item_photos;
          return {
            ...row,
            asking_price: row.asking_price == null ? null : Number(row.asking_price),
            photoUrl: photos?.[0]?.url ?? null,
          } as QueueItem;
        }),
      );
      setOrders((ordersRes.data ?? []) as SaleOrder[]);
      setLines(((linesRes.data ?? []) as ItemSale[]).map(normLine));
      setPayments(((paymentsRes.data ?? []) as OrderPayment[]).map(normPayment));
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, role]);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const ordersById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const linesByOrder = useMemo(() => groupBy(lines, (l) => l.order_id), [lines]);
  const linesByItem = useMemo(() => groupBy(lines, (l) => l.item_id), [lines]);
  const paymentsByOrder = useMemo(() => groupBy(payments, (p) => p.order_id), [payments]);
  const reservedByItem = useMemo(
    () => new Map([...linesByItem].map(([itemId, ls]) => [itemId, reservedQty(ls)])),
    [linesByItem],
  );

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      [i.name, i.brand, i.model, i.area, i.ref_code].filter(Boolean).some((f) => (f as string).toLowerCase().includes(q)),
    );
  }, [items, search]);

  const openOrders = useMemo(
    () => orders.filter((o) => o.status === "open").sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [orders],
  );
  // Open carts first (newest first), then closed ones (last closed first).
  const sortedOrders = useMemo(
    () => [
      ...openOrders,
      ...orders.filter((o) => o.status === "closed").sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? "")),
    ],
    [orders, openOrders],
  );

  const soldCount = items.filter((i) => i.status === "sold").length;

  // An item is "sold" once every unit is in a CLOSED order. Only moves
  // sold <-> not sold, so a "reserved" someone set by hand is left alone.
  async function syncItemStatuses(itemIds: Iterable<string>, nextLines: ItemSale[], nextOrders: SaleOrder[]) {
    const byId = new Map(nextOrders.map((o) => [o.id, o]));
    const updates: { id: string; status: ItemStatus }[] = [];
    for (const id of new Set(itemIds)) {
      const item = itemsById.get(id);
      if (!item) continue;
      const computed = itemStatusFor(soldQty(nextLines.filter((l) => l.item_id === id), byId), item.quantity);
      if (computed === "sold" && item.status !== "sold") updates.push({ id, status: "sold" });
      else if (computed !== "sold" && item.status === "sold") updates.push({ id, status: "for_sale" });
    }
    for (const u of updates) {
      const { error: err } = await supabase.from("items").update({ status: u.status }).eq("id", u.id);
      if (err) {
        setError(err.message);
        return;
      }
    }
    if (updates.length > 0) {
      const next = new Map(updates.map((u) => [u.id, u.status]));
      setItems((prev) => prev.map((i) => (next.has(i.id) ? { ...i, status: next.get(i.id)! } : i)));
    }
  }

  async function createOrder(name: string): Promise<SaleOrder | null> {
    const { data, error: err } = await supabase
      .from("sale_orders")
      .insert({ name, payment_method: "efectivo", created_by: email })
      .select()
      .single();
    if (err || !data) {
      setError(err?.message ?? "No se pudo crear el carrito");
      return null;
    }
    const order = data as SaleOrder;
    setOrders((prev) => [...prev, order]);
    return order;
  }

  async function updateOrder(orderId: string, patch: OrderPatch) {
    const before = ordersById.get(orderId);
    if (!before) return;
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o)));
    const { error: err } = await supabase.from("sale_orders").update(patch).eq("id", orderId);
    if (err) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? before : o)));
      setError(err.message);
    }
  }

  async function setOrderClosed(orderId: string, closed: boolean) {
    const patch = closed ? { status: "closed" as const, closed_at: new Date().toISOString() } : { status: "open" as const, closed_at: null };
    const { error: err } = await supabase.from("sale_orders").update(patch).eq("id", orderId);
    if (err) {
      setError(err.message);
      return;
    }
    const nextOrders = orders.map((o) => (o.id === orderId ? { ...o, ...patch } : o));
    setOrders(nextOrders);
    await syncItemStatuses((linesByOrder.get(orderId) ?? []).map((l) => l.item_id), lines, nextOrders);
  }

  async function deleteOrder(orderId: string) {
    const affected = (linesByOrder.get(orderId) ?? []).map((l) => l.item_id);
    const { error: err } = await supabase.from("sale_orders").delete().eq("id", orderId);
    if (err) {
      setError(err.message);
      return;
    }
    const nextOrders = orders.filter((o) => o.id !== orderId);
    const nextLines = lines.filter((l) => l.order_id !== orderId);
    setOrders(nextOrders);
    setLines(nextLines);
    setPayments((prev) => prev.filter((p) => p.order_id !== orderId));
    if (selectedOrderId === orderId) setSelectedOrderId(null);
    if (activeOrderId === orderId) setActiveOrderId(null);
    await syncItemStatuses(affected, nextLines, nextOrders);
  }

  // Puts units of an item into a cart (a new one when given a name). An
  // item already in the cart just gains units, priced at the same
  // per-unit amount.
  async function addToCart(item: QueueItem, target: AddTarget, qty: number): Promise<boolean> {
    let orderId: string;
    if ("orderId" in target) {
      orderId = target.orderId;
    } else {
      const created = await createOrder(target.newName);
      if (!created) return false;
      orderId = created.id;
    }
    setActiveOrderId(orderId);

    const existing = lines.find((l) => l.order_id === orderId && l.item_id === item.id);
    if (existing) {
      const quantity = existing.quantity + qty;
      await updateLine(existing.id, { quantity, final_price: existing.final_price, line_total: round2(existing.final_price * quantity) });
      return true;
    }
    const price = item.asking_price ?? 0;
    const { data, error: err } = await supabase
      .from("item_sales")
      .insert({ item_id: item.id, order_id: orderId, final_price: price, quantity: qty, line_total: round2(price * qty), sold_by: email })
      .select()
      .single();
    if (err || !data) {
      setError(err?.message ?? "No se pudo agregar al carrito");
      return false;
    }
    setLines((prev) => [...prev, normLine(data as ItemSale)]);
    return true;
  }

  async function updateLine(lineId: string, patch: LinePatch) {
    const before = lines.find((l) => l.id === lineId);
    if (!before) return;
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l)));
    const { error: err } = await supabase.from("item_sales").update(patch).eq("id", lineId);
    if (err) {
      setLines((prev) => prev.map((l) => (l.id === lineId ? before : l)));
      setError(err.message);
    }
  }

  async function removeLine(lineId: string) {
    const { error: err } = await supabase.from("item_sales").delete().eq("id", lineId);
    if (err) {
      setError(err.message);
      return;
    }
    setLines((prev) => prev.filter((l) => l.id !== lineId));
  }

  async function addPayment(orderId: string, payment: PaymentInput) {
    const { data, error: err } = await supabase.from("sale_order_payments").insert({ ...payment, order_id: orderId }).select().single();
    if (err || !data) {
      setError(err?.message ?? "No se pudo guardar el pago");
      return;
    }
    setPayments((prev) => [...prev, normPayment(data as OrderPayment)]);
  }

  async function deletePayment(paymentId: string) {
    const { error: err } = await supabase.from("sale_order_payments").delete().eq("id", paymentId);
    if (err) {
      setError(err.message);
      return;
    }
    setPayments((prev) => prev.filter((p) => p.id !== paymentId));
  }

  async function handleNewCart() {
    const name = newCartName.trim();
    if (!name) return;
    const order = await createOrder(name);
    if (!order) return;
    setNewCartName("");
    setActiveOrderId(order.id);
    setSelectedOrderId(order.id);
  }

  function openOrder(orderId: string) {
    setSelectedOrderId(orderId);
    setView("carritos");
  }

  const selectedItem = itemsById.get(selectedItemId ?? "") ?? null;
  const selectedOrder = ordersById.get(selectedOrderId ?? "") ?? null;
  const activeOrder = ordersById.get(activeOrderId ?? "") ?? null;

  if (roleLoading || role !== "owner") return <p className="p-4 text-sm text-ink-soft">Cargando...</p>;

  const listPane = "space-y-1.5 px-3.5 py-3 md:overflow-y-auto md:px-0 md:py-3 md:[height:calc(100dvh-160px)]";
  const detailPane = "px-3.5 py-3 md:overflow-y-auto md:px-0 md:py-3 md:[height:calc(100dvh-160px)]";

  return (
    <div className="pb-8">
      <div className="border-b border-line px-3.5 py-3">
        <div className="flex gap-2">
          <Pill active={view === "articulos"} onClick={() => setView("articulos")}>
            Por artículo
          </Pill>
          <Pill active={view === "carritos"} onClick={() => setView("carritos")}>
            Carritos{openOrders.length > 0 ? ` (${openOrders.length})` : ""}
          </Pill>
          <Pill active={view === "resumen"} onClick={() => setView("resumen")}>
            Resumen
          </Pill>
        </div>
        {view === "articulos" && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar artículo o ref..."
            className="mt-3 h-11 w-full rounded-full border border-line-strong bg-page px-4 text-base text-ink placeholder:text-ink-faint focus:outline-none"
          />
        )}
        <p className="mt-2 text-sm text-ink-soft">
          {soldCount} de {items.length} vendidos
          {view === "articulos" && activeOrder && activeOrder.status === "open" && <> · Agregando a: <span className="font-medium text-ink">{activeOrder.name}</span></>}
        </p>
      </div>

      {error && <p className="px-3.5 py-2 text-sm text-red-600">Error: {error}</p>}

      {loading ? (
        <p className="p-4 text-sm text-ink-soft">Cargando...</p>
      ) : view === "resumen" ? (
        <ResumenView orders={orders} linesByOrder={linesByOrder} paymentsByOrder={paymentsByOrder} onOpenOrder={openOrder} />
      ) : view === "carritos" ? (
        <div className="md:grid md:grid-cols-[360px_1fr] md:items-start md:gap-4 md:px-3.5">
          <div className={`${selectedOrderId ? "hidden md:block" : ""} ${listPane}`}>
            <div className="flex gap-2">
              <input
                value={newCartName}
                onChange={(e) => setNewCartName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleNewCart()}
                placeholder="Nombre del nuevo carrito"
                className="h-10 min-w-0 flex-1 rounded-md border border-line-strong px-3 text-sm text-ink placeholder:text-ink-faint"
              />
              <button
                type="button"
                disabled={!newCartName.trim()}
                onClick={() => void handleNewCart()}
                className="flex h-10 shrink-0 items-center gap-1 rounded-md bg-ink px-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Crear
              </button>
            </div>
            {sortedOrders.map((order) => {
              const ols = linesByOrder.get(order.id) ?? [];
              const { total } = orderTotals(ols.map(lineTotal), order.requires_invoice);
              const pieces = ols.reduce((n, l) => n + l.quantity, 0);
              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => setSelectedOrderId(order.id)}
                  className={`flex w-full items-center gap-2.5 rounded-md border px-3 py-2.5 text-left ${
                    selectedOrderId === order.id ? "border-ink bg-page" : "border-line bg-card"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{order.name}</p>
                    <p className="truncate text-xs text-ink-soft">
                      {ols.length} {ols.length === 1 ? "artículo" : "artículos"} · {pieces} pzas · {formatCurrency(total)}
                    </p>
                  </div>
                  <OrderStatusBadge status={order.status} />
                </button>
              );
            })}
            {sortedOrders.length === 0 && <p className="p-4 text-sm text-ink-soft">Todavía no hay carritos. Crea uno arriba o agrega un artículo desde «Por artículo».</p>}
          </div>

          <div className={`${selectedOrderId ? "" : "hidden md:block"} ${detailPane}`}>
            {selectedOrder ? (
              <CartPanel
                key={selectedOrder.id}
                order={selectedOrder}
                lines={linesByOrder.get(selectedOrder.id) ?? []}
                itemsById={itemsById}
                reservedByItem={reservedByItem}
                payments={paymentsByOrder.get(selectedOrder.id) ?? []}
                onBack={() => setSelectedOrderId(null)}
                onUpdateOrder={(patch) => updateOrder(selectedOrder.id, patch)}
                onUpdateLine={updateLine}
                onRemoveLine={removeLine}
                onAddArticles={() => {
                  setActiveOrderId(selectedOrder.id);
                  setView("articulos");
                }}
                onAddPayment={(p) => addPayment(selectedOrder.id, p)}
                onDeletePayment={deletePayment}
                onSetClosed={(closed) => setOrderClosed(selectedOrder.id, closed)}
                onDelete={() => deleteOrder(selectedOrder.id)}
              />
            ) : (
              <p className="hidden p-4 text-sm text-ink-soft md:block">Selecciona un carrito de la lista.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="md:grid md:grid-cols-[360px_1fr] md:items-start md:gap-4 md:px-3.5">
          <div className={`${selectedItemId ? "hidden md:block" : ""} ${listPane}`}>
            {filteredItems.map((item) => {
              const available = item.quantity - (reservedByItem.get(item.id) ?? 0);
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
                      {available < item.quantity && <> · Disp. {Math.max(0, available)}/{item.quantity}</>}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </button>
              );
            })}
            {filteredItems.length === 0 && <p className="p-4 text-sm text-ink-soft">Sin artículos.</p>}
          </div>

          <div className={`${selectedItemId ? "" : "hidden md:block"} ${detailPane}`}>
            {selectedItem ? (
              <ItemPanel
                key={selectedItem.id}
                item={selectedItem}
                lines={linesByItem.get(selectedItem.id) ?? []}
                ordersById={ordersById}
                openOrders={openOrders}
                activeOrderId={activeOrderId}
                onBack={() => setSelectedItemId(null)}
                onAdd={(target, qty) => addToCart(selectedItem, target, qty)}
                onOpenOrder={openOrder}
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
