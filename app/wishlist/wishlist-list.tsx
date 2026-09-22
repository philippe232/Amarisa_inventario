"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ensureAnonymousSession } from "@/lib/supabase/anon-session";
import { useSessionInfo } from "@/lib/auth";
import { formatCurrency } from "@/lib/currency";
import ItemChip from "@/components/ItemChip";
import type { Item, ItemListRow } from "@/lib/types";

type WishlistRowFromQuery = {
  id: string;
  bid_amount: number | string | null;
  items: (Item & { item_photos: { url: string }[] }) | null;
};

type WishlistRowData = {
  wishlistId: string;
  bidAmount: number | null;
  item: ItemListRow;
};

export default function WishlistList() {
  const supabase = createClient();
  const router = useRouter();
  const { role, loading: roleLoading } = useSessionInfo();

  const [rows, setRows] = useState<WishlistRowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editor/Owner has no reason to be here — Mi lista is a customer
  // feature (bids on an anonymous session's own wishlist), and the
  // drawer no longer even links to it for an admin. Bounces away
  // anyone who lands here anyway (a stale bookmark, browser back).
  useEffect(() => {
    if (!roleLoading && role) router.replace("/items");
  }, [role, roleLoading, router]);

  // Same plain fetch-on-mount pattern as app/items/items-list.tsx — no
  // cache, refetches every time this screen is navigated back to.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const userId = await ensureAnonymousSession().catch((err: Error) => {
        setError(err.message);
        return null;
      });
      if (cancelled) return;
      if (!userId) {
        setLoading(false);
        return;
      }

      const [wishlistRes, countsRes] = await Promise.all([
        supabase
          .from("wishlist_items")
          .select("id, bid_amount, items(*, item_photos(url))")
          .eq("user_id", userId)
          .order("created_at", { ascending: false }),
        supabase.from("item_wishlist_counts").select("item_id, bidder_count"),
      ]);

      if (cancelled) return;

      if (wishlistRes.error) {
        setError(wishlistRes.error.message);
        setLoading(false);
        return;
      }

      const countByItemId = new Map<string, number>(
        (countsRes.data ?? []).map((row) => [row.item_id as string, row.bidder_count as number]),
      );

      const wishlistRows = (wishlistRes.data ?? []) as unknown as WishlistRowFromQuery[];
      setRows(
        wishlistRows
          .filter((row): row is WishlistRowFromQuery & { items: NonNullable<WishlistRowFromQuery["items"]> } => row.items != null)
          .map((row) => {
            const { item_photos, ...item } = row.items;
            return {
              wishlistId: row.id,
              bidAmount: row.bid_amount != null ? Number(row.bid_amount) : null,
              item: {
                ...item,
                primaryPhotoUrl: item_photos?.[0]?.url ?? null,
                bidderCount: countByItemId.get(item.id) ?? 0,
              },
            };
          }),
      );
      setError(null);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  function handleRemoved(wishlistId: string) {
    setRows((prev) => prev.filter((r) => r.wishlistId !== wishlistId));
  }

  function handleBidSaved(wishlistId: string, bidAmount: number) {
    setRows((prev) => prev.map((r) => (r.wishlistId === wishlistId ? { ...r, bidAmount } : r)));
  }

  if (roleLoading || role) return <p className="p-4 text-sm text-ink-soft">Cargando...</p>;
  if (loading) return <p className="p-4 text-sm text-ink-soft">Cargando...</p>;
  if (error) return <p className="p-4 text-sm text-red-600">Error: {error}</p>;
  if (rows.length === 0) return <p className="p-4 text-sm text-ink-soft">Tu lista está vacía.</p>;

  return (
    <div className="px-3.5 py-3">
      {rows.map((row) => (
        <WishlistRow key={row.wishlistId} row={row} onRemoved={handleRemoved} onBidSaved={handleBidSaved} />
      ))}
    </div>
  );
}

function WishlistRow({
  row,
  onRemoved,
  onBidSaved,
}: {
  row: WishlistRowData;
  onRemoved: (wishlistId: string) => void;
  onBidSaved: (wishlistId: string, bidAmount: number) => void;
}) {
  const supabase = createClient();
  const [bidding, setBidding] = useState(false);
  const [bidInput, setBidInput] = useState(row.bidAmount != null ? String(row.bidAmount) : "");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  async function handleRemove() {
    setRemoving(true);
    setRowError(null);
    // RLS (users can delete their own wishlist items) is the real
    // guard here — this only ever affects a row the signed-in session
    // actually owns.
    const { error } = await supabase.from("wishlist_items").delete().eq("id", row.wishlistId);
    if (error) {
      setRowError(error.message);
      setRemoving(false);
      return;
    }
    onRemoved(row.wishlistId);
  }

  async function handleSaveBid() {
    const amount = Number(bidInput);
    if (!Number.isFinite(amount) || amount < 0) {
      setRowError("Ingresa un monto válido.");
      return;
    }
    setSaving(true);
    setRowError(null);
    const { error } = await supabase.from("wishlist_items").update({ bid_amount: amount }).eq("id", row.wishlistId);
    if (error) {
      setRowError(error.message);
      setSaving(false);
      return;
    }
    setSaving(false);
    setBidding(false);
    onBidSaved(row.wishlistId, amount);
  }

  return (
    <div className="border-b border-line py-2.5 last:border-b-0">
      <ItemChip item={row.item} />

      <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
        <p className="text-[13px] text-ink-soft">
          {row.bidAmount != null ? `Tu oferta: ${formatCurrency(row.bidAmount)}` : "Sin oferta todavía"}
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setBidding((v) => !v)}
            className="rounded-md border border-line-strong bg-card px-3 py-1.5 text-xs font-medium text-ink"
          >
            {row.bidAmount != null ? "Editar oferta" : "Ofertar"}
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={removing}
            className="rounded-md border border-line-strong bg-card px-3 py-1.5 text-xs font-medium text-negative disabled:opacity-50"
          >
            {removing ? "Quitando..." : "Quitar"}
          </button>
        </div>
      </div>

      {bidding && (
        <div className="mt-2 flex items-center gap-2 px-1">
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={bidInput}
            onChange={(e) => setBidInput(e.target.value)}
            placeholder="Monto"
            className="h-9 w-32 rounded-md border border-line-strong bg-card px-2 text-sm text-ink"
          />
          <button
            type="button"
            onClick={handleSaveBid}
            disabled={saving}
            className="rounded-md border border-ink bg-ink px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" onClick={() => setBidding(false)} className="text-xs text-ink-soft">
            Cancelar
          </button>
        </div>
      )}

      {rowError && <p className="mt-1 px-1 text-xs text-red-600">{rowError}</p>}
    </div>
  );
}
