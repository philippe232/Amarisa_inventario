"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pencil, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ensureAnonymousSession } from "@/lib/supabase/anon-session";
import { useSessionInfo } from "@/lib/auth";
import { formatCurrency } from "@/lib/currency";
import { formatDimensions, getDisplayName } from "@/lib/items";
import PhotoCarousel from "@/components/PhotoCarousel";
import StatusBadge from "@/components/StatusBadge";
import ConditionBadge from "@/components/ConditionBadge";
import type { Item, ItemLink, ItemPhoto } from "@/lib/types";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <p className="text-xs font-bold tracking-wide text-ink-soft uppercase">{label}</p>
      <p className="mt-0.5 text-sm text-ink">{value}</p>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-xs font-bold tracking-wide text-ink-soft uppercase">{children}</h2>;
}

export default function ItemDetail({ id }: { id: string }) {
  const supabase = createClient();
  const { role } = useSessionInfo();

  const [item, setItem] = useState<Item | null>(null);
  const [photos, setPhotos] = useState<ItemPhoto[]>([]);
  const [links, setLinks] = useState<ItemLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [wishlistRowId, setWishlistRowId] = useState<string | null>(null);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [wishlistError, setWishlistError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [itemRes, photosRes, linksRes] = await Promise.all([
        // items_public (db/migrations/0006), not items directly — it
        // masks suggested_resale_price/asking_price_override to null
        // for anyone who isn't Editor/Owner, at the query level, not
        // just by hiding it in this component.
        supabase.from("items_public").select("*").eq("id", id).single(),
        supabase.from("item_photos").select("*").eq("item_id", id).order("sort_order"),
        supabase.from("item_links").select("*").eq("item_id", id).order("created_at"),
      ]);
      if (cancelled) return;

      if (itemRes.error) {
        setError(itemRes.error.message);
        setLoading(false);
        return;
      }
      setItem(itemRes.data as Item);
      setPhotos((photosRes.data ?? []) as ItemPhoto[]);
      setLinks((linksRes.data ?? []) as ItemLink[]);
      setError(null);
      setLoading(false);

      // Wishlist membership check — separate from the main load so a
      // slow/failed anonymous-session bootstrap never blocks the item
      // itself from showing.
      try {
        const userId = await ensureAnonymousSession();
        if (cancelled) return;
        const { data } = await supabase
          .from("wishlist_items")
          .select("id")
          .eq("user_id", userId)
          .eq("item_id", id)
          .maybeSingle();
        if (!cancelled) setWishlistRowId(data?.id ?? null);
      } catch {
        // Leave the button in its default "add" state — same graceful
        // degradation as the rest of the app when anonymous auth isn't
        // reachable.
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, id]);

  async function handleToggleWishlist() {
    setWishlistBusy(true);
    setWishlistError(null);
    try {
      const userId = await ensureAnonymousSession();
      if (wishlistRowId) {
        const { error } = await supabase.from("wishlist_items").delete().eq("id", wishlistRowId);
        if (error) throw error;
        setWishlistRowId(null);
      } else {
        let { data, error } = await supabase
          .from("wishlist_items")
          .upsert({ user_id: userId, item_id: id }, { onConflict: "user_id,item_id" })
          .select("id")
          .single();
        if (error) {
          // The cached session can look locally valid (getSession()
          // returns it) while its underlying auth.users row is gone —
          // this insert then fails on the foreign key, not on auth.
          // Rather than surface that as a dead end, start a fresh
          // anonymous session and retry once before giving up.
          const freshUserId = await ensureAnonymousSession(true);
          ({ data, error } = await supabase
            .from("wishlist_items")
            .upsert({ user_id: freshUserId, item_id: id }, { onConflict: "user_id,item_id" })
            .select("id")
            .single());
          if (error || !data) throw error ?? new Error("No se pudo actualizar tu lista.");
        }
        setWishlistRowId(data!.id);
      }
    } catch (err) {
      setWishlistError(err instanceof Error ? err.message : "No se pudo actualizar tu lista.");
    } finally {
      setWishlistBusy(false);
    }
  }

  if (loading) return <p className="p-4 text-sm text-ink-soft">Cargando...</p>;
  if (error) return <p className="p-4 text-sm text-red-600">Error: {error}</p>;
  if (!item) return null;

  const displayName = getDisplayName(item);

  return (
    <div className="pb-8">
      {/* 1. Header */}
      <PhotoCarousel photos={photos} alt={displayName} />
      <div className="px-3.5 pt-3">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-bold text-ink">{displayName}</h1>
          {role && (
            <Link
              href={`/items/${id}/editar`}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-line-strong bg-card px-3 text-sm font-medium text-ink"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
              Editar
            </Link>
          )}
        </div>
        {/* Cantidad disponible + Estado — same Encabezado grouping/order
            (Nombre, Cantidad disponible, Estado) as the edit form. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {item.quantity > 1 && <span className="text-sm text-ink-soft">Cantidad disponible: {item.quantity}</span>}
          <StatusBadge status={item.status} />
        </div>
      </div>

      {/* 2. Pricing */}
      <div className="mt-5 space-y-2 border-t border-line px-3.5 pt-4">
        <SectionHeading>Precio</SectionHeading>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold text-ink">
            {item.asking_price != null ? formatCurrency(item.asking_price) : "Sin precio"}
          </p>
          {item.purchase_price != null && (
            <p className="text-sm text-ink-faint line-through">{formatCurrency(item.purchase_price)}</p>
          )}
          {item.discount_pct != null && (
            <span className="rounded-full border border-positive/30 bg-positive/10 px-2 py-0.5 text-xs font-bold text-positive">
              -{item.discount_pct}%
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Field label="Precio de compra original" value={item.purchase_price != null ? formatCurrency(item.purchase_price) : null} />
          <Field label="Factura" value={item.has_factura == null ? null : item.has_factura ? "Sí" : "No"} />
          {/* Only ever populated for an Editor/Owner session — items_public
              nulls it out server-side for everyone else. */}
          <Field label="Precio sugerido (investigación)" value={item.suggested_resale_price != null ? formatCurrency(item.suggested_resale_price) : null} />
        </div>
      </div>

      {/* 3. Description — same field grouping/order as the edit form's
          own Descripción section (Marca, Modelo, No. de serie, Área,
          Tipo, Ubicación, dimensiones, then free text). */}
      {(item.brand || item.model || item.serial_number || item.area || item.type || item.location || formatDimensions(item) || item.description) && (
        <div className="mt-5 space-y-3 border-t border-line px-3.5 pt-4">
          <SectionHeading>Descripción</SectionHeading>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca" value={item.brand} />
            <Field label="Modelo" value={item.model} />
            <Field label="No. de serie" value={item.serial_number} />
            <Field label="Área" value={item.area} />
            <Field label="Tipo" value={item.type} />
            <Field label="Ubicación" value={item.location} />
            <Field label="Dimensiones" value={formatDimensions(item)} />
          </div>
          {item.description && <p className="text-sm whitespace-pre-wrap text-ink">{item.description}</p>}
        </div>
      )}

      {/* 4. Condition */}
      {(item.condition_rating || item.years_in_use != null || item.condition_notes) && (
        <div className="mt-5 space-y-3 border-t border-line px-3.5 pt-4">
          <SectionHeading>Estado del artículo</SectionHeading>
          <div className="flex flex-wrap items-center gap-3">
            {item.condition_rating && <ConditionBadge rating={item.condition_rating} />}
            {item.years_in_use != null && <span className="text-sm text-ink-soft">{item.years_in_use} años de uso</span>}
          </div>
          {item.condition_notes && <p className="text-sm whitespace-pre-wrap text-ink">{item.condition_notes}</p>}
        </div>
      )}

      {/* 5. Research */}
      {links.length > 0 && (
        <div className="mt-5 space-y-2 border-t border-line px-3.5 pt-4">
          <SectionHeading>Referencias</SectionHeading>
          <div className="space-y-1.5">
            {links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-ink underline"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
                {link.label || link.url}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Wishlist action — the only interactive element for a
          Viewer/Bidder; role !== null (Editor/Owner) still sees it too,
          nothing about being an admin excludes them from wishlisting. */}
      <div className="mt-6 px-3.5">
        <button
          type="button"
          onClick={handleToggleWishlist}
          disabled={wishlistBusy}
          className={`flex h-12 w-full items-center justify-center rounded-md text-sm font-semibold disabled:opacity-50 ${
            wishlistRowId ? "border border-line-strong bg-card text-ink" : "bg-ink text-white"
          }`}
        >
          {wishlistBusy
            ? "Actualizando..."
            : wishlistRowId
              ? "Quitar de mi lista"
              : "Agregar a mi lista"}
        </button>
        {wishlistError && <p className="mt-2 text-sm text-red-600">{wishlistError}</p>}
      </div>
    </div>
  );
}
