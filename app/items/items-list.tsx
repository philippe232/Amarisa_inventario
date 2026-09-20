"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ItemChip from "@/components/ItemChip";
import type { Item, ItemListRow } from "@/lib/types";

type ItemRowFromQuery = Item & {
  item_photos: { url: string }[] | null;
  wishlist_items: { count: number }[] | null;
};

export default function ItemsList() {
  const supabase = createClient();

  const [items, setItems] = useState<ItemListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Deliberately a plain fetch-on-mount, no cache layer (unlike Cereza's
  // gastos-list.tsx, which adds a localStorage snapshot purely to avoid a
  // loading flash on repeat visits). Per instruction: no real-time
  // subscriptions, just a fresh fetch whenever this screen mounts — which
  // happens automatically on every "back" navigation from the detail
  // screen, since the App Router unmounts a client page's component tree
  // on route change rather than keeping it alive in the background. That
  // means the bidder count (wishlist_items count, computed here at query
  // time, never a stored column) can't go stale on return.
  //
  // `load` is declared inside the effect (not a useCallback called by
  // reference) — same fix Cereza's own gastos-list.tsx/cierres-list.tsx
  // effects use for this exact react-hooks/set-state-in-effect lint rule,
  // per that file's own header comment.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      // item_photos ordered by sort_order so [0] is always the primary
      // photo; wishlist_items(count) is a PostgREST embedded aggregate —
      // it can't drift from the real wishlist_items rows the way a stored
      // counter column could.
      const { data, error } = await supabase
        .from("items")
        .select("*, item_photos(url), wishlist_items(count)")
        .order("sort_order", { referencedTable: "item_photos" })
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as unknown as ItemRowFromQuery[];
      setItems(
        rows.map((row) => {
          const { item_photos, wishlist_items, ...item } = row;
          return {
            ...item,
            primaryPhotoUrl: item_photos?.[0]?.url ?? null,
            bidderCount: wishlist_items?.[0]?.count ?? 0,
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

  if (loading) return <p className="p-4 text-sm text-ink-soft">Cargando...</p>;
  if (error) return <p className="p-4 text-sm text-red-600">Error: {error}</p>;
  if (items.length === 0) return <p className="p-4 text-sm text-ink-soft">Sin artículos.</p>;

  return (
    <div className="px-3.5 py-3">
      {items.map((item) => (
        <ItemChip key={item.id} item={item} href={`/items/${item.id}`} />
      ))}
    </div>
  );
}
