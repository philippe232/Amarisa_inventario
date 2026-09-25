"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Flag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSessionInfo } from "@/lib/auth";
import { formatCurrency } from "@/lib/currency";
import { getDisplayName } from "@/lib/items";
import { normalizeSearch } from "@/lib/normalize-search";
import ConditionBadge from "@/components/ConditionBadge";
import StatusBadge from "@/components/StatusBadge";
import SearchFilterBar from "@/components/SearchFilterBar";
import type { Item, DataStatus } from "@/lib/types";

// Fixed area sequence, not alphabetical — matches the physical walk-
// through order the September count itself followed.
const AREA_ORDER = ["Cocina", "Piso", "Barra", "Panadería"];

type Row = Item & {
  photoCount: number;
  linkCount: number;
  notesRest: string | null;
  revisar: string | null;
};

// condition_notes carries an inline "[REVISAR: ...]" tag for anything
// the September cleanup couldn't resolve on its own (see clean_inventory.py)
// — split it out so it renders as its own flag instead of buried prose.
function extractRevisar(notes: string | null): { rest: string | null; revisar: string | null } {
  if (!notes) return { rest: null, revisar: null };
  const match = notes.match(/\[REVISAR:\s*([^\]]+)\]/);
  if (!match) return { rest: notes, revisar: null };
  const rest = (notes.slice(0, match.index) + notes.slice(match.index! + match[0].length)).replace(/\s*\|\s*$/, "").trim();
  return { rest: rest || null, revisar: match[1].trim() };
}

function dataStatusBadge(status: DataStatus | null) {
  if (status === "fetched")
    return (
      <span className="inline-flex items-center rounded-full border border-yellow/30 bg-yellow/10 px-2 py-0.5 text-[11px] font-bold text-yellow">
        Obtenido
      </span>
    );
  if (status === "verified")
    return (
      <span className="inline-flex items-center rounded-full border border-positive/30 bg-positive/10 px-2 py-0.5 text-[11px] font-bold text-positive">
        Verificado
      </span>
    );
  return <span className="text-ink-faint">—</span>;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" });
}

function PriceStack({ item }: { item: Row }) {
  const rows: [string, string][] = [];
  if (item.purchase_price != null) rows.push(["Compra", formatCurrency(item.purchase_price)]);
  if (item.reference_price != null) rows.push(["Referencia", formatCurrency(item.reference_price)]);
  if (item.suggested_resale_price != null) rows.push(["Sugerido", formatCurrency(item.suggested_resale_price)]);
  if (item.asking_price != null) rows.push(["Público", formatCurrency(item.asking_price)]);
  if (rows.length === 0) return <span className="text-ink-faint">Sin precio</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3 whitespace-nowrap">
          <span className="text-[11px] text-ink-faint">{label}</span>
          <span className="text-[12px] font-medium text-ink [font-variant-numeric:tabular-nums]">{value}</span>
        </div>
      ))}
      {item.discount_pct != null && (
        <span className="self-end rounded-full border border-positive/30 bg-positive/10 px-1.5 py-0.5 text-[10px] font-bold text-positive">
          -{item.discount_pct}%
        </span>
      )}
    </div>
  );
}

export default function RevisionList() {
  const supabase = createClient();
  const router = useRouter();
  const { role, loading: roleLoading } = useSessionInfo();

  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // This screen shows unmasked admin data (purchase price, reference
  // price, suggested resale, CFDI, etc.) — a Viewer/Bidder session has
  // no business here, same redirect-away shape wishlist-list.tsx uses
  // in reverse for Editor/Owner.
  useEffect(() => {
    if (!roleLoading && !role) router.replace("/items");
  }, [role, roleLoading, router]);

  useEffect(() => {
    if (!role) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      // items directly, not items_public — this screen IS the masked
      // view's audience. Photo/link counts come from two flat id lists
      // (both tables are tiny, no per-item count view exists for them)
      // rather than an embedded count aggregate.
      const [itemsRes, photosRes, linksRes] = await Promise.all([
        supabase.from("items").select("*"),
        supabase.from("item_photos").select("item_id"),
        supabase.from("item_links").select("item_id"),
      ]);
      if (cancelled) return;

      if (itemsRes.error) {
        setError(itemsRes.error.message);
        setLoading(false);
        return;
      }

      const photoCounts = new Map<string, number>();
      for (const row of photosRes.data ?? []) {
        photoCounts.set(row.item_id, (photoCounts.get(row.item_id) ?? 0) + 1);
      }
      const linkCounts = new Map<string, number>();
      for (const row of linksRes.data ?? []) {
        linkCounts.set(row.item_id, (linkCounts.get(row.item_id) ?? 0) + 1);
      }

      const rows: Row[] = (itemsRes.data as Item[]).map((item) => {
        const { rest, revisar } = extractRevisar(item.condition_notes);
        return {
          ...item,
          photoCount: photoCounts.get(item.id) ?? 0,
          linkCount: linkCounts.get(item.id) ?? 0,
          notesRest: rest,
          revisar,
        };
      });
      setItems(rows);
      setError(null);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, role]);

  const totalRevisar = useMemo(() => items.filter((i) => i.revisar).length, [items]);
  const totalNoPhoto = useMemo(() => items.filter((i) => i.photoCount === 0).length, [items]);
  const totalFetched = useMemo(() => items.filter((i) => i.data_status === "fetched").length, [items]);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const term = normalizeSearch(search.trim());
    return items.filter((i) =>
      [i.name, i.brand, i.model, i.serial_number, i.location, i.description]
        .filter(Boolean)
        .some((field) => normalizeSearch(field as string).includes(term)),
    );
  }, [items, search]);

  const grouped = useMemo(() => {
    const byArea = new Map<string, Row[]>();
    for (const item of filteredItems) {
      const area = item.area ?? "Sin área";
      if (!byArea.has(area)) byArea.set(area, []);
      byArea.get(area)!.push(item);
    }
    const orderedAreas = [
      ...AREA_ORDER.filter((a) => byArea.has(a)),
      ...Array.from(byArea.keys()).filter((a) => !AREA_ORDER.includes(a)),
    ];
    return orderedAreas.map((area) => ({ area, rows: byArea.get(area)!, total: items.filter((i) => (i.area ?? "Sin área") === area).length }));
  }, [filteredItems, items]);

  function toggleArea(area: string) {
    setCollapsed((prev) => ({ ...prev, [area]: !prev[area] }));
  }

  if (roleLoading || !role) return <p className="p-4 text-sm text-ink-soft">Cargando...</p>;

  return (
    <>
      <SearchFilterBar value={search} onChange={setSearch} placeholder="Buscar por nombre, ubicación, marca, modelo o serie" />

      <div className="px-3.5 py-3">
        {loading ? (
          <p className="p-4 text-sm text-ink-soft">Cargando...</p>
        ) : error ? (
          <p className="p-4 text-sm text-red-600">Error: {error}</p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-line bg-card p-3">
                <p className="text-xl font-bold text-ink [font-variant-numeric:tabular-nums]">{items.length}</p>
                <p className="text-xs text-ink-soft">Total artículos</p>
              </div>
              <div className="rounded-md border border-line bg-card p-3">
                <p className="text-xl font-bold text-negative [font-variant-numeric:tabular-nums]">{totalRevisar}</p>
                <p className="text-xs text-ink-soft">Para revisar</p>
              </div>
              <div className="rounded-md border border-line bg-card p-3">
                <p className="text-xl font-bold text-negative [font-variant-numeric:tabular-nums]">{totalNoPhoto}</p>
                <p className="text-xs text-ink-soft">Sin fotos</p>
              </div>
              <div className="rounded-md border border-line bg-card p-3">
                <p className="text-xl font-bold text-yellow [font-variant-numeric:tabular-nums]">{totalFetched}</p>
                <p className="text-xs text-ink-soft">Obtenidos (Claude)</p>
              </div>
            </div>

            {grouped.length === 0 ? (
              <p className="p-4 text-sm text-ink-soft">Sin resultados.</p>
            ) : (
              grouped.map(({ area, rows, total }) => {
                const forcedOpen = search.trim().length > 0;
                const isCollapsed = !forcedOpen && collapsed[area];
                const revisarCount = rows.filter((r) => r.revisar).length;

                return (
                  <div key={area} className="mb-3 overflow-hidden rounded-md border border-line bg-card">
                    <button
                      type="button"
                      onClick={() => toggleArea(area)}
                      className="flex min-h-11 w-full items-center gap-2 bg-page px-3 py-2 text-left"
                    >
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-ink-faint transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-bold text-ink">{area}</span>
                      <span className="text-xs text-ink-soft [font-variant-numeric:tabular-nums]">
                        {rows.length}
                        {rows.length !== total ? ` de ${total}` : ""} artículos
                      </span>
                      {revisarCount > 0 && (
                        <span className="ml-auto flex items-center gap-1 rounded-full border border-negative/30 bg-negative/10 px-2 py-0.5 text-[11px] font-bold text-negative">
                          <Flag className="h-3 w-3" aria-hidden="true" />
                          {revisarCount} para revisar
                        </span>
                      )}
                    </button>

                    {!isCollapsed && (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1400px] border-collapse">
                          <thead>
                            <tr className="border-b border-line bg-page/60 text-left text-[10px] font-bold tracking-wide text-ink-soft uppercase">
                              <th className="px-2.5 py-2">Datos</th>
                              <th className="px-2.5 py-2">Artículo</th>
                              <th className="px-2.5 py-2">Ubicación</th>
                              <th className="px-2.5 py-2">Cant.</th>
                              <th className="px-2.5 py-2">Serie</th>
                              <th className="px-2.5 py-2">Condición</th>
                              <th className="px-2.5 py-2">Años</th>
                              <th className="px-2.5 py-2">Notas</th>
                              <th className="px-2.5 py-2">Fotos/Refs</th>
                              <th className="px-2.5 py-2">Precios</th>
                              <th className="px-2.5 py-2">Venta</th>
                              <th className="px-2.5 py-2">Actualizado</th>
                              <th className="px-2.5 py-2">Abrir</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((item) => {
                              const displayName = getDisplayName(item);
                              const identity = [item.brand, item.model].filter(Boolean).join(" · ");
                              return (
                                <tr
                                  key={item.id}
                                  className={`border-b border-line text-sm last:border-0 ${item.revisar ? "bg-negative/5" : ""}`}
                                >
                                  <td className="px-2.5 py-2 align-top">{dataStatusBadge(item.data_status)}</td>
                                  <td className="px-2.5 py-2 align-top">
                                    <p className="font-semibold text-ink">{displayName}</p>
                                    {identity && <p className="text-xs text-ink-soft">{identity}</p>}
                                    {item.description && <p className="text-xs text-ink-soft">{item.description}</p>}
                                  </td>
                                  <td className="px-2.5 py-2 align-top text-ink">{item.location ?? <span className="text-ink-faint">—</span>}</td>
                                  <td className="px-2.5 py-2 align-top text-ink [font-variant-numeric:tabular-nums]">{item.quantity}</td>
                                  <td className="px-2.5 py-2 align-top text-ink">{item.serial_number ?? <span className="text-ink-faint">—</span>}</td>
                                  <td className="px-2.5 py-2 align-top">
                                    {item.condition_rating ? <ConditionBadge rating={item.condition_rating} /> : <span className="text-ink-faint">—</span>}
                                  </td>
                                  <td className="px-2.5 py-2 align-top text-ink [font-variant-numeric:tabular-nums]">
                                    {item.years_in_use ?? <span className="text-ink-faint">—</span>}
                                  </td>
                                  <td className="max-w-[260px] px-2.5 py-2 align-top text-ink">
                                    {item.notesRest ?? <span className="text-ink-faint">—</span>}
                                    {item.revisar && (
                                      <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-negative">
                                        <Flag className="h-3 w-3 shrink-0" aria-hidden="true" />
                                        {item.revisar}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-2.5 py-2 align-top text-ink [font-variant-numeric:tabular-nums] whitespace-nowrap">
                                    {item.photoCount} f · {item.linkCount} r
                                  </td>
                                  <td className="px-2.5 py-2 align-top">
                                    <PriceStack item={item} />
                                  </td>
                                  <td className="px-2.5 py-2 align-top">
                                    <StatusBadge status={item.status} />
                                  </td>
                                  <td className="px-2.5 py-2 align-top text-ink-faint [font-variant-numeric:tabular-nums] whitespace-nowrap">
                                    {fmtDate(item.updated_at)}
                                  </td>
                                  <td className="px-2.5 py-2 align-top">
                                    <Link href={`/items/${item.id}`} className="text-sm font-medium text-ink underline">
                                      Ver
                                    </Link>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </>
  );
}
