"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Flag, ImageOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSessionInfo } from "@/lib/auth";
import { formatCurrency } from "@/lib/currency";
import { getDisplayName } from "@/lib/items";
import { normalizeSearch } from "@/lib/normalize-search";
import SearchFilterBar, { type FilterChip } from "@/components/SearchFilterBar";
import Pill from "@/components/Pill";
import { CONDITION_OPTIONS, CONDITION_LABELS } from "@/lib/condition";
import { PRIORITY_OPTIONS, PRIORITY_LABELS } from "@/lib/priority";
import { REVIEW_STATUS_OPTIONS, REVIEW_STATUS_LABELS } from "@/lib/review-status";
import type { Item } from "@/lib/types";

// Sentinel for "no value set" in the priority/condición filters — both
// are meaningful states worth filtering by (most items currently have
// neither), unlike revisión where null just collapses into "nuevo".
const NONE = "__none__";

// Best-to-worst / most-to-least-urgent / earliest-to-latest rank, not
// alphabetical — same order each OPTIONS list is itself defined in.
const CONDITION_RANK: Record<string, number> = Object.fromEntries(CONDITION_OPTIONS.map((o, idx) => [o.value, idx]));
const PRIORITY_RANK: Record<string, number> = Object.fromEntries(PRIORITY_OPTIONS.map((o, idx) => [o.value, idx]));
const REVIEW_STATUS_RANK: Record<string, number> = Object.fromEntries(REVIEW_STATUS_OPTIONS.map((o, idx) => [o.value, idx]));

// Not shared via a lib file — same as item-edit-form.tsx's own local
// STATUS_OPTIONS/DATA_STATUS_OPTIONS, which aren't either.
const STATUS_OPTIONS = [
  { value: "for_sale", label: "En venta" },
  { value: "reserved", label: "Reservado" },
  { value: "sold", label: "Vendido" },
];
const DATA_STATUS_OPTIONS = [
  { value: "fetched", label: "Obtenido (Claude)" },
  { value: "verified", label: "Verificado" },
];

type SortValue = string | number | null;
type SortDir = "asc" | "desc";

// Fixed area sequence, not alphabetical — matches the physical walk-
// through order the September count itself followed.
const AREA_ORDER = ["Cocina", "Piso", "Barra", "Panadería"];

type Row = Item & {
  photoUrl: string | null;
  photoCount: number;
  linkCount: number;
};

// condition_notes carries an inline "[REVISAR: ...]" tag for anything
// the September cleanup couldn't resolve on its own (see clean_inventory.py)
// — split it out so it renders as its own flag instead of buried prose.
// Computed live from the current condition_notes wherever it's needed
// (not cached on the row), so editing the text updates the flag/count
// everywhere immediately instead of going stale.
function extractRevisar(notes: string | null): { rest: string | null; revisar: string | null } {
  if (!notes) return { rest: null, revisar: null };
  const match = notes.match(/\[REVISAR:\s*([^\]]+)\]/);
  if (!match) return { rest: notes, revisar: null };
  const rest = (notes.slice(0, match.index) + notes.slice(match.index! + match[0].length)).replace(/\s*\|\s*$/, "").trim();
  return { rest: rest || null, revisar: match[1].trim() };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" });
}

function money(v: number | null): React.ReactNode {
  return v != null ? formatCurrency(v) : <span className="text-ink-faint">—</span>;
}

// Signs a short-lived URL on demand, same as item-edit-form.tsx's
// FacturaPdfUpload/item-detail.tsx's handleViewFactura — the
// "item-documents" bucket is private, factura_pdf is a storage path,
// not a fetchable URL. View-only here on purpose (see COLUMNS' comment
// on factura_pdf) — replacing the file still means the edit form.
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

const inlineInputClass =
  "w-full min-w-[90px] rounded border border-transparent bg-transparent px-1.5 py-1 text-xs text-ink hover:border-line-strong focus:border-line-strong focus:bg-card focus:outline-none";
const inlineSelectClass = "rounded border border-line-strong bg-card px-1.5 py-1 text-xs text-ink";

// Every free-text/number cell shares this shape: local typing state so
// keystrokes don't hit the network, committed onBlur only if the value
// actually changed. `value` re-syncs local state whenever the
// underlying row value changes (a successful commit, a revert after a
// failed write, or someone else's edit landing after a reload).
function InlineText({
  value,
  onCommit,
  className = "",
}: {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
}) {
  const [local, setLocal] = useState(value);
  // "Adjusting state when a prop changes", not a synchronization effect
  // — setState during render (React's own documented pattern for this)
  // instead of useEffect, so a resync never costs an extra render pass.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setLocal(value);
  }
  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onCommit(local);
      }}
      className={`${inlineInputClass} ${className}`}
    />
  );
}

function InlineNumber({
  value,
  onCommit,
  step,
  min,
  className = "",
}: {
  value: string;
  onCommit: (value: string) => void;
  step?: string;
  min?: string;
  className?: string;
}) {
  const [local, setLocal] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setLocal(value);
  }
  return (
    <input
      type="number"
      value={local}
      step={step}
      min={min}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local !== value) onCommit(local);
      }}
      className={`${inlineInputClass} [font-variant-numeric:tabular-nums] ${className}`}
    />
  );
}

const ADD_NEW = "__add_new__";

// Same picker-with-escape-hatch UX as item-edit-form.tsx's own
// PickerField — a dropdown of every distinct value already in the
// catalog, plus "+ Agregar nuevo..." to type one that isn't there yet.
// Área/Tipo/Ubicación are free-text columns on purpose (see
// db/migrations/0001), so there's no reference table to insert into —
// a new value just becomes selectable itself once this reloads.
function PickerInline({
  value,
  options,
  onCommit,
}: {
  value: string;
  options: string[];
  onCommit: (value: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const allOptions = value && !options.includes(value) ? [...options, value].sort() : options;

  if (adding) {
    return (
      <input
        type="text"
        autoFocus
        value={draft}
        placeholder="Nuevo valor"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setAdding(false);
          const trimmed = draft.trim();
          if (trimmed && trimmed !== value) onCommit(trimmed);
        }}
        className={inlineInputClass}
      />
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === ADD_NEW) {
          setDraft("");
          setAdding(true);
        } else {
          onCommit(e.target.value);
        }
      }}
      className={inlineSelectClass}
    >
      <option value="">Sin dato</option>
      {allOptions.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value={ADD_NEW}>+ Agregar nuevo...</option>
    </select>
  );
}

// Mirrors item-edit-form.tsx's own section grouping 1:1 (Encabezado /
// Procesamiento / Descripción / Estado del artículo / Precio, plus
// Fotos y referencias for item_photos/item_links) — every toggleable
// column belongs to exactly one of these, so turning a group off
// always corresponds to a whole section of the edit form, not an
// arbitrary column subset.
type GroupKey = "encabezado" | "procesamiento" | "descripcion" | "estado" | "precio" | "fotos";

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: "encabezado", label: "Encabezado" },
  { key: "procesamiento", label: "Procesamiento" },
  { key: "descripcion", label: "Descripción" },
  { key: "estado", label: "Estado del artículo" },
  { key: "precio", label: "Precio" },
  { key: "fotos", label: "Fotos y referencias" },
];

// Every editable column writes through this one function: optimistic
// update, then the actual write, reverted (with a visible error) if it
// fails. Immediate-commit controls (selects) call it straight from
// onChange; free-text/number cells call it from InlineText/InlineNumber's
// onBlur instead, so typing itself never hits the network.
type WriteFieldFn = (itemId: string, field: string, value: unknown, revertValue: unknown) => void;

// Populated from whatever's already in the catalog (see the
// typeOptions/locationOptions useMemo below) — only the type/location
// columns' PickerInline actually reads this; every other render
// function just ignores the third argument.
type PickerOptions = { type: string[]; location: string[] };

type ColumnDef = {
  key: string;
  group: GroupKey;
  label: string;
  render: (item: Row, writeField: WriteFieldFn, pickerOptions: PickerOptions) => React.ReactNode;
  sortValue: (item: Row) => SortValue;
};

const COLUMNS: ColumnDef[] = [
  // Encabezado
  {
    key: "quantity",
    group: "encabezado",
    label: "Cant.",
    render: (i, writeField) => (
      <InlineNumber
        value={String(i.quantity)}
        min="1"
        className="w-14"
        onCommit={(v) => writeField(i.id, "quantity", Math.max(1, Number(v) || 1), i.quantity)}
      />
    ),
    sortValue: (i) => i.quantity,
  },
  {
    key: "status",
    group: "encabezado",
    label: "Venta",
    render: (i, writeField) => (
      <select
        value={i.status}
        onChange={(e) => writeField(i.id, "status", e.target.value, i.status)}
        className={inlineSelectClass}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    ),
    sortValue: (i) => i.status,
  },
  {
    key: "data_status",
    group: "encabezado",
    label: "Datos",
    render: (i, writeField) => (
      <select
        value={i.data_status ?? ""}
        onChange={(e) => writeField(i.id, "data_status", e.target.value || null, i.data_status)}
        className={inlineSelectClass}
      >
        <option value="">Sin dato</option>
        {DATA_STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    ),
    sortValue: (i) => i.data_status,
  },
  // Procesamiento — internal triage, not about what the article IS.
  {
    key: "review_status",
    group: "procesamiento",
    label: "Revisión",
    render: (i, writeField) => (
      <select
        value={i.review_status ?? "nuevo"}
        onChange={(e) => writeField(i.id, "review_status", e.target.value, i.review_status)}
        className={inlineSelectClass}
      >
        {REVIEW_STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    ),
    sortValue: (i) => (i.review_status ? REVIEW_STATUS_RANK[i.review_status] : null),
  },
  {
    key: "priority",
    group: "procesamiento",
    label: "Prioridad",
    render: (i, writeField) => (
      <select
        value={i.priority ?? ""}
        onChange={(e) => writeField(i.id, "priority", e.target.value || null, i.priority)}
        className={inlineSelectClass}
      >
        <option value="">Sin prioridad</option>
        {PRIORITY_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    ),
    sortValue: (i) => (i.priority ? PRIORITY_RANK[i.priority] : null),
  },
  {
    key: "internal_notes",
    group: "procesamiento",
    label: "Notas",
    render: (i, writeField) => (
      <InlineText value={i.internal_notes ?? ""} onCommit={(v) => writeField(i.id, "internal_notes", v.trim() || null, i.internal_notes)} />
    ),
    sortValue: (i) => i.internal_notes,
  },
  // Descripción
  {
    key: "type",
    group: "descripcion",
    label: "Tipo",
    render: (i, writeField, pickerOptions) => (
      <PickerInline value={i.type ?? ""} options={pickerOptions.type} onCommit={(v) => writeField(i.id, "type", v || null, i.type)} />
    ),
    sortValue: (i) => i.type,
  },
  {
    key: "location",
    group: "descripcion",
    label: "Ubicación",
    render: (i, writeField, pickerOptions) => (
      <PickerInline value={i.location ?? ""} options={pickerOptions.location} onCommit={(v) => writeField(i.id, "location", v || null, i.location)} />
    ),
    sortValue: (i) => i.location,
  },
  {
    key: "brand",
    group: "descripcion",
    label: "Marca",
    render: (i, writeField) => <InlineText value={i.brand ?? ""} onCommit={(v) => writeField(i.id, "brand", v.trim() || null, i.brand)} />,
    sortValue: (i) => i.brand,
  },
  {
    key: "model",
    group: "descripcion",
    label: "Modelo",
    render: (i, writeField) => <InlineText value={i.model ?? ""} onCommit={(v) => writeField(i.id, "model", v.trim() || null, i.model)} />,
    sortValue: (i) => i.model,
  },
  {
    key: "serial_number",
    group: "descripcion",
    label: "Serie",
    render: (i, writeField) => (
      <InlineText value={i.serial_number ?? ""} onCommit={(v) => writeField(i.id, "serial_number", v.trim() || null, i.serial_number)} />
    ),
    sortValue: (i) => i.serial_number,
  },
  {
    key: "dimensions",
    group: "descripcion",
    label: "Dimensiones",
    render: (i, writeField) => (
      <div className="flex items-center gap-1">
        <InlineNumber
          value={i.height_cm != null ? String(i.height_cm) : ""}
          step="0.1"
          min="0"
          className="w-12"
          onCommit={(v) => writeField(i.id, "height_cm", v.trim() === "" ? null : Number(v), i.height_cm)}
        />
        <span className="text-ink-faint">×</span>
        <InlineNumber
          value={i.width_cm != null ? String(i.width_cm) : ""}
          step="0.1"
          min="0"
          className="w-12"
          onCommit={(v) => writeField(i.id, "width_cm", v.trim() === "" ? null : Number(v), i.width_cm)}
        />
        <span className="text-ink-faint">×</span>
        <InlineNumber
          value={i.length_cm != null ? String(i.length_cm) : ""}
          step="0.1"
          min="0"
          className="w-12"
          onCommit={(v) => writeField(i.id, "length_cm", v.trim() === "" ? null : Number(v), i.length_cm)}
        />
      </div>
    ),
    sortValue: (i) => i.height_cm,
  },
  {
    key: "description",
    group: "descripcion",
    label: "Detalles",
    render: (i, writeField) => (
      <InlineText value={i.description ?? ""} onCommit={(v) => writeField(i.id, "description", v.trim() || null, i.description)} />
    ),
    sortValue: (i) => i.description,
  },
  // Estado del artículo
  {
    key: "condition_rating",
    group: "estado",
    label: "Condición",
    render: (i, writeField) => (
      <select
        value={i.condition_rating ?? ""}
        onChange={(e) => writeField(i.id, "condition_rating", e.target.value || null, i.condition_rating)}
        className={inlineSelectClass}
      >
        <option value="">Sin dato</option>
        {CONDITION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    ),
    sortValue: (i) => (i.condition_rating ? CONDITION_RANK[i.condition_rating] : null),
  },
  {
    key: "years_in_use",
    group: "estado",
    label: "Años",
    render: (i, writeField) => (
      <InlineNumber
        value={i.years_in_use != null ? String(i.years_in_use) : ""}
        step="0.1"
        min="0"
        className="w-14"
        onCommit={(v) => writeField(i.id, "years_in_use", v.trim() === "" ? null : Number(v), i.years_in_use)}
      />
    ),
    sortValue: (i) => i.years_in_use,
  },
  {
    key: "condition_notes",
    group: "estado",
    label: "Notas de condición",
    render: (i, writeField) => {
      const { revisar } = extractRevisar(i.condition_notes);
      return (
        <>
          <InlineText
            value={i.condition_notes ?? ""}
            onCommit={(v) => writeField(i.id, "condition_notes", v.trim() || null, i.condition_notes)}
          />
          {revisar && (
            <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-negative">
              <Flag className="h-3 w-3 shrink-0" aria-hidden="true" />
              {revisar}
            </span>
          )}
        </>
      );
    },
    sortValue: (i) => extractRevisar(i.condition_notes).rest,
  },
  {
    key: "maintenance_notes",
    group: "estado",
    label: "Notas de mantenimiento",
    render: (i, writeField) => (
      <InlineText
        value={i.maintenance_notes ?? ""}
        onCommit={(v) => writeField(i.id, "maintenance_notes", v.trim() || null, i.maintenance_notes)}
      />
    ),
    sortValue: (i) => i.maintenance_notes,
  },
  // Precio
  {
    key: "purchase_price",
    group: "precio",
    label: "Compra",
    render: (i, writeField) => (
      <InlineNumber
        value={i.purchase_price != null ? String(i.purchase_price) : ""}
        step="0.01"
        min="0"
        className="w-20"
        onCommit={(v) => writeField(i.id, "purchase_price", v.trim() === "" ? null : Number(v), i.purchase_price)}
      />
    ),
    sortValue: (i) => i.purchase_price,
  },
  {
    key: "reference_price",
    group: "precio",
    label: "Referencia",
    render: (i, writeField) => (
      <InlineNumber
        value={i.reference_price != null ? String(i.reference_price) : ""}
        step="0.01"
        min="0"
        className="w-20"
        onCommit={(v) => writeField(i.id, "reference_price", v.trim() === "" ? null : Number(v), i.reference_price)}
      />
    ),
    sortValue: (i) => i.reference_price,
  },
  {
    key: "suggested_resale_price",
    group: "precio",
    label: "Sugerido",
    render: (i, writeField) => (
      <InlineNumber
        value={i.suggested_resale_price != null ? String(i.suggested_resale_price) : ""}
        step="0.01"
        min="0"
        className="w-20"
        onCommit={(v) => writeField(i.id, "suggested_resale_price", v.trim() === "" ? null : Number(v), i.suggested_resale_price)}
      />
    ),
    sortValue: (i) => i.suggested_resale_price,
  },
  {
    key: "asking_price_override",
    group: "precio",
    label: "Venta (override)",
    render: (i, writeField) => (
      <InlineNumber
        value={i.asking_price_override != null ? String(i.asking_price_override) : ""}
        step="0.01"
        min="0"
        className="w-20"
        onCommit={(v) => writeField(i.id, "asking_price_override", v.trim() === "" ? null : Number(v), i.asking_price_override)}
      />
    ),
    sortValue: (i) => i.asking_price_override,
  },
  {
    // Generated column ("asking_price_override if set, else
    // suggested_resale_price" — db/migrations/0006) — Postgres itself
    // rejects a direct UPDATE to it, so it stays read-only here on
    // purpose. Edit "Venta (override)" or "Sugerido" instead.
    key: "asking_price",
    group: "precio",
    label: "Público",
    render: (i) => (
      <span title="Calculado: anula el sugerido si hay un precio de venta capturado.">{money(i.asking_price)}</span>
    ),
    sortValue: (i) => i.asking_price,
  },
  {
    // Also generated (db/migrations/0009) — same reasoning as asking_price.
    key: "discount_pct",
    group: "precio",
    label: "Descuento",
    render: (i) =>
      i.discount_pct != null ? (
        <span
          title="Calculado a partir de compra/referencia y el precio público."
          className="rounded-full border border-positive/30 bg-positive/10 px-1.5 py-0.5 text-[11px] font-bold text-positive"
        >
          -{i.discount_pct}%
        </span>
      ) : (
        <span className="text-ink-faint">—</span>
      ),
    sortValue: (i) => i.discount_pct,
  },
  {
    key: "has_factura",
    group: "precio",
    label: "Factura",
    render: (i, writeField) => (
      <select
        value={i.has_factura == null ? "" : i.has_factura ? "yes" : "no"}
        onChange={(e) => writeField(i.id, "has_factura", e.target.value === "" ? null : e.target.value === "yes", i.has_factura)}
        className={inlineSelectClass}
      >
        <option value="">Sin dato</option>
        <option value="yes">Sí</option>
        <option value="no">No</option>
      </select>
    ),
    sortValue: (i) => (i.has_factura == null ? null : i.has_factura ? 1 : 0),
  },
  {
    key: "factura_cfdi",
    group: "precio",
    label: "CFDI",
    render: (i, writeField) => (
      <InlineText value={i.factura_cfdi ?? ""} onCommit={(v) => writeField(i.id, "factura_cfdi", v.trim() || null, i.factura_cfdi)} />
    ),
    sortValue: (i) => i.factura_cfdi,
  },
  {
    // Uploading/replacing a file needs a real file picker — not a cell
    // a person can type into. View-only here; the edit form's Factura
    // (PDF) field is still where you swap the file itself.
    key: "factura_pdf",
    group: "precio",
    label: "PDF",
    render: (i) => <FacturaPdfLink path={i.factura_pdf} />,
    sortValue: (i) => (i.factura_pdf ? 1 : 0),
  },
  // Fotos y referencias — both represent a collection of rows (many
  // photos/links per item), not a single scalar value, so neither is a
  // cell someone can type a new value into. Managing them (add/remove/
  // reorder) still means the edit form's PhotoManager/Referencias.
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
    sortValue: (i) => i.photoCount,
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
    sortValue: (i) => i.linkCount,
  },
];

// The pinned columns (always shown, outside the group-toggle system)
// are sortable too. ref_code and updated_at are the two deliberate
// exceptions to "everything is editable": ref_code is enforced
// immutable by a DB trigger (it's a physical sticker already written),
// and updated_at is overwritten to now() by a trigger on every save
// regardless of what's sent, so offering an input for it would just be
// a lie. Artículo is bound to the raw `name` (not getDisplayName's
// brand+model fallback) since that's the field actually being edited —
// Marca/Modelo are their own columns right there in Descripción.
const PINNED_START = { key: "name", label: "Artículo", sortValue: (i: Row) => getDisplayName(i) };
const PINNED_REF = { key: "ref_code", label: "Ref.", sortValue: (i: Row) => i.ref_code };
const PINNED_END = { key: "updated_at", label: "Actualizado", sortValue: (i: Row) => i.updated_at };

const SORT_ACCESSORS: Record<string, (item: Row) => SortValue> = Object.fromEntries(
  [PINNED_START, PINNED_REF, ...COLUMNS, PINNED_END].map((c) => [c.key, c.sortValue]),
);

function compareValues(a: SortValue, b: SortValue, dir: SortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const cmp = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "es");
  return dir === "asc" ? cmp : -cmp;
}

// Artículo and Ref. are both frozen — the table gets wide enough that
// losing track of which row (and its sticker code) is which while
// scrolling right defeats the point of showing every column. Each
// needs an OPAQUE background (not the header row's bg-page/60) since a
// sticky cell has to actually occlude whatever scrolls underneath it,
// not just tint it, and a fixed width so Ref.'s `left` offset (exactly
// Artículo's width) never drifts out of alignment with it.
const ARTICULO_COL_WIDTH = 180;
const REF_COL_WIDTH = 110;

function SortableTh({
  colKey,
  label,
  active,
  dir,
  onSort,
  stickyLeft,
  width,
}: {
  colKey: string;
  label: string;
  active: boolean;
  dir: SortDir | undefined;
  onSort: (key: string) => void;
  stickyLeft?: number;
  width?: number;
}) {
  const style: React.CSSProperties | undefined =
    stickyLeft != null ? { left: stickyLeft, width, minWidth: width } : width != null ? { width, minWidth: width } : undefined;
  return (
    <th className={`px-2.5 py-2 ${stickyLeft != null ? "sticky z-20 border-r border-line bg-page" : ""}`} style={style}>
      <button
        type="button"
        onClick={() => onSort(colKey)}
        className={`flex items-center gap-1 whitespace-nowrap ${active ? "text-ink" : "text-ink-soft hover:text-ink"}`}
      >
        {label}
        <span className={active ? "text-ink" : "text-ink-faint"}>{active ? (dir === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

export default function RevisionList() {
  const supabase = createClient();
  const router = useRouter();
  const { role, loading: roleLoading } = useSessionInfo();

  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Multi-select per facet (OR within one, AND across facets) — same
  // model as items-list.tsx's own área/tipo filter.
  const [priorityFiltro, setPriorityFiltro] = useState<Set<string>>(new Set());
  const [reviewStatusFiltro, setReviewStatusFiltro] = useState<Set<string>>(new Set());
  const [typeFiltro, setTypeFiltro] = useState<Set<string>>(new Set());
  const [conditionFiltro, setConditionFiltro] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Keyed by área — each área's table sorts independently, since they're
  // rendered as separate <table>s and there's no reason picking a sort
  // for Cocina should touch Piso's.
  const [sortState, setSortState] = useState<Record<string, { key: string; dir: SortDir }>>({});
  // All six sections visible by default — "show every column", with the
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

      const rows: Row[] = (itemsRes.data as Item[]).map((item) => ({
        ...item,
        photoUrl: photoUrls.get(item.id) ?? null,
        photoCount: photoCounts.get(item.id) ?? 0,
        linkCount: linkCounts.get(item.id) ?? 0,
      }));
      setItems(rows);
      setError(null);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, role]);

  const totalRevisar = useMemo(() => items.filter((i) => extractRevisar(i.condition_notes).revisar).length, [items]);
  const totalNoPhoto = useMemo(() => items.filter((i) => i.photoCount === 0).length, [items]);
  const totalFetched = useMemo(() => items.filter((i) => i.data_status === "fetched").length, [items]);
  const totalNuevo = useMemo(() => items.filter((i) => (i.review_status ?? "nuevo") === "nuevo").length, [items]);
  const totalEnRevision = useMemo(() => items.filter((i) => i.review_status === "en_revision").length, [items]);
  const totalAprobado = useMemo(() => items.filter((i) => i.review_status === "aprobado").length, [items]);

  const typeOptions = useMemo(() => Array.from(new Set(items.map((i) => i.type).filter((t): t is string => !!t))).sort(), [items]);
  const locationOptions = useMemo(
    () => Array.from(new Set(items.map((i) => i.location).filter((l): l is string => !!l))).sort(),
    [items],
  );
  const pickerOptions = useMemo(() => ({ type: typeOptions, location: locationOptions }), [typeOptions, locationOptions]);

  function togglePriority(value: string) {
    setPriorityFiltro((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }
  function toggleReviewStatus(value: string) {
    setReviewStatusFiltro((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }
  function toggleType(value: string) {
    setTypeFiltro((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }
  function toggleCondition(value: string) {
    setConditionFiltro((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  const filteredItems = useMemo(() => {
    let result = items;
    if (search.trim()) {
      const term = normalizeSearch(search.trim());
      result = result.filter((i) =>
        [i.name, i.brand, i.model, i.serial_number, i.location, i.description]
          .filter(Boolean)
          .some((field) => normalizeSearch(field as string).includes(term)),
      );
    }
    if (priorityFiltro.size > 0) result = result.filter((i) => priorityFiltro.has(i.priority ?? NONE));
    if (reviewStatusFiltro.size > 0) result = result.filter((i) => reviewStatusFiltro.has(i.review_status ?? "nuevo"));
    if (typeFiltro.size > 0) result = result.filter((i) => i.type && typeFiltro.has(i.type));
    if (conditionFiltro.size > 0) result = result.filter((i) => conditionFiltro.has(i.condition_rating ?? NONE));
    return result;
  }, [items, search, priorityFiltro, reviewStatusFiltro, typeFiltro, conditionFiltro]);

  const chips: FilterChip[] = [
    ...Array.from(priorityFiltro).map((v) => ({ id: `priority:${v}`, label: v === NONE ? "Sin prioridad" : PRIORITY_LABELS[v as keyof typeof PRIORITY_LABELS] })),
    ...Array.from(reviewStatusFiltro).map((v) => ({ id: `review:${v}`, label: REVIEW_STATUS_LABELS[v as keyof typeof REVIEW_STATUS_LABELS] })),
    ...Array.from(typeFiltro).map((v) => ({ id: `type:${v}`, label: v })),
    ...Array.from(conditionFiltro).map((v) => ({ id: `condition:${v}`, label: v === NONE ? "Sin condición" : CONDITION_LABELS[v as keyof typeof CONDITION_LABELS] })),
  ];

  function handleRemoveChip(id: string) {
    const sep = id.indexOf(":");
    const kind = id.slice(0, sep);
    const value = id.slice(sep + 1);
    if (kind === "priority") togglePriority(value);
    else if (kind === "review") toggleReviewStatus(value);
    else if (kind === "type") toggleType(value);
    else if (kind === "condition") toggleCondition(value);
  }

  const hasActiveFilters =
    search !== "" || priorityFiltro.size > 0 || reviewStatusFiltro.size > 0 || typeFiltro.size > 0 || conditionFiltro.size > 0;

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

  // Writes straight to the DB (same immediate-write pattern as
  // PhotoManager/FacturaPdfUpload) — optimistic update first, reverted
  // (with a visible error banner) if the write fails.
  const writeField: WriteFieldFn = async (itemId, field, value, revertValue) => {
    setItems((current) => current.map((i) => (i.id === itemId ? { ...i, [field]: value } : i)));
    const { error: updateError } = await supabase.from("items").update({ [field]: value }).eq("id", itemId);
    if (updateError) {
      setItems((current) => current.map((i) => (i.id === itemId ? { ...i, [field]: revertValue } : i)));
      setSaveError(updateError.message);
    }
  };

  function handleSort(area: string, key: string) {
    setSortState((prev) => {
      const current = prev[area];
      const dir: SortDir = current && current.key === key && current.dir === "asc" ? "desc" : "asc";
      return { ...prev, [area]: { key, dir } };
    });
  }

  function sortRows(rows: Row[], area: string): Row[] {
    const sort = sortState[area];
    const accessor = sort && SORT_ACCESSORS[sort.key];
    if (!sort || !accessor) return rows;
    return [...rows].sort((a, b) => compareValues(accessor(a), accessor(b), sort.dir));
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
  const tableMinWidth = 220 + 120 + activeColumns.length * 150 + 220;

  if (roleLoading || !role) return <p className="p-4 text-sm text-ink-soft">Cargando...</p>;

  return (
    <>
      <SearchFilterBar
        value={search}
        onChange={setSearch}
        placeholder="Buscar por nombre, ubicación, marca, modelo o serie"
        chips={chips}
        onRemoveChip={handleRemoveChip}
        onClearAll={
          hasActiveFilters
            ? () => {
                setSearch("");
                setPriorityFiltro(new Set());
                setReviewStatusFiltro(new Set());
                setTypeFiltro(new Set());
                setConditionFiltro(new Set());
              }
            : undefined
        }
        sheetTitle="Filtrar"
        sheetContent={
          <div className="space-y-5">
            <div>
              <span className="mb-1.5 block text-xs font-bold tracking-wide text-ink-soft uppercase">Prioridad</span>
              <div className="flex flex-wrap gap-2">
                {PRIORITY_OPTIONS.map((opt) => (
                  <Pill key={opt.value} active={priorityFiltro.has(opt.value)} onClick={() => togglePriority(opt.value)}>
                    {opt.label}
                  </Pill>
                ))}
                <Pill active={priorityFiltro.has(NONE)} onClick={() => togglePriority(NONE)}>
                  Sin prioridad
                </Pill>
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-bold tracking-wide text-ink-soft uppercase">Revisión</span>
              <div className="flex flex-wrap gap-2">
                {REVIEW_STATUS_OPTIONS.map((opt) => (
                  <Pill key={opt.value} active={reviewStatusFiltro.has(opt.value)} onClick={() => toggleReviewStatus(opt.value)}>
                    {opt.label}
                  </Pill>
                ))}
              </div>
            </div>

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

            <div>
              <span className="mb-1.5 block text-xs font-bold tracking-wide text-ink-soft uppercase">Condición</span>
              <div className="flex flex-wrap gap-2">
                {CONDITION_OPTIONS.map((opt) => (
                  <Pill key={opt.value} active={conditionFiltro.has(opt.value)} onClick={() => toggleCondition(opt.value)}>
                    {opt.label}
                  </Pill>
                ))}
                <Pill active={conditionFiltro.has(NONE)} onClick={() => toggleCondition(NONE)}>
                  Sin condición
                </Pill>
              </div>
            </div>
          </div>
        }
      />

      <div className="px-3.5 py-3">
        {loading ? (
          <p className="p-4 text-sm text-ink-soft">Cargando...</p>
        ) : error ? (
          <p className="p-4 text-sm text-red-600">Error: {error}</p>
        ) : (
          <>
            {saveError && (
              <p className="mb-3 rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-sm text-negative">
                No se pudo guardar: {saveError}
              </p>
            )}

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
              {/* Same three-way split as review_status: neutral
                  (untouched) -> yellow (in progress) -> positive
                  (cleared). */}
              <div className="rounded-md border border-line bg-card p-3">
                <p className="text-xl font-bold text-neutral [font-variant-numeric:tabular-nums]">{totalNuevo}</p>
                <p className="text-xs text-ink-soft">Nuevo</p>
              </div>
              <div className="rounded-md border border-line bg-card p-3">
                <p className="text-xl font-bold text-yellow [font-variant-numeric:tabular-nums]">{totalEnRevision}</p>
                <p className="text-xs text-ink-soft">En revisión</p>
              </div>
              <div className="rounded-md border border-line bg-card p-3">
                <p className="text-xl font-bold text-positive [font-variant-numeric:tabular-nums]">{totalAprobado}</p>
                <p className="text-xs text-ink-soft">Aprobado</p>
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
                const revisarCount = rows.filter((r) => extractRevisar(r.condition_notes).revisar).length;

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
                              <SortableTh
                                colKey={PINNED_START.key}
                                label={PINNED_START.label}
                                active={sortState[area]?.key === PINNED_START.key}
                                dir={sortState[area]?.key === PINNED_START.key ? sortState[area]?.dir : undefined}
                                onSort={(key) => handleSort(area, key)}
                                stickyLeft={0}
                                width={ARTICULO_COL_WIDTH}
                              />
                              <SortableTh
                                colKey={PINNED_REF.key}
                                label={PINNED_REF.label}
                                active={sortState[area]?.key === PINNED_REF.key}
                                dir={sortState[area]?.key === PINNED_REF.key ? sortState[area]?.dir : undefined}
                                onSort={(key) => handleSort(area, key)}
                                stickyLeft={ARTICULO_COL_WIDTH}
                                width={REF_COL_WIDTH}
                              />
                              {activeColumns.map((c) => (
                                <SortableTh
                                  key={c.key}
                                  colKey={c.key}
                                  label={c.label}
                                  active={sortState[area]?.key === c.key}
                                  dir={sortState[area]?.key === c.key ? sortState[area]?.dir : undefined}
                                  onSort={(key) => handleSort(area, key)}
                                />
                              ))}
                              <SortableTh
                                colKey={PINNED_END.key}
                                label={PINNED_END.label}
                                active={sortState[area]?.key === PINNED_END.key}
                                dir={sortState[area]?.key === PINNED_END.key ? sortState[area]?.dir : undefined}
                                onSort={(key) => handleSort(area, key)}
                              />
                              <th className="px-2.5 py-2">Abrir</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortRows(rows, area).map((item) => {
                              const revisar = extractRevisar(item.condition_notes).revisar;
                              return (
                                <tr key={item.id} className={`border-b border-line text-sm last:border-0 ${revisar ? "bg-negative/5" : ""}`}>
                                  {/* Both frozen columns: opaque bg-card so each
                                      occludes cells scrolling underneath — this is
                                      why they don't pick up the row's own
                                      bg-negative/5 tint the way the rest of a
                                      flagged row does. Ref.'s left offset is
                                      exactly Artículo's width, so they sit flush. */}
                                  <td
                                    className="sticky z-10 border-r border-line bg-card px-2.5 py-2 align-top font-semibold text-ink"
                                    style={{ left: 0, width: ARTICULO_COL_WIDTH, minWidth: ARTICULO_COL_WIDTH }}
                                  >
                                    <InlineText
                                      value={item.name}
                                      className="font-semibold"
                                      onCommit={(v) => writeField(item.id, "name", v.trim() || item.name, item.name)}
                                    />
                                  </td>
                                  <td
                                    className="sticky z-10 border-r border-line bg-card px-2.5 py-2 align-top font-mono text-xs whitespace-nowrap text-ink-soft"
                                    style={{ left: ARTICULO_COL_WIDTH, width: REF_COL_WIDTH, minWidth: REF_COL_WIDTH }}
                                    title="No se puede modificar"
                                  >
                                    {item.ref_code ?? "—"}
                                  </td>
                                  {activeColumns.map((c) => (
                                    <td key={c.key} className="max-w-[220px] px-2.5 py-2 align-top text-ink">
                                      {c.render(item, writeField, pickerOptions)}
                                    </td>
                                  ))}
                                  <td
                                    className="px-2.5 py-2 align-top text-ink-faint [font-variant-numeric:tabular-nums] whitespace-nowrap"
                                    title="Se actualiza sola al guardar cualquier cambio"
                                  >
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
