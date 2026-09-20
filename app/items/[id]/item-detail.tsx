"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ensureAnonymousSession } from "@/lib/supabase/anon-session";
import { formatCurrency } from "@/lib/currency";
import { getDisplayName } from "@/lib/items";
import type { Item } from "@/lib/types";

// Minimal stub — just enough to prove the list screen refetches (fresh
// bidder count included) when navigated back to. Not the real detail
// screen design.
export default function ItemDetail({ id }: { id: string }) {
  const supabase = createClient();

  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wishlistState, setWishlistState] = useState<"idle" | "saving" | "added" | "error">("idle");
  const [wishlistError, setWishlistError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase.from("items").select("*").eq("id", id).single();
      if (cancelled) return;
      if (error) {
        setError(error.message);
      } else {
        setItem(data as Item);
        setError(null);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, id]);

  async function handleAddToWishlist() {
    setWishlistState("saving");
    setWishlistError(null);
    try {
      const userId = await ensureAnonymousSession();
      // Upsert + ignoreDuplicates: the (user_id, item_id) unique
      // constraint makes this idempotent — tapping it again when the
      // item's already on the list is a harmless no-op, not an error.
      const { error } = await supabase
        .from("wishlist_items")
        .upsert({ user_id: userId, item_id: id }, { onConflict: "user_id,item_id", ignoreDuplicates: true });
      if (error) throw error;
      setWishlistState("added");
    } catch (err) {
      setWishlistError(err instanceof Error ? err.message : "No se pudo agregar a la lista.");
      setWishlistState("error");
    }
  }

  return (
    <div className="min-h-screen bg-white px-3.5 py-4">
      <Link href="/items" className="text-sm text-ink-soft">
        ← Volver
      </Link>

      {loading && <p className="mt-4 text-sm text-ink-soft">Cargando...</p>}
      {error && <p className="mt-4 text-sm text-red-600">Error: {error}</p>}
      {item && (
        <div className="mt-4">
          <h1 className="text-xl font-bold text-ink">{getDisplayName(item)}</h1>
          <p className="mt-1 text-[15px] font-bold text-ink">
            {item.suggested_resale_price != null ? formatCurrency(item.suggested_resale_price) : "Sin precio"}
          </p>

          <button
            type="button"
            onClick={handleAddToWishlist}
            disabled={wishlistState === "saving" || wishlistState === "added"}
            className="mt-4 rounded-md border border-line-strong bg-card px-4 py-2 text-sm font-medium text-ink disabled:opacity-50"
          >
            {wishlistState === "added" ? "Agregado ✓" : wishlistState === "saving" ? "Agregando..." : "Agregar a mi lista"}
          </button>
          {wishlistState === "error" && <p className="mt-2 text-sm text-red-600">{wishlistError}</p>}
        </div>
      )}
    </div>
  );
}
