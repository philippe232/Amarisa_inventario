"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Flag, ImageOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSessionInfo } from "@/lib/auth";
import { formatCurrency } from "@/lib/currency";
import { formatDimensions, getDisplayName } from "@/lib/items";
import { normalizeSearch } from "@/lib/normalize-search";
import ConditionBadge from "@/components/ConditionBadge";
import StatusBadge from "@/components/StatusBadge";
import SearchFilterBar from "@/components/SearchFilterBar";
import type { Item, DataStatus } from "@/lib/types";

// Fixed area sequence, not alphabetical — matches the physical walk-
// through order the September count itself followed.
const AREA_ORDER = ["Cocina", "Piso", "Barra", "Panadería"];

type Row = Item & {
  photoUrl: string | null;
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

function money(v: number | null): React.ReactNode {
  return v != null ? formatCurrency(v) : <span className="text-ink-faint">—</span>;
}

function text(v: string | null): React.ReactNode {
  return v ? v : <span className="text-ink-faint">—</span>;
}

// Signs a short-lived URL on demand, same as item-edit-form.tsx's
// FacturaPdfUpload/item-detail.tsx's handleViewFactura — the
// "item-documents" bucket is private, factura_pdf is a storage path,
// not a fetchable URL.
function FacturaPdfLink({ path }: { path: string | null }) {
  const supabase = createClient();
  const [opening, setOpening] = useState(false);
  if (!path) return <span className="text-ink-faint">—</span>;

  async function handleView() {
    setOpening(true);
    const { data } = await supabase.storage.from("item-documents").createSignedUrl(path!, 60);
    setOpening(false);
    if (data) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <button type="button" onClick={handleView} disabled={opening} className="text-sm font-medium text-ink underline disabled:opacity-50">
      {opening ? "Abriendo..." : "Ver PDF"}
    </button>
  );
}

// Mirrors item-edit-form.tsx's own section grouping 1:1 (Encabezado /
// Descripción / Estado del artículo / Precio, plus Fotos y referencias
// for item_photos/item_links) — every toggleable column belongs to
// exactly one of these, so turning a group off always corresponds to a
// whole section of the edit form, not an arbitrary column subset.
type GroupKey = "encabezado" | "descripcion" | "estado" | "precio" | "fotos";

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "encabezado", label: "Encabezado" },
  { key: "descripcion", label: "Descripción" },
  { key: "estado", label: "Estado del artículo" },
  { key: "precio", label: "Precio" },
  { key: "fotos", label: "Fotos y referencias" },
];

type ColumnDef = {
  key: string;
  group: GroupKey;
  label: string;
  render: (item: Row) => React.ReactNode;
};

const COLUMNS: ColumnDef[] = [
  // Encabezado
  { key: "quantity", group: "encabezado", label: "Cant.", render: (i) => <span className="[font-variant-numeric:tabular-nums]">{i.quantity}</span> },
  { key: "status", group: "encabezado", label: "Venta", render: (i) => <StatusBadge status={i.status} /> },
  { key: "data_status", group: "encabezado", label: "Datos", render: (i) => dataStatusBadge(i.data_status) },
  // Descripción
  { key: "type", group: "descripcion", label: "Tipo", render: (i) => text(i.type) },
  { key: "location", group: "descripcion", label: "Ubicación", render: (i) => text(i.location) },
  { key: "brand", group: "descripcion", label: "Marca", render: (i) => text(i.brand) },
  { key: "model", group: "descripcion", label: "Modelo", render: (i) => text(i.model) },
  { key: "serial_number", group: "descripcion", label: "Serie", render: (i) => text(i.serial_number) },
  { key: "dimensions", group: "descripcion", label: "Dimensiones", render: (i) => text(formatDimensions(i)) },
  { key: "description", group: "descripcion", label: "Detalles", render: (i) => text(i.description) },
  // Estado del artículo
  {
    key: "condition_rating",
    group: "estado",
    label: "Condición",
    render: (i) => (i.condition_rating ? <ConditionBadge rating={i.condition_rating} /> : <span className="text-ink-faint">—</span>),
  },
  { key: "years_in_use", group: "estado", label: "Años", render: (i) => (i.years_in_use != null ? i.years_in_use : <span className="text-ink-faint">—</span>) },
  {
    key: "condition_notes",
    group: "estado",
    label: "Notas de condición",
    render: (i) => (
      <>
        {text(i.notesRest)}
        {i.revisar && (
          <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-negative">
            <Flag className="h-3 w-3 shrink-0" aria-hidden="true" />
            {i.revisar}
          </span>
        )}
      </>
    ),
  },
  { key: "maintenance_notes", group: "estado", label: "Notas de mantenimiento", render: (i) => text(i.maintenance_notes) },
  // Precio
  { key: "purchase_price", group: "precio", label: "Compra", render: (i) => money(i.purchase_price) },
  { key: "reference_price", group: "precio", label: "Referencia", render: (i) => money(i.reference_price) },
  { key: "suggested_resale_price", group: "precio", label: "Sugerido", render: (i) => money(i.suggested_resale_price) },
  { key: "asking_price", group: "precio", label: "Público", render: (i) => money(i.asking_price) },
  {
    key: "discount_pct",
    group: "precio",
    label: "Descuento",
    render: (i) =>
      i.discount_pct != null ? (
        <span className="rounded-full border border-positive/30 bg-positive/10 px-1.5 py-0.5 text-[11px] font-bold text-positive">-{i.discount_pct}%</span>
      ) : (
        <span className="text-ink-faint">—</span>
      ),
  },
  {
    key: "has_factura",
    group: "precio",
    label: "Factura",
    render: (i) => (i.has_factura == null ? <span className="text-ink-faint">—</span> : i.has_factura ? "Sí" : "No"),
  },
  { key: "factura_cfdi", group: "precio", label: "CFDI", render: (i) => text(i.factura_cfdi) },
  { key: "factura_pdf", group: "precio", label: "PDF", render: (i) => <FacturaPdfLink path={i.factura_pdf} /> },
  // Fotos y referencias
  {
    key: "photos",
    group: "fotos",
    label: "Fotos",
    render: (i) => (
      <div className="flex items-center gap-1.5">
        {i.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={i.photoUrl} alt="" className="h-8 w-8 shrink-0 rounded border border-line object-cover" />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-line bg-page text-ink-faint">
            <ImageOff className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
        <span className="rounded-full border border-line-strong bg-page px-1.5 py-0.5 text-[10px] font-bold text-ink-soft [font-variant-numeric:tabular-nums]">
          {i.photoCount}
        </span>
      </div>
    ),
  },
  {
    key: "links",
    group: "fotos",
    label: "Refs",
    render: (i) => (
      <span className="rounded-full border border-line-strong bg-page px-1.5 py-0.5 text-[10px] font-bold text-ink-soft [font-variant-numeric:tabular-nums]">
        {i.linkCount}
      </span>
    ),
  },
];

export default function RevisionList() {
  const supabase = createClient();
  const router = useRouter();
  const { role, loading: roleLoading } = useSessionInfo();

  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // All five sections visible by default — "show every column", with the
  // ability to shrink the table down to just the section(s) in question
  // once it's clearly too wide to scan at once.
  const [visibleGroups, setVisibleGroups] = useState<Set<GroupKey>>(new Set(GROUPS.map((g) => g.key)));

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
      // view's audience. item_photos ordered by sort_order so [0] per
      // item is always the primary photo (same convention as
      // items-list.tsx). Link count is a flat id list — the table's
      // tiny enough that no per-item count view exists for it.
      const [itemsRes, photosRes, linksRes] = await Promise.all([
        supabase.from("items").select("*"),
        supabase.from("item_photos").select("item_id, url").order("sort_order"),
        supabase.from("item_links").select("item_id"),
      ]);
      if (cancelled) return;

      if (itemsRes.error) {
        setError(itemsRes.error.message);
        setLoading(false);
        return;
      }

      const photoUrls = new Map<string, string>();
      const photoCounts = new Map<string, number>();
      for (const row of photosRes.data ?? []) {
        if (!photoUrls.has(row.item_id)) photoUrls.set(row.item_id, row.url);
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
          photoUrl: photoUrls.get(item.id) ?? null,
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

  function toggleGroup(key: GroupKey) {
    setVisibleGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const activeColumns = useMemo(() => COLUMNS.filter((c) => visibleGroups.has(c.group)), [visibleGroups]);
  const tableMinWidth = 220 + activeColumns.length * 150 + 220;

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

            {/* Global column-group toggles — the table gets very wide with
                every section on, so these let the columns shrink down to
                just the section(s) in question. Applies to every área's
                table at once, since the sections are the same everywhere. */}
            <div className="mb-4 flex flex-wrap gap-1.5">
              {GROUPS.map((g) => {
                const active = visibleGroups.has(g.key);
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => toggleGroup(g.key)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      active ? "border-ink bg-ink text-white" : "border-line-strong bg-card text-ink-soft"
                    }`}
                  >
                    {g.label}
                  </button>
                );
              })}
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
                        <table className="w-full border-collapse" style={{ minWidth: tableMinWidth }}>
                          <thead>
                            <tr className="border-b border-line bg-page/60 text-left text-[10px] font-bold tracking-wide text-ink-soft uppercase">
                              <th className="px-2.5 py-2">Artículo</th>
                              {activeColumns.map((c) => (
                                <th key={c.key} className="px-2.5 py-2">
                                  {c.label}
                                </th>
                              ))}
                              <th className="px-2.5 py-2">Actualizado</th>
                              <th className="px-2.5 py-2">Abrir</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((item) => {
                              const displayName = getDisplayName(item);
                              return (
                                <tr
                                  key={item.id}
                                  className={`border-b border-line text-sm last:border-0 ${item.revisar ? "bg-negative/5" : ""}`}
                                >
                                  <td className="px-2.5 py-2 align-top font-semibold text-ink">{displayName}</td>
                                  {activeColumns.map((c) => (
                                    <td key={c.key} className="max-w-[220px] px-2.5 py-2 align-top text-ink">
                                      {c.render(item)}
                                    </td>
                                  ))}
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
