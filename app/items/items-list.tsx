"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSessionInfo } from "@/lib/auth";
import ItemChip from "@/components/ItemChip";
import SearchFilterBar, { type FilterChip } from "@/components/SearchFilterBar";
import Pill from "@/components/Pill";
import { normalizeSearch } from "@/lib/normalize-search";
import { effectiveStatus } from "@/lib/items";
import { thumbUrl } from "@/lib/photos";
import { getEffectiveTier, TIER_LABELS, type Tier } from "@/lib/tier";
import type { Item, ItemListRow } from "@/lib/types";

type ItemRowFromQuery = Item & {
  item_photos: { url: string; thumb_url: string | null; md_url: string | null }[] | null;
};

type TierPill = "todo" | Tier;

const TIER_PILLS: { value: TierPill; label: string }[] = [
  { value: "todo", label: "Todo" },
  { value: "equipo", label: TIER_LABELS.equipo },
  { value: "gangas", label: TIER_LABELS.gangas },
];

// Compact on purpose (the shared Pill is 48px tall): three of these and the
// "Ver vendidos" link have to share one row on a phone.
function TierPillButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`h-9 shrink-0 rounded-full border px-2.5 text-[13px] font-medium ${
        active ? "border-ink bg-ink text-white" : "border-line-strong bg-card text-ink"
      } ${disabled ? "opacity-50" : ""}`}
    >
      {children}
    </button>
  );
}

export default function ItemsList() {
  const supabase = createClient();
  const router = useRouter();
  const { role } = useSessionInfo();
  const [creating, setCreating] = useState(false);

  // Disponibles vs Vendidos lives in the URL (?vista=vendidos) rather than
  // in state, so opening a sold article and coming back lands on the same
  // view instead of dropping to Disponibles.
  const viewingSold = useSearchParams().get("vista") === "vendidos";
  // Which tier pill is selected: the list opens on Equipo y muebles. Only
  // narrows the default list: a search ignores it (see filteredItems).
  const [tierPill, setTierPill] = useState<TierPill>("equipo");

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
  // Single-select, not a Set like área/tipo — asc and desc are mutually
  // exclusive, and clicking the active one again clears it back to the
  // default. priceSort is only what was picked by hand (null = nothing
  // picked); activePriceSort is what's actually applied.
  const [priceSort, setPriceSort] = useState<"asc" | "desc" | null>(null);
  // Disponibles opens from most to least expensive. Vendidos shows no
  // prices, so it keeps the newest-first order.
  const defaultPriceSort: "asc" | "desc" | null = viewingSold ? null : "desc";
  const activePriceSort = priceSort ?? defaultPriceSort;

  function togglePriceSort(value: "asc" | "desc") {
    setPriceSort(activePriceSort === value ? null : value);
  }

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
          .select("*, item_photos(url, thumb_url, md_url)")
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
            status: effectiveStatus(item),
            primaryPhotoUrl: item_photos?.[0] ? thumbUrl(item_photos[0]) : null,
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

  // The main list is for_sale + reserved; sold articles only show in the
  // Vendidos view. Everything below (search, área/tipo, price sort) works
  // inside whichever of the two is on screen.
  const viewItems = useMemo(
    () => items.filter((i) => (viewingSold ? i.status === "sold" : i.status !== "sold")),
    [items, viewingSold],
  );
  const areaOptions = useMemo(
    () => Array.from(new Set(viewItems.map((i) => i.area).filter((a): a is string => !!a))).sort(),
    [viewItems],
  );
  const typeOptions = useMemo(
    () => Array.from(new Set(viewItems.map((i) => i.type).filter((t): t is string => !!t))).sort(),
    [viewItems],
  );
  const searching = search.trim() !== "";

  // Client-side filter, no database round-trip — the whole catalog is
  // ~55 rows, same reasoning cuentas-por-pagar-list.tsx gives for its
  // own client-side search.
  const filteredItems = useMemo(() => {
    let result = viewItems;
    // The pills are only the default filter: while a search is active it
    // looks across both tiers, so a typed ref# or name is never hidden by
    // the pill that happens to be selected. (No pills in Vendidos.)
    if (!viewingSold && !searching && tierPill !== "todo") {
      result = result.filter((i) => getEffectiveTier(i) === tierPill);
    }
    if (search.trim()) {
      const term = normalizeSearch(search.trim());
      result = result.filter(
        (i) =>
          normalizeSearch(i.name).includes(term) ||
          (i.description && normalizeSearch(i.description).includes(term)) ||
          (i.ref_code && normalizeSearch(i.ref_code).includes(term)),
      );
    }
    if (areaFiltro.size > 0) result = result.filter((i) => i.area && areaFiltro.has(i.area));
    if (typeFiltro.size > 0) result = result.filter((i) => i.type && typeFiltro.has(i.type));
    if (activePriceSort) {
      // Items with no price at all aren't "cheapest" or "priciest" —
      // push them to the end regardless of direction rather than let a
      // missing price masquerade as $0.
      result = [...result].sort((a, b) => {
        if (a.asking_price == null) return b.asking_price == null ? 0 : 1;
        if (b.asking_price == null) return -1;
        return activePriceSort === "asc" ? a.asking_price - b.asking_price : b.asking_price - a.asking_price;
      });
    }
    return result;
  }, [viewItems, viewingSold, searching, tierPill, search, areaFiltro, typeFiltro, activePriceSort]);

  const chips: FilterChip[] = [
    ...Array.from(areaFiltro).map((a) => ({ id: `area:${a}`, label: a })),
    ...Array.from(typeFiltro).map((t) => ({ id: `type:${t}`, label: t })),
    // The default order isn't a filter, so it gets no chip.
    ...(activePriceSort && activePriceSort !== defaultPriceSort
      ? [{ id: `price:${activePriceSort}`, label: activePriceSort === "asc" ? "Precio: menor a mayor" : "Precio: mayor a menor" }]
      : []),
  ];

  function handleRemoveChip(id: string) {
    const sep = id.indexOf(":");
    const kind = id.slice(0, sep);
    const value = id.slice(sep + 1);
    if (kind === "area") toggleArea(value);
    else if (kind === "type") toggleType(value);
    else if (kind === "price") setPriceSort(null);
  }

  const hasActiveFilters = search !== "" || areaFiltro.size > 0 || typeFiltro.size > 0 || activePriceSort !== defaultPriceSort;

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
        placeholder="Buscar artículo o ref."
        chips={chips}
        onRemoveChip={handleRemoveChip}
        onClearAll={
          hasActiveFilters
            ? () => {
                setSearch("");
                setAreaFiltro(new Set());
                setTypeFiltro(new Set());
                setPriceSort(null);
              }
            : undefined
        }
        sheetTitle="Filtrar"
        sheetContent={
          <div className="space-y-5">
            <div>
              <span className="mb-1.5 block text-xs font-bold tracking-wide text-ink-soft uppercase">Ordenar por precio</span>
              <div className="flex flex-wrap gap-2">
                <Pill active={activePriceSort === "asc"} onClick={() => togglePriceSort("asc")}>
                  Menor a mayor
                </Pill>
                <Pill active={activePriceSort === "desc"} onClick={() => togglePriceSort("desc")}>
                  Mayor a menor
                </Pill>
              </div>
            </div>

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

      {/* Hidden while loading so the first paint never shows a view the
          URL may not agree with. */}
      {!loading && !error && (
        <div className="px-3.5 pt-3">
          {viewingSold ? (
            <div className="flex items-center justify-between gap-3">
              <Link href="/items" className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Volver a disponibles
              </Link>
              <p className="text-sm text-ink-soft">Vendidos</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <div role="group" aria-label="Categoría" className="flex items-center gap-1.5">
                  {TIER_PILLS.map((pill) => (
                    <TierPillButton
                      key={pill.value}
                      // While searching, "Todo" is what is really applied.
                      active={(searching ? "todo" : tierPill) === pill.value}
                      disabled={searching}
                      onClick={() => setTierPill(pill.value)}
                    >
                      {pill.label}
                    </TierPillButton>
                  ))}
                </div>
                <Link
                  href="/items?vista=vendidos"
                  className="ml-auto flex h-9 items-center text-[13px] font-medium text-ink-soft underline underline-offset-2"
                >
                  Ver vendidos
                </Link>
              </div>
              {searching && <p className="mt-1.5 text-xs text-ink-soft">La búsqueda incluye todas las categorías.</p>}
            </>
          )}
        </div>
      )}

      {loading ? (
        <p className="p-4 text-sm text-ink-soft">Cargando...</p>
      ) : error ? (
        <p className="p-4 text-sm text-red-600">Error: {error}</p>
      ) : items.length === 0 ? (
        <p className="p-4 text-sm text-ink-soft">Sin artículos.</p>
      ) : viewItems.length === 0 ? (
        <p className="p-4 text-sm text-ink-soft">{viewingSold ? "Todavía no hay artículos vendidos." : "No hay artículos disponibles."}</p>
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
