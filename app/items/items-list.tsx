"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSessionInfo } from "@/lib/auth";
import ItemChip from "@/components/ItemChip";
import SearchFilterBar, { type FilterChip } from "@/components/SearchFilterBar";
import Pill from "@/components/Pill";
import { normalizeSearch } from "@/lib/normalize-search";
import type { Item, ItemListRow } from "@/lib/types";

type ItemRowFromQuery = Item & {
  item_photos: { url: string }[] | null;
};

export default function ItemsList() {
  const supabase = createClient();
  const router = useRouter();
  const { role } = useSessionInfo();
  const [creating, setCreating] = useState(false);

  const [items, setItems] = useState<ItemListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  // Multi-select per facet (OR within área, OR within tipo), AND across
  // the two — same model as Cereza's Tipo/Cuenta/Proveedor filter
  // (gastos-list.tsx). Options are derived from whatever's actually in
  // the data below, not hardcoded — área/tipo are free-text columns on
  // purpose, so a new value never needs a matching code change here.
  const [areaFiltro, setAreaFiltro] = useState<Set<string>>(new Set());
  const [typeFiltro, setTypeFiltro] = useState<Set<string>>(new Set());

  function toggleArea(area: string) {
    setAreaFiltro((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  }

  function toggleType(type: string) {
    setTypeFiltro((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  // Deliberately a plain fetch-on-mount, no cache layer (unlike Cereza's
  // gastos-list.tsx, which adds a localStorage snapshot purely to avoid a
  // loading flash on repeat visits). Per instruction: no real-time
  // subscriptions, just a fresh fetch whenever this screen mounts — which
  // happens automatically on every "back" navigation from the detail
  // screen, since the App Router unmounts a client page's component tree
  // on route change rather than keeping it alive in the background. That
  // means the bidder count can't go stale on return.
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
      // photo. Bidder count comes from item_wishlist_counts (a separate
      // query, not an embedded wishlist_items(count)) — 0003 locked
      // wishlist_items itself down to each user's own rows, so a public
      // per-item count has to come from the aggregate view instead.
      const [itemsRes, countsRes] = await Promise.all([
        supabase
          // items_public (db/migrations/0006), not items — masks
          // suggested_resale_price/asking_price_override to null for
          // anyone who isn't Editor/Owner, at the query level.
          .from("items_public")
          .select("*, item_photos(url)")
          .order("sort_order", { referencedTable: "item_photos" })
          .order("created_at", { ascending: false }),
        supabase.from("item_wishlist_counts").select("item_id, bidder_count"),
      ]);

      if (cancelled) return;

      if (itemsRes.error) {
        setError(itemsRes.error.message);
        setLoading(false);
        return;
      }
      // A failed counts fetch shouldn't block the whole list from
      // showing — worst case every row just shows 0 interesados.
      const countByItemId = new Map<string, number>(
        (countsRes.data ?? []).map((row) => [row.item_id as string, row.bidder_count as number]),
      );

      const rows = (itemsRes.data ?? []) as unknown as ItemRowFromQuery[];
      setItems(
        rows.map((row) => {
          const { item_photos, ...item } = row;
          return {
            ...item,
            primaryPhotoUrl: item_photos?.[0]?.url ?? null,
            bidderCount: countByItemId.get(item.id) ?? 0,
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

  const areaOptions = useMemo(
    () => Array.from(new Set(items.map((i) => i.area).filter((a): a is string => !!a))).sort(),
    [items],
  );
  const typeOptions = useMemo(
    () => Array.from(new Set(items.map((i) => i.type).filter((t): t is string => !!t))).sort(),
    [items],
  );

  // Client-side filter, no database round-trip — the whole catalog is
  // ~55 rows, same reasoning cuentas-por-pagar-list.tsx gives for its
  // own client-side search.
  const filteredItems = useMemo(() => {
    let result = items;
    if (search.trim()) {
      const term = normalizeSearch(search.trim());
      result = result.filter(
        (i) => normalizeSearch(i.name).includes(term) || (i.description && normalizeSearch(i.description).includes(term)),
      );
    }
    if (areaFiltro.size > 0) result = result.filter((i) => i.area && areaFiltro.has(i.area));
    if (typeFiltro.size > 0) result = result.filter((i) => i.type && typeFiltro.has(i.type));
    return result;
  }, [items, search, areaFiltro, typeFiltro]);

  const chips: FilterChip[] = [
    ...Array.from(areaFiltro).map((a) => ({ id: `area:${a}`, label: a })),
    ...Array.from(typeFiltro).map((t) => ({ id: `type:${t}`, label: t })),
  ];

  function handleRemoveChip(id: string) {
    const sep = id.indexOf(":");
    const kind = id.slice(0, sep);
    const value = id.slice(sep + 1);
    if (kind === "area") toggleArea(value);
    else if (kind === "type") toggleType(value);
  }

  const hasActiveFilters = search !== "" || areaFiltro.size > 0 || typeFiltro.size > 0;

  // Insert a minimal placeholder row, then hand off to the real edit
  // screen for everything else — reuses that form entirely instead of
  // building a separate "new item" form. "Nuevo artículo" as the name
  // is deliberately generic; items_ensure_unique_name (0006) auto-
  // suffixes " #01"/" #02" if it collides with an earlier draft, same
  // as any other duplicate name.
  async function handleCreate() {
    setCreating(true);
    const { data, error: insertError } = await supabase
      .from("items")
      .insert({ name: "Nuevo artículo", quantity: 1, status: "for_sale" })
      .select("id")
      .single();
    setCreating(false);
    if (insertError || !data) {
      setError(insertError?.message ?? "No se pudo crear el artículo.");
      return;
    }
    // ?new=1 tells the edit screen this row has never been through a
    // real Guardar yet — Cancelar there discards it instead of just
    // navigating away. See item-edit-form.tsx's own handling.
    router.push(`/items/${data.id}/editar?new=1`);
  }

  return (
    <>
      <SearchFilterBar
        value={search}
        onChange={setSearch}
        placeholder="Buscar artículo"
        chips={chips}
        onRemoveChip={handleRemoveChip}
        onClearAll={
          hasActiveFilters
            ? () => {
                setSearch("");
                setAreaFiltro(new Set());
                setTypeFiltro(new Set());
              }
            : undefined
        }
        sheetTitle="Filtrar"
        sheetContent={
          <div className="space-y-5">
            {areaOptions.length > 0 && (
              <div>
                <span className="mb-1.5 block text-xs font-bold tracking-wide text-ink-soft uppercase">Área</span>
                <div className="flex flex-wrap gap-2">
                  {areaOptions.map((area) => (
                    <Pill key={area} active={areaFiltro.has(area)} onClick={() => toggleArea(area)}>
                      {area}
                    </Pill>
                  ))}
                </div>
              </div>
            )}

            {typeOptions.length > 0 && (
              <div>
                <span className="mb-1.5 block text-xs font-bold tracking-wide text-ink-soft uppercase">Tipo</span>
                <div className="flex flex-wrap gap-2">
                  {typeOptions.map((type) => (
                    <Pill key={type} active={typeFiltro.has(type)} onClick={() => toggleType(type)}>
                      {type}
                    </Pill>
                  ))}
                </div>
              </div>
            )}
          </div>
        }
      />

      {loading ? (
        <p className="p-4 text-sm text-ink-soft">Cargando...</p>
      ) : error ? (
        <p className="p-4 text-sm text-red-600">Error: {error}</p>
      ) : items.length === 0 ? (
        <p className="p-4 text-sm text-ink-soft">Sin artículos.</p>
      ) : filteredItems.length === 0 ? (
        <p className="p-4 text-sm text-ink-soft">Sin resultados.</p>
      ) : (
        <div className="px-3.5 py-3">
          {filteredItems.map((item) => (
            <ItemChip key={item.id} item={item} href={`/items/${item.id}`} />
          ))}
        </div>
      )}

      {/* Spacer so the fixed bar below never covers the last row —
          matches its own h-12 button + p-3 padding + border. */}
      {role && <div className="h-[76px]" aria-hidden="true" />}

      {/* Full-width bar pinned to the bottom, same shape as Cereza's
          PrimaryActionBar (never a FAB) — Amarisa has no bottom tab
          tray to pin above, so this sits flush against the viewport
          edge instead. Editor/Owner only; a Viewer/Bidder has nothing
          to create here. */}
      {role && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-ink text-sm font-semibold text-white disabled:opacity-50"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            {creating ? "Creando..." : "Agregar artículo"}
          </button>
        </div>
      )}
    </>
  );
}
