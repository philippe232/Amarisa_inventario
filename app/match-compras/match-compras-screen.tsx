"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSessionInfo } from "@/lib/auth";
import { formatCurrency } from "@/lib/currency";
import { getDisplayName } from "@/lib/items";
import SearchFilterBar, { type FilterChip } from "@/components/SearchFilterBar";
import Pill from "@/components/Pill";
import { rankCandidatesForItem } from "@/lib/gasto-matching/score.mjs";
import { TIER_OPTIONS, TIER_LABELS, TIER_COLORS, STATUS_LABELS, STATUS_COLORS } from "@/lib/gasto-matching/status";
import type { GastoLine, ItemMatchCandidate, ItemPurchaseMatch, PurchaseMatchStatus, MatchTier } from "@/lib/gasto-matching/types";
import type { Item } from "@/lib/types";

// rankCandidatesForItem comes from a plain .mjs module (shared with the
// Node CLI scripts — see lib/gasto-matching/score.mjs), so TS sees it as
// untyped; this describes its actual return shape for the one call site
// (handleRecalculate) that needs to read the result's fields.
type RankedCandidate = { uid_itemc: string; score: number; tier: MatchTier; rank: number; breakdown: Record<string, number> };

const NONE = "__none__";
const AREA_ORDER = ["Cocina", "Piso", "Barra", "Panadería"];
const PRICE_REFERENCE_THRESHOLD = 500; // decision #1 — cheap bulk items get the lighter "precio de referencia" path

// Explicit column lists for every gasto_lines/gasto_notas embed —
// deliberately never `*`. Both tables carry a `raw jsonb` archival
// column (the original AppSheet row, dozens of fields) that nothing in
// this UI reads; embedding it under RLS turned a sub-second query into
// a ~7s one (measured directly against the PostgREST endpoint), since
// PostgREST evaluates the nested resource per matched row. Keep this in
// sync with GastoLine/GastoNota in lib/gasto-matching/types.ts, minus `raw`.
const GASTO_NOTA_FIELDS =
  "uid_gasto,ref_notac,ref_proveedor,proveedor_nombre,fecha_op,locacion,area,total_neto,factura_timbrada,cfdi_raw,cfdi_uuid,cfdi_resolved,cfdi_source,cfdi_conflict,cfdi_suspect,comentario,foto_url";
const GASTO_LINE_FIELDS = `uid_itemc,uid_nota,ref_notac,descripcion,fecha_op,locacion,area,uds,precio_por_ud,total_neto,ref_proveedor,clase,categoria,subcategoria,tipo,comentarios,is_candidate,gasto_notas(${GASTO_NOTA_FIELDS})`;

type QueueItem = Pick<
  Item,
  "id" | "name" | "description" | "brand" | "model" | "area" | "type" | "quantity" | "ref_code" | "purchase_price" | "has_factura" | "factura_cfdi"
> & { photoUrl: string | null };

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" });
}

// Same fallback the confirm form pre-fills with: ItemC_$PorUD_NETO when
// present, else total ÷ units (equal to the line total when units = 1) —
// several older rows have a null per-unit price even at UDs = 1 (a real
// source-data gap, not a bug — see db/extract-gastos.py).
function defaultUnitCost(line: GastoLine, units: number): number | null {
  if (line.precio_por_ud != null) return Number(line.precio_por_ud);
  if (line.total_neto != null && units > 0) return Number(line.total_neto) / units;
  return null;
}

export default function MatchComprasScreen() {
  const router = useRouter();
  const { role, loading: roleLoading, email } = useSessionInfo();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [candidatesByItem, setCandidatesByItem] = useState<Map<string, ItemMatchCandidate[]>>(new Map());
  const [activeMatchByItem, setActiveMatchByItem] = useState<Map<string, ItemPurchaseMatch>>(new Map());
  const [recalculating, setRecalculating] = useState(false);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tierFiltro, setTierFiltro] = useState<Set<MatchTier>>(new Set());
  const [areaFiltro, setAreaFiltro] = useState<Set<string>>(new Set());
  const [statusFiltro, setStatusFiltro] = useState<Set<PurchaseMatchStatus | typeof NONE>>(new Set());

  useEffect(() => {
    if (!roleLoading && !role) router.replace("/items");
  }, [role, roleLoading, router]);

  useEffect(() => {
    if (!role) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [itemsRes, candidatesRes, matchesRes] = await Promise.all([
        supabase
          .from("items")
          .select("id, name, description, brand, model, area, type, quantity, ref_code, purchase_price, has_factura, factura_cfdi, item_photos(url)")
          .order("sort_order", { referencedTable: "item_photos" })
          .order("name"),
        supabase
          .from("item_match_candidates")
          .select(`id,item_id,uid_itemc,score,tier,rank,score_breakdown,gasto_lines(${GASTO_LINE_FIELDS})`)
          .order("item_id")
          .order("rank"),
        supabase.from("item_purchase_matches").select("*").eq("is_active", true),
      ]);
      if (cancelled) return;

      if (itemsRes.error || candidatesRes.error || matchesRes.error) {
        setError(itemsRes.error?.message ?? candidatesRes.error?.message ?? matchesRes.error?.message ?? "Error");
        setLoading(false);
        return;
      }

      setItems(
        (itemsRes.data ?? []).map((row) => {
          const photos = (row as unknown as { item_photos: { url: string }[] }).item_photos;
          return { ...row, photoUrl: photos?.[0]?.url ?? null } as QueueItem;
        }),
      );

      const byItem = new Map<string, ItemMatchCandidate[]>();
      for (const c of (candidatesRes.data ?? []) as unknown as ItemMatchCandidate[]) {
        if (!byItem.has(c.item_id)) byItem.set(c.item_id, []);
        byItem.get(c.item_id)!.push(c);
      }
      setCandidatesByItem(byItem);

      const byItemMatch = new Map<string, ItemPurchaseMatch>();
      for (const m of (matchesRes.data ?? []) as ItemPurchaseMatch[]) byItemMatch.set(m.item_id, m);
      setActiveMatchByItem(byItemMatch);

      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, role]);

  // "used by N items" — how many OTHER active matches already point at
  // the same gasto_line, across every item, not just the selected one.
  const usedByCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of activeMatchByItem.values()) {
      if (!m.uid_itemc) continue;
      counts.set(m.uid_itemc, (counts.get(m.uid_itemc) ?? 0) + 1);
    }
    return counts;
  }, [activeMatchByItem]);

  const reviewedCount = activeMatchByItem.size;

  const areaOptions = useMemo(() => {
    const set = new Set(items.map((i) => i.area).filter((a): a is string => Boolean(a)));
    return AREA_ORDER.filter((a) => set.has(a)).concat([...set].filter((a) => !AREA_ORDER.includes(a)));
  }, [items]);

  function itemTier(itemId: string): MatchTier | null {
    return candidatesByItem.get(itemId)?.[0]?.tier ?? null;
  }
  function itemStatus(itemId: string): PurchaseMatchStatus | null {
    return activeMatchByItem.get(itemId)?.status ?? null;
  }

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (q) {
        const hay = [item.name, item.description, item.brand, item.model].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (tierFiltro.size > 0) {
        const tier = candidatesByItem.get(item.id)?.[0]?.tier ?? null;
        if (!tier || !tierFiltro.has(tier)) return false;
      }
      if (areaFiltro.size > 0 && !(item.area && areaFiltro.has(item.area))) return false;
      if (statusFiltro.size > 0) {
        const status = activeMatchByItem.get(item.id)?.status ?? null;
        const matchesNone = statusFiltro.has(NONE) && !status;
        const matchesSet = status != null && statusFiltro.has(status);
        if (!matchesNone && !matchesSet) return false;
      }
      return true;
    });
  }, [items, search, tierFiltro, areaFiltro, statusFiltro, candidatesByItem, activeMatchByItem]);

  const chips: FilterChip[] = [
    ...[...tierFiltro].map((t) => ({ id: `tier:${t}`, label: TIER_LABELS[t] })),
    ...[...areaFiltro].map((a) => ({ id: `area:${a}`, label: a })),
    ...[...statusFiltro].map((s) => ({ id: `status:${s}`, label: s === NONE ? "Pendiente" : STATUS_LABELS[s] })),
  ];
  function handleRemoveChip(id: string) {
    const [kind, value] = id.split(":");
    if (kind === "tier") setTierFiltro((prev) => new Set([...prev].filter((v) => v !== value)));
    if (kind === "area") setAreaFiltro((prev) => new Set([...prev].filter((v) => v !== value)));
    if (kind === "status") setStatusFiltro((prev) => new Set([...prev].filter((v) => v !== value)));
  }
  function toggle<T>(set: Set<T>, value: T, setter: (s: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  }

  const selectedItem = items.find((i) => i.id === selectedItemId) ?? null;

  // --- write-back ----------------------------------------------------
  async function saveMatch(itemId: string, patch: Omit<ItemPurchaseMatch, "id" | "item_id" | "is_active" | "reviewed_by" | "reviewed_at">) {
    const existing = activeMatchByItem.get(itemId);
    if (existing) {
      await supabase.from("item_purchase_matches").update({ is_active: false }).eq("id", existing.id);
    }
    const { data, error: insertError } = await supabase
      .from("item_purchase_matches")
      .insert({ ...patch, item_id: itemId, is_active: true, reviewed_by: email, reviewed_at: new Date().toISOString() })
      .select()
      .single();
    if (insertError || !data) {
      setError(insertError?.message ?? "No se pudo guardar");
      return;
    }

    const itemPatch: Partial<Item> = {
      purchase_price: patch.unit_cost,
      has_factura: Boolean(patch.cfdi_uuid),
      factura_cfdi: patch.cfdi_uuid,
    };
    const { error: itemError } = await supabase.from("items").update(itemPatch).eq("id", itemId);
    if (itemError) {
      setError(itemError.message);
      return;
    }

    setActiveMatchByItem((prev) => new Map(prev).set(itemId, data as ItemPurchaseMatch));
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...itemPatch } : i)));
  }

  // "Descartar" — this candidate is definitely not the purchase for this
  // item. Removes it from item_match_candidates right away (so it's just
  // gone, not merely hidden) and records the exclusion in
  // item_candidate_rejections so a future Recalcular never re-suggests
  // it, even though that table's own rows get freely deleted/reinserted
  // on every recompute.
  async function handleReject(itemId: string, candidate: ItemMatchCandidate) {
    setCandidatesByItem((prev) => {
      const next = new Map(prev);
      next.set(itemId, (next.get(itemId) ?? []).filter((c) => c.id !== candidate.id));
      return next;
    });

    const [{ error: deleteError }, { error: insertError }] = await Promise.all([
      supabase.from("item_match_candidates").delete().eq("id", candidate.id),
      supabase.from("item_candidate_rejections").insert({ item_id: itemId, uid_itemc: candidate.uid_itemc, rejected_by: email }),
    ]);
    if (deleteError || insertError) {
      setError(deleteError?.message ?? insertError?.message ?? "No se pudo descartar");
    }
  }

  // --- recalculate (browser-side, skips confirmado items) ------------
  async function handleRecalculate() {
    setRecalculating(true);
    setError(null);
    try {
      const [{ data: lines, error: linesError }, { data: rejections, error: rejectionsError }] = await Promise.all([
        supabase.from("gasto_lines").select("uid_itemc, descripcion, locacion, area, precio_por_ud, uds, total_neto").eq("is_candidate", true),
        supabase.from("item_candidate_rejections").select("item_id, uid_itemc"),
      ]);
      if (linesError || !lines) throw new Error(linesError?.message ?? "Error");
      if (rejectionsError) throw new Error(rejectionsError.message);

      const rejectedByItem = new Map<string, Set<string>>();
      for (const r of rejections ?? []) {
        if (!rejectedByItem.has(r.item_id)) rejectedByItem.set(r.item_id, new Set());
        rejectedByItem.get(r.item_id)!.add(r.uid_itemc);
      }

      const confirmedIds = new Set([...activeMatchByItem.entries()].filter(([, m]) => m.status === "confirmado").map(([id]) => id));
      const toScore = items.filter((i) => !confirmedIds.has(i.id));

      const newRows: Record<string, unknown>[] = [];
      const newByItem = new Map(candidatesByItem);
      for (const item of toScore) {
        const rejected = rejectedByItem.get(item.id);
        const pool = rejected ? (lines as GastoLine[]).filter((l) => !rejected.has(l.uid_itemc)) : (lines as GastoLine[]);
        const ranked = rankCandidatesForItem(item, pool, 10) as RankedCandidate[];
        newByItem.set(
          item.id,
          ranked.map((r) => ({ ...r, item_id: item.id })) as unknown as ItemMatchCandidate[],
        );
        for (const r of ranked) {
          newRows.push({ item_id: item.id, uid_itemc: r.uid_itemc, score: r.score, tier: r.tier, rank: r.rank, score_breakdown: r.breakdown });
        }
      }

      const idsToClear = toScore.map((i) => i.id);
      if (idsToClear.length > 0) {
        await supabase.from("item_match_candidates").delete().in("item_id", idsToClear);
      }
      if (newRows.length > 0) {
        const { error: insertError } = await supabase.from("item_match_candidates").insert(newRows);
        if (insertError) throw new Error(insertError.message);
      }

      // Re-fetch the nested shape (gasto_lines/gasto_notas) rather than
      // trying to stitch it together client-side from the raw `lines`
      // projection above, which is missing fields the detail panel needs.
      const { data: refreshed } = await supabase
        .from("item_match_candidates")
        .select(`id,item_id,uid_itemc,score,tier,rank,score_breakdown,gasto_lines(${GASTO_LINE_FIELDS})`)
        .order("item_id")
        .order("rank");
      const byItem = new Map<string, ItemMatchCandidate[]>();
      for (const c of (refreshed ?? []) as unknown as ItemMatchCandidate[]) {
        if (!byItem.has(c.item_id)) byItem.set(c.item_id, []);
        byItem.get(c.item_id)!.push(c);
      }
      setCandidatesByItem(byItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al recalcular");
    } finally {
      setRecalculating(false);
    }
  }

  if (roleLoading || !role) return <p className="p-4 text-sm text-ink-soft">Cargando...</p>;

  return (
    <div className="pb-8">
      <SearchFilterBar
        value={search}
        onChange={setSearch}
        placeholder="Buscar artículo..."
        chips={chips}
        onRemoveChip={handleRemoveChip}
        onClearAll={() => {
          setTierFiltro(new Set());
          setAreaFiltro(new Set());
          setStatusFiltro(new Set());
        }}
        sheetTitle="Filtrar"
        sheetContent={
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Nivel de coincidencia</p>
              <div className="flex flex-wrap gap-2">
                {TIER_OPTIONS.map((o) => (
                  <Pill key={o.value} active={tierFiltro.has(o.value)} onClick={() => toggle(tierFiltro, o.value, setTierFiltro)}>
                    {o.label}
                  </Pill>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Área</p>
              <div className="flex flex-wrap gap-2">
                {areaOptions.map((a) => (
                  <Pill key={a} active={areaFiltro.has(a)} onClick={() => toggle(areaFiltro, a, setAreaFiltro)}>
                    {a}
                  </Pill>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-ink">Estado de revisión</p>
              <div className="flex flex-wrap gap-2">
                <Pill active={statusFiltro.has(NONE)} onClick={() => toggle(statusFiltro, NONE, setStatusFiltro)}>
                  Pendiente
                </Pill>
                {STATUS_LABELS.confirmado && (
                  <Pill active={statusFiltro.has("confirmado")} onClick={() => toggle(statusFiltro, "confirmado", setStatusFiltro)}>
                    Confirmado
                  </Pill>
                )}
                <Pill active={statusFiltro.has("sin_registro")} onClick={() => toggle(statusFiltro, "sin_registro", setStatusFiltro)}>
                  Sin registro
                </Pill>
                <Pill active={statusFiltro.has("precio_referencia")} onClick={() => toggle(statusFiltro, "precio_referencia", setStatusFiltro)}>
                  Precio de referencia
                </Pill>
              </div>
            </div>
          </div>
        }
      />

      <div className="flex items-center justify-between gap-2 px-3.5 py-2">
        <p className="text-sm text-ink-soft">
          {reviewedCount} de {items.length} revisados
        </p>
        <button
          type="button"
          onClick={handleRecalculate}
          disabled={recalculating || loading}
          className="flex min-h-9 items-center gap-1.5 rounded-md border border-line-strong bg-card px-3 text-sm font-medium text-ink disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${recalculating ? "animate-spin" : ""}`} aria-hidden="true" />
          {recalculating ? "Recalculando..." : "Recalcular"}
        </button>
      </div>

      {error && <p className="px-3.5 py-2 text-sm text-red-600">Error: {error}</p>}

      {loading ? (
        <p className="p-4 text-sm text-ink-soft">Cargando...</p>
      ) : (
        <div className="md:grid md:grid-cols-[360px_1fr] md:items-start md:gap-4 md:px-3.5">
          <div
            className={`${selectedItemId ? "hidden md:block" : ""} space-y-1.5 px-3.5 md:overflow-y-auto md:px-0 md:[height:calc(100dvh-220px)]`}
          >
            {filteredItems.map((item) => {
              const tier = itemTier(item.id);
              const status = itemStatus(item.id);
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
                    <p className="truncate text-xs text-ink-soft">{item.area ?? "—"}</p>
                  </div>
                  {status && (
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_COLORS[status]}`}>
                      {STATUS_LABELS[status]}
                    </span>
                  )}
                  {!status && tier && (
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${TIER_COLORS[tier]}`}>
                      {TIER_LABELS[tier]}
                    </span>
                  )}
                </button>
              );
            })}
            {filteredItems.length === 0 && <p className="p-4 text-sm text-ink-soft">Sin artículos.</p>}
          </div>

          <div
            className={`${selectedItemId ? "" : "hidden md:block"} px-3.5 md:overflow-y-auto md:px-0 md:[height:calc(100dvh-220px)]`}
          >
            {selectedItem ? (
              <ItemDetailPanel
                key={selectedItem.id}
                item={selectedItem}
                candidates={candidatesByItem.get(selectedItem.id) ?? []}
                activeMatch={activeMatchByItem.get(selectedItem.id) ?? null}
                usedByCount={usedByCount}
                onBack={() => setSelectedItemId(null)}
                onSave={saveMatch}
                onReject={handleReject}
                supabase={supabase}
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
// Detail panel: item info + ranked candidates + Elegir/Buscar/Sin
// registro actions + the confirm form.
// --------------------------------------------------------------------
function ItemDetailPanel({
  item,
  candidates,
  activeMatch,
  usedByCount,
  onBack,
  onSave,
  onReject,
  supabase,
}: {
  item: QueueItem;
  candidates: ItemMatchCandidate[];
  activeMatch: ItemPurchaseMatch | null;
  usedByCount: Map<string, number>;
  onBack: () => void;
  onSave: (itemId: string, patch: Omit<ItemPurchaseMatch, "id" | "item_id" | "is_active" | "reviewed_by" | "reviewed_at">) => Promise<void>;
  onReject: (itemId: string, candidate: ItemMatchCandidate) => Promise<void>;
  supabase: ReturnType<typeof createClient>;
}) {
  const [confirming, setConfirming] = useState<GastoLine | null>(null);
  const [buscarOpen, setBuscarOpen] = useState(false);
  const [sinRegistroOpen, setSinRegistroOpen] = useState(false);

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
          {item.description && <p className="mt-1 text-sm text-ink-soft">{item.description}</p>}
        </div>
      </div>

      {activeMatch && (
        <div className={`rounded-md border p-3 text-sm ${STATUS_COLORS[activeMatch.status]}`}>
          <p className="font-bold">{STATUS_LABELS[activeMatch.status]}</p>
          {activeMatch.unit_cost != null && <p>Costo unitario: {formatCurrency(activeMatch.unit_cost)}</p>}
          {activeMatch.note && <p className="mt-1 text-ink">{activeMatch.note}</p>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setBuscarOpen(true)}
          className="flex min-h-9 items-center gap-1.5 rounded-md border border-line-strong bg-card px-3 text-sm font-medium text-ink"
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" /> Buscar
        </button>
        <button
          type="button"
          onClick={() => setSinRegistroOpen(true)}
          className="flex min-h-9 items-center rounded-md border border-line-strong bg-card px-3 text-sm font-medium text-ink"
        >
          Sin registro
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink">Candidatos</p>
        {candidates.length === 0 && <p className="text-sm text-ink-soft">Sin candidatos — usa Buscar o marca Sin registro.</p>}
        {candidates.map((c) =>
          c.gasto_lines ? (
            <CandidateCard
              key={c.id}
              candidate={c}
              line={c.gasto_lines}
              usedBy={usedByCount.get(c.uid_itemc) ?? 0}
              onElegir={() => setConfirming(c.gasto_lines)}
              onDescartar={() => onReject(item.id, c)}
            />
          ) : null,
        )}
      </div>

      {confirming && (
        <ConfirmMatchSheet
          line={confirming}
          item={item}
          supabase={supabase}
          onClose={() => setConfirming(null)}
          onConfirm={async (patch) => {
            await onSave(item.id, patch);
            setConfirming(null);
          }}
        />
      )}

      {buscarOpen && (
        <BuscarSheet
          supabase={supabase}
          onClose={() => setBuscarOpen(false)}
          onPick={(line) => {
            setBuscarOpen(false);
            setConfirming(line);
          }}
        />
      )}

      {sinRegistroOpen && (
        <SinRegistroSheet
          onClose={() => setSinRegistroOpen(false)}
          onConfirm={async (unitCost, note) => {
            await onSave(item.id, {
              uid_itemc: null,
              uid_gasto: null,
              units_covered: null,
              unit_cost: unitCost,
              cfdi_uuid: null,
              cfdi_source: null,
              status: "sin_registro",
              note,
            });
            setSinRegistroOpen(false);
          }}
        />
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  line,
  usedBy,
  onElegir,
  onDescartar,
}: {
  candidate: ItemMatchCandidate;
  line: GastoLine;
  usedBy: number;
  onElegir: () => void;
  onDescartar: () => void;
}) {
  const nota = line.gasto_notas;
  return (
    <div className="rounded-md border border-line bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{line.descripcion ?? "(sin descripción)"}</p>
          <p className="text-xs text-ink-soft">
            {formatDate(line.fecha_op)} · {nota?.proveedor_nombre ?? "—"} · {line.locacion ?? "—"}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-bold ${TIER_COLORS[candidate.tier]}`}>
          {candidate.score.toFixed(0)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft">
        <span>UDs: {line.uds ?? "—"}</span>
        <span>P/U: {line.precio_por_ud != null ? formatCurrency(line.precio_por_ud) : "—"}</span>
        <span>Total: {line.total_neto != null ? formatCurrency(line.total_neto) : "—"}</span>
        {nota?.cfdi_resolved ? (
          <span className={nota.cfdi_conflict ? "font-bold text-negative" : ""}>
            CFDI: {nota.cfdi_resolved.slice(0, 8)}… {nota.cfdi_conflict && "(conflicto)"} {nota.cfdi_suspect && "(sospechoso)"}
          </span>
        ) : (
          <span>Sin CFDI</span>
        )}
        {usedBy > 0 && <span>Usado por {usedBy} artículo(s)</span>}
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onElegir}
          className="flex min-h-8 items-center rounded-md bg-ink px-3 text-xs font-semibold text-white"
        >
          Elegir
        </button>
        <button
          type="button"
          onClick={onDescartar}
          className="flex min-h-8 items-center rounded-md border border-negative/30 bg-negative/5 px-3 text-xs font-semibold text-negative"
        >
          Descartar
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------
// Confirm form — units/unit cost/CFDI/note, then Confirmar or (when
// eligible) Precio de referencia.
// --------------------------------------------------------------------
function ConfirmMatchSheet({
  line,
  item,
  supabase,
  onClose,
  onConfirm,
}: {
  line: GastoLine;
  item: QueueItem;
  supabase: ReturnType<typeof createClient>;
  onClose: () => void;
  onConfirm: (patch: Omit<ItemPurchaseMatch, "id" | "item_id" | "is_active" | "reviewed_by" | "reviewed_at">) => Promise<void>;
}) {
  const nota = line.gasto_notas;
  const [units, setUnits] = useState<number>(line.uds ?? 1);
  const [unitCost, setUnitCost] = useState<number | null>(defaultUnitCost(line, line.uds ?? 1));
  const [note, setNote] = useState("");
  const [cfdiChoice, setCfdiChoice] = useState<"gastos" | "flujos">(nota?.cfdi_source === "flujos" ? "flujos" : "gastos");
  const [flujoCfdi, setFlujoCfdi] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!nota?.cfdi_conflict || !nota.ref_notac) return;
    let cancelled = false;
    supabase
      .from("gasto_flujos")
      .select("cfdi_uuid")
      .eq("ref_nota", nota.ref_notac)
      .not("cfdi_uuid", "is", null)
      .limit(1)
      .then(({ data }) => {
        if (!cancelled) setFlujoCfdi(data?.[0]?.cfdi_uuid ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [nota?.cfdi_conflict, nota?.ref_notac, supabase]);

  const resolvedCfdi = nota?.cfdi_conflict ? (cfdiChoice === "gastos" ? nota.cfdi_uuid : flujoCfdi) : (nota?.cfdi_resolved ?? null);
  const eligibleForReference = unitCost != null && unitCost < PRICE_REFERENCE_THRESHOLD;

  function buildPatch(status: PurchaseMatchStatus) {
    return {
      uid_itemc: line.uid_itemc,
      uid_gasto: line.uid_nota,
      units_covered: units,
      unit_cost: unitCost,
      cfdi_uuid: resolvedCfdi,
      cfdi_source: nota?.cfdi_conflict ? cfdiChoice : (nota?.cfdi_source ?? null),
      status,
      note: note.trim() || null,
    };
  }

  async function handleSave(status: PurchaseMatchStatus) {
    setSaving(true);
    await onConfirm(buildPatch(status));
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-lg bg-white p-5 shadow-lg sm:rounded-lg"
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="text-xs text-ink-soft">{getDisplayName(item)}</p>
            <p className="font-bold text-ink">{line.descripcion}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-ink-soft">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <p className="text-xs text-ink-soft">
          Total de la línea: {line.total_neto != null ? formatCurrency(line.total_neto) : "—"} · {nota?.proveedor_nombre ?? "—"} ·{" "}
          {formatDate(line.fecha_op)}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-ink-soft">Unidades que cubre</span>
            <input
              type="number"
              value={units}
              onChange={(e) => {
                const n = Number(e.target.value) || 1;
                setUnits(n);
                if (line.total_neto != null) setUnitCost(Number(line.total_neto) / n);
              }}
              className="mt-1 h-10 w-full rounded-md border border-line-strong px-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-ink-soft">Costo unitario</span>
            <input
              type="number"
              value={unitCost ?? ""}
              onChange={(e) => setUnitCost(e.target.value === "" ? null : Number(e.target.value))}
              className="mt-1 h-10 w-full rounded-md border border-line-strong px-2 text-sm"
            />
          </label>
        </div>

        {nota?.cfdi_conflict ? (
          <div className="mt-3 rounded-md border border-negative/30 bg-negative/5 p-2.5">
            <p className="text-xs font-bold text-negative">CFDI en conflicto — elige cuál usar</p>
            <label className="mt-1 flex items-center gap-2 text-xs text-ink">
              <input type="radio" checked={cfdiChoice === "gastos"} onChange={() => setCfdiChoice("gastos")} />
              Gastos: {nota.cfdi_uuid ?? "—"}
            </label>
            <label className="mt-1 flex items-center gap-2 text-xs text-ink">
              <input type="radio" checked={cfdiChoice === "flujos"} onChange={() => setCfdiChoice("flujos")} />
              Flujos: {flujoCfdi ?? "cargando..."}
            </label>
          </div>
        ) : (
          <p className="mt-2 text-xs text-ink-soft">CFDI: {resolvedCfdi ?? "Sin CFDI"}</p>
        )}

        <label className="mt-3 block">
          <span className="text-xs font-medium text-ink-soft">Nota (opcional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-line-strong p-2 text-sm" />
        </label>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave("confirmado")}
            className="flex min-h-11 items-center justify-center rounded-md bg-ink text-sm font-semibold text-white disabled:opacity-50"
          >
            Confirmar
          </button>
          {eligibleForReference && (
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave("precio_referencia")}
              className="flex min-h-11 items-center justify-center rounded-md border border-line-strong text-sm font-semibold text-ink disabled:opacity-50"
            >
              Usar como precio de referencia
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SinRegistroSheet({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (unitCost: number | null, note: string | null) => Promise<void>;
}) {
  const [value, setValue] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-lg bg-white p-5 shadow-lg sm:rounded-lg">
        <div className="mb-3 flex items-start justify-between">
          <p className="font-bold text-ink">Sin registro</p>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-ink-soft">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-ink-soft">Valor estimado (opcional)</span>
          <input
            type="number"
            value={value ?? ""}
            onChange={(e) => setValue(e.target.value === "" ? null : Number(e.target.value))}
            className="mt-1 h-10 w-full rounded-md border border-line-strong px-2 text-sm"
          />
        </label>
        <label className="mt-3 block">
          <span className="text-xs font-medium text-ink-soft">Nota (opcional)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-line-strong p-2 text-sm" />
        </label>
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await onConfirm(value, note.trim() || null);
            setSaving(false);
          }}
          className="mt-4 flex min-h-11 w-full items-center justify-center rounded-md bg-ink text-sm font-semibold text-white disabled:opacity-50"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------
// Buscar — free-text fallback over every gasto_line, not just the
// precomputed candidate pool.
// --------------------------------------------------------------------
function BuscarSheet({
  supabase,
  onClose,
  onPick,
}: {
  supabase: ReturnType<typeof createClient>;
  onClose: () => void;
  onPick: (line: GastoLine) => void;
}) {
  const [query, setQuery] = useState("");
  // Holds the last real fetch — never reset to [] for a too-short query,
  // since the render below already masks it via `visibleResults` instead.
  const [results, setResults] = useState<GastoLine[]>([]);
  // The query `results` actually corresponds to — compared against the
  // live `query` at render time to derive "searching" (below) instead of
  // a separate setState call at the top of the effect, which this
  // project's react-hooks/set-state-in-effect rule rejects: every
  // setState here happens inside the async fetch's own resolution, never
  // synchronously in the effect body.
  const [resultsForQuery, setResultsForQuery] = useState("");
  const queryTooShort = query.trim().length < 2;
  const visibleResults = queryTooShort ? [] : results;
  const searching = !queryTooShort && resultsForQuery !== query.trim();

  useEffect(() => {
    if (queryTooShort) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      const q = query.trim();
      const { data } = await supabase
        .from("gasto_lines")
        .select(GASTO_LINE_FIELDS)
        .ilike("descripcion", `%${q}%`)
        .order("fecha_op", { ascending: false })
        .limit(30);
      if (!cancelled) {
        setResults((data ?? []) as unknown as GastoLine[]);
        setResultsForQuery(q);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, queryTooShort, supabase]);

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-lg bg-white p-5 shadow-lg sm:rounded-lg">
        <div className="mb-3 flex items-start justify-between">
          <p className="font-bold text-ink">Buscar en Gastos</p>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-ink-soft">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Descripción, proveedor..."
          className="h-10 w-full rounded-md border border-line-strong px-3 text-sm"
        />
        <div className="mt-3 flex-1 space-y-2 overflow-y-auto">
          {searching && <p className="text-sm text-ink-soft">Buscando...</p>}
          {!searching && !queryTooShort && visibleResults.length === 0 && <p className="text-sm text-ink-soft">Sin resultados.</p>}
          {visibleResults.map((line) => (
            <button
              key={line.uid_itemc}
              type="button"
              onClick={() => onPick(line)}
              className="block w-full rounded-md border border-line bg-card p-2.5 text-left"
            >
              <p className="text-sm font-semibold text-ink">{line.descripcion}</p>
              <p className="text-xs text-ink-soft">
                {formatDate(line.fecha_op)} · {line.gasto_notas?.proveedor_nombre ?? "—"} ·{" "}
                {line.precio_por_ud != null ? formatCurrency(line.precio_por_ud) : line.total_neto != null ? formatCurrency(line.total_neto) : "—"}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
