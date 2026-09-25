"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSessionInfo } from "@/lib/auth";
import { CONDITION_OPTIONS } from "@/lib/condition";
import { PRIORITY_OPTIONS } from "@/lib/priority";
import { REVIEW_STATUS_OPTIONS } from "@/lib/review-status";
import PhotoManager from "@/components/PhotoManager";
import ModalSheet from "@/components/ModalSheet";
import type { ConditionRating, DataStatus, Item, ItemLink, ItemPhoto, ItemPriority, ItemReviewStatus, ItemStatus } from "@/lib/types";

const STATUS_OPTIONS: { value: ItemStatus; label: string }[] = [
  { value: "for_sale", label: "En venta" },
  { value: "reserved", label: "Reservado" },
  { value: "sold", label: "Vendido" },
];

const DATA_STATUS_OPTIONS: { value: DataStatus; label: string }[] = [
  { value: "fetched", label: "Obtenido (Claude)" },
  { value: "verified", label: "Verificado" },
];

// Ported from reference/cereza's gasto-editar-form.tsx row shape (label
// left, control right, rows sharing one bordered/divided box) — used for
// every short field (amounts, tags, single values). Free text keeps the
// separate label-above/box-below LabeledTextarea below instead, per
// Philippe's split: short data = row, long text = stacked.
function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-line rounded-lg border border-line bg-card">{children}</div>;
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-3">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="w-1/2 min-w-0">{children}</div>
    </div>
  );
}

const rowInputClass = "w-full rounded-md border border-line-strong bg-card px-3 py-2 text-base text-ink";

function RowInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={rowInputClass} />;
}

function RowSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={rowInputClass} />;
}

const ADD_NEW = "__add_new__";

// Área/Tipo/Ubicación are free-text columns on purpose (a new value
// never needs a migration — see db/migrations/0001's comment), but
// typing them from scratch invites drift ("Piso" vs "piso"). This picks
// from whatever values already exist across the catalog, with an
// "Agregar nuevo" escape hatch that reveals a plain text input —
// there's no separate reference table to insert into, the new value
// just becomes selectable itself the next time this list is loaded.
function PickerField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const allOptions = value && !options.includes(value) ? [...options, value].sort() : options;

  if (adding) {
    return (
      <FieldRow label={label}>
        <div className="flex items-center gap-1.5">
          <RowInput
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Nuevo valor"
          />
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="shrink-0 text-xs text-ink-faint underline"
          >
            Elegir
          </button>
        </div>
      </FieldRow>
    );
  }

  return (
    <FieldRow label={label}>
      <RowSelect
        value={value}
        onChange={(e) => {
          if (e.target.value === ADD_NEW) {
            onChange("");
            setAdding(true);
          } else {
            onChange(e.target.value);
          }
        }}
      >
        <option value="">Sin dato</option>
        {allOptions.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={ADD_NEW}>+ Agregar nuevo...</option>
      </RowSelect>
    </FieldRow>
  );
}

// Uploads straight to the private "item-documents" bucket and writes
// the resulting path onto the row immediately (same immediate-write
// pattern as PhotoManager, just a single file instead of a list) —
// factura_pdf is never part of the big Guardar payload. The bucket
// isn't public (0015), so viewing means signing a short-lived URL on
// demand rather than a plain <a href>.
function FacturaPdfUpload({
  itemId,
  path,
  onChange,
}: {
  itemId: string;
  path: string | null;
  onChange: (path: string | null) => void;
}) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelected(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const newPath = `${itemId}/factura-${crypto.randomUUID()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("item-documents")
        .upload(newPath, file, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from("items")
        .update({ factura_pdf: newPath })
        .eq("id", itemId);
      if (updateError) throw updateError;

      // Old file cleaned up after the new one is safely linked, not
      // before — if the update above had failed, the old PDF stays
      // recoverable instead of being deleted for nothing.
      if (path) await supabase.storage.from("item-documents").remove([path]);
      onChange(newPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el archivo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleView() {
    if (!path) return;
    setOpening(true);
    setError(null);
    const { data, error: signError } = await supabase.storage.from("item-documents").createSignedUrl(path, 60);
    setOpening(false);
    if (signError || !data) {
      setError("No se pudo abrir el archivo.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function handleRemove() {
    if (!path) return;
    setError(null);
    const removedPath = path;
    onChange(null);
    const [{ error: updateError }] = await Promise.all([
      supabase.from("items").update({ factura_pdf: null }).eq("id", itemId),
      supabase.storage.from("item-documents").remove([removedPath]),
    ]);
    if (updateError) {
      setError(updateError.message);
      onChange(removedPath);
    }
  }

  return (
    <div>
      {path ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleView}
            disabled={opening}
            className="text-sm font-medium text-ink underline disabled:opacity-50"
          >
            {opening ? "Abriendo..." : "Ver PDF"}
          </button>
          <button type="button" onClick={handleRemove} className="text-sm text-negative">
            Quitar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-md border border-line-strong bg-card px-3 py-2 text-sm font-medium text-ink disabled:opacity-50"
        >
          {uploading ? "Subiendo..." : "Subir PDF"}
        </button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => handleFileSelected(e.target.files?.[0] ?? null)}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function LabeledTextarea({
  label,
  ...props
}: { label: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold tracking-wide text-ink-soft uppercase">{label}</span>
      <textarea
        {...props}
        rows={3}
        className="w-full rounded-md border border-line-strong bg-card px-3 py-2 text-sm text-ink"
      />
    </label>
  );
}

// Nullable-number inputs stay as strings in form state (so an empty
// field is "", not 0, and doesn't fight the user mid-edit) and only
// convert to number | null right before saving.
type FormState = {
  name: string;
  description: string;
  area: string;
  location: string;
  type: string;
  brand: string;
  model: string;
  serial_number: string;
  quantity: string;
  height_cm: string;
  width_cm: string;
  length_cm: string;
  years_in_use: string;
  condition_rating: ConditionRating | "";
  condition_notes: string;
  maintenance_notes: string;
  has_factura: "unknown" | "yes" | "no";
  factura_cfdi: string;
  purchase_price: string;
  reference_price: string;
  suggested_resale_price: string;
  asking_price_override: string;
  status: ItemStatus;
  data_status: DataStatus | "";
  priority: ItemPriority | "";
  review_status: ItemReviewStatus;
};

function toFormState(item: Item): FormState {
  return {
    name: item.name,
    description: item.description ?? "",
    area: item.area ?? "",
    location: item.location ?? "",
    type: item.type ?? "",
    brand: item.brand ?? "",
    model: item.model ?? "",
    serial_number: item.serial_number ?? "",
    quantity: String(item.quantity),
    height_cm: item.height_cm != null ? String(item.height_cm) : "",
    width_cm: item.width_cm != null ? String(item.width_cm) : "",
    length_cm: item.length_cm != null ? String(item.length_cm) : "",
    years_in_use: item.years_in_use != null ? String(item.years_in_use) : "",
    condition_rating: item.condition_rating ?? "",
    condition_notes: item.condition_notes ?? "",
    maintenance_notes: item.maintenance_notes ?? "",
    has_factura: item.has_factura == null ? "unknown" : item.has_factura ? "yes" : "no",
    factura_cfdi: item.factura_cfdi ?? "",
    purchase_price: item.purchase_price != null ? String(item.purchase_price) : "",
    reference_price: item.reference_price != null ? String(item.reference_price) : "",
    suggested_resale_price: item.suggested_resale_price != null ? String(item.suggested_resale_price) : "",
    asking_price_override: item.asking_price_override != null ? String(item.asking_price_override) : "",
    status: item.status,
    data_status: item.data_status ?? "",
    priority: item.priority ?? "",
    review_status: item.review_status ?? "nuevo",
  };
}

function numOrNull(s: string): number | null {
  const trimmed = s.trim();
  return trimmed === "" ? null : Number(trimmed);
}

export default function ItemEditForm({ id }: { id: string }) {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { role, loading: roleLoading } = useSessionInfo();

  // Set only by items-list.tsx's "Agregar artículo" (?new=1) — this is
  // the very first visit to this row's edit screen, before it's ever
  // been through a real Guardar. handleSave always lands on /items/{id}
  // afterward, never back here, so a normal "click the pencil to edit"
  // visit never carries this param.
  const isNew = searchParams.get("new") === "1";

  const [item, setItem] = useState<Item | null>(null);
  const [photos, setPhotos] = useState<ItemPhoto[]>([]);
  const [links, setLinks] = useState<ItemLink[]>([]);
  // Storage path in the private "item-documents" bucket, not a URL —
  // managed independently of `form`/Guardar, same as `photos` above.
  const [facturaPdfPath, setFacturaPdfPath] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [areaOptions, setAreaOptions] = useState<string[]>([]);
  const [typeOptions, setTypeOptions] = useState<string[]>([]);
  const [locationOptions, setLocationOptions] = useState<string[]>([]);

  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for the role check before fetching anything — this route's
    // .select("*") returns the unmasked row (suggested_resale_price
    // included), unlike items_public. Firing it before we know the
    // visitor is Editor/Owner would ship that figure to the browser's
    // network tab even though the "no tienes permiso" screen below
    // never renders it.
    if (roleLoading || !role) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      const [itemRes, photosRes, linksRes, tagsRes] = await Promise.all([
        supabase.from("items").select("*").eq("id", id).single(),
        supabase.from("item_photos").select("*").eq("item_id", id).order("sort_order"),
        supabase.from("item_links").select("*").eq("item_id", id).order("created_at"),
        // Every existing área/tipo/ubicación in the catalog, so
        // PickerField can offer them instead of free typing — these
        // are plain columns on items, not a reference table, so
        // "every value in use" IS the option list.
        supabase.from("items").select("area, type, location"),
      ]);
      if (cancelled) return;
      if (itemRes.error) {
        setError(itemRes.error.message);
        setLoading(false);
        return;
      }
      setItem(itemRes.data as Item);
      setForm(toFormState(itemRes.data as Item));
      setFacturaPdfPath((itemRes.data as Item).factura_pdf);
      setPhotos((photosRes.data ?? []) as ItemPhoto[]);
      setLinks((linksRes.data ?? []) as ItemLink[]);
      const tagRows = (tagsRes.data ?? []) as Pick<Item, "area" | "type" | "location">[];
      const distinct = (values: (string | null)[]) =>
        [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
      setAreaOptions(distinct(tagRows.map((r) => r.area)));
      setTypeOptions(distinct(tagRows.map((r) => r.type)));
      setLocationOptions(distinct(tagRows.map((r) => r.location)));
      setError(null);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, id, role, roleLoading]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("items")
      .update({
        name: form.name,
        description: form.description || null,
        area: form.area || null,
        location: form.location || null,
        type: form.type || null,
        brand: form.brand || null,
        model: form.model || null,
        serial_number: form.serial_number || null,
        quantity: Number(form.quantity) || 1,
        height_cm: numOrNull(form.height_cm),
        width_cm: numOrNull(form.width_cm),
        length_cm: numOrNull(form.length_cm),
        years_in_use: numOrNull(form.years_in_use),
        condition_rating: form.condition_rating || null,
        condition_notes: form.condition_notes || null,
        maintenance_notes: form.maintenance_notes || null,
        has_factura: form.has_factura === "unknown" ? null : form.has_factura === "yes",
        factura_cfdi: form.factura_cfdi || null,
        // factura_pdf is NOT here — FacturaPdfUpload writes it directly
        // (immediate upload/remove, same pattern as PhotoManager's own
        // photos), so a stale form value can never clobber it.
        purchase_price: numOrNull(form.purchase_price),
        reference_price: numOrNull(form.reference_price),
        suggested_resale_price: numOrNull(form.suggested_resale_price),
        asking_price_override: numOrNull(form.asking_price_override),
        status: form.status,
        data_status: form.data_status || null,
        priority: form.priority || null,
        review_status: form.review_status,
      })
      .eq("id", id);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.push(`/items/${id}`);
  }

  // Shared by the confirmed "Borrar artículo" button and the silent
  // discard-on-Cancelar path for a never-saved draft — deletes the
  // photo bucket's own folder first (best-effort, same tolerance
  // PhotoManager's own delete uses), then the row itself.
  // item_photos/item_links/wishlist_items all cascade on delete
  // (0001/0003), so nothing else needs cleaning up.
  async function deleteItem(): Promise<boolean> {
    const { data: files } = await supabase.storage.from("item-photos").list(id);
    if (files && files.length > 0) {
      await supabase.storage.from("item-photos").remove(files.map((f) => `${id}/${f.name}`));
    }
    const { data: docs } = await supabase.storage.from("item-documents").list(id);
    if (docs && docs.length > 0) {
      await supabase.storage.from("item-documents").remove(docs.map((f) => `${id}/${f.name}`));
    }
    // .select("id") so a delete RLS blocks (0 rows affected, no thrown
    // error — Supabase just filters which rows a write can touch) is
    // caught here instead of read as silent success: found live, before
    // 0012 added the admins-can-delete policy items never had.
    const { data: deletedRows, error: deleteError } = await supabase.from("items").delete().eq("id", id).select("id");
    if (deleteError) {
      setError(deleteError.message);
      return false;
    }
    if (!deletedRows || deletedRows.length === 0) {
      setError("No se pudo borrar el artículo.");
      return false;
    }
    return true;
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const ok = await deleteItem();
    setDeleting(false);
    if (!ok) return;
    setShowDeleteConfirm(false);
    router.push("/items");
  }

  async function handleCancel() {
    if (!isNew) {
      router.push(`/items/${id}`);
      return;
    }
    // A fresh, never-saved draft — discarding it silently (no confirm
    // dialog) matches what was asked: Cancelar on a brand-new article
    // just undoes the "Agregar artículo" tap, nothing was ever really
    // there to lose.
    await deleteItem();
    router.push("/items");
  }

  async function handleAddLink() {
    if (!newLinkUrl.trim()) return;
    setLinkError(null);
    const { data, error: insertError } = await supabase
      .from("item_links")
      .insert({ item_id: id, url: newLinkUrl.trim(), label: newLinkLabel.trim() || null })
      .select("*")
      .single();
    if (insertError) {
      setLinkError(insertError.message);
      return;
    }
    setLinks((prev) => [...prev, data as ItemLink]);
    setNewLinkUrl("");
    setNewLinkLabel("");
  }

  async function handleDeleteLink(linkId: string) {
    setLinkError(null);
    const { error: deleteError } = await supabase.from("item_links").delete().eq("id", linkId);
    if (deleteError) {
      setLinkError(deleteError.message);
      return;
    }
    setLinks((prev) => prev.filter((l) => l.id !== linkId));
  }

  if (roleLoading) return <p className="p-4 text-sm text-ink-soft">Cargando...</p>;

  // Client-side gate for UX only — RLS (is_admin()) is what actually
  // stops a non-admin from writing, even if this check were somehow
  // bypassed. Checked before `loading`: without a role the fetch effect
  // above never runs, so `loading` would otherwise stay true forever.
  if (!role) {
    return (
      <div className="p-4">
        <p className="text-sm text-ink">No tienes permiso para editar este artículo.</p>
        <Link href={`/items/${id}`} className="mt-2 inline-block text-sm text-ink-soft underline">
          Volver
        </Link>
      </div>
    );
  }

  if (loading) return <p className="p-4 text-sm text-ink-soft">Cargando...</p>;
  if (error && !form) return <p className="p-4 text-sm text-red-600">Error: {error}</p>;
  if (!item || !form) return null;

  return (
    <form onSubmit={handleSave} className="space-y-6 px-3.5 py-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink">Editar artículo</h1>
        <button type="button" onClick={handleCancel} className="text-sm text-ink-soft">
          Cancelar
        </button>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-bold tracking-wide text-ink-soft uppercase">Fotos</h2>
        <PhotoManager itemId={id} photos={photos} onChange={setPhotos} />
      </section>

      {/* Nombre, Cantidad disponible, Estado — the three things every
          item has regardless of how much else is known about it. */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold tracking-wide text-ink-soft uppercase">Encabezado</h2>
        <FieldGroup>
          <FieldRow label="Nombre">
            <RowInput required value={form.name} onChange={(e) => set("name", e.target.value)} />
          </FieldRow>
          {/* Server-generated on insert, immutable after (a DB trigger
              rejects any UPDATE that touches it) — shown here so it can
              be copied onto a sticker, never as an editable field. */}
          <FieldRow label="Ref.">
            <p className="text-right font-mono text-base tracking-wide text-ink">{item.ref_code ?? "—"}</p>
          </FieldRow>
          <FieldRow label="Cantidad disponible">
            <RowInput
              type="number"
              min="1"
              value={form.quantity}
              onChange={(e) => set("quantity", e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Estado">
            <RowSelect value={form.status} onChange={(e) => set("status", e.target.value as ItemStatus)}>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </RowSelect>
          </FieldRow>
          <FieldRow label="Revisión">
            <RowSelect value={form.review_status} onChange={(e) => set("review_status", e.target.value as ItemReviewStatus)}>
              {REVIEW_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </RowSelect>
          </FieldRow>
          <FieldRow label="Prioridad">
            <RowSelect value={form.priority} onChange={(e) => set("priority", e.target.value as FormState["priority"])}>
              <option value="">Sin prioridad</option>
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </RowSelect>
          </FieldRow>
          <FieldRow label="Estado de datos">
            <RowSelect
              value={form.data_status}
              onChange={(e) => set("data_status", e.target.value as FormState["data_status"])}
            >
              <option value="">Sin dato</option>
              {DATA_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </RowSelect>
          </FieldRow>
        </FieldGroup>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold tracking-wide text-ink-soft uppercase">Precio</h2>
        <FieldGroup>
          <FieldRow label="Precio de compra original">
            <RowInput
              type="number"
              step="0.01"
              min="0"
              value={form.purchase_price}
              onChange={(e) => set("purchase_price", e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Factura">
            <RowSelect
              value={form.has_factura}
              onChange={(e) => set("has_factura", e.target.value as FormState["has_factura"])}
            >
              <option value="unknown">Sin dato</option>
              <option value="yes">Sí</option>
              <option value="no">No</option>
            </RowSelect>
          </FieldRow>
          <FieldRow label="CFDI (folio/UUID)">
            <RowInput value={form.factura_cfdi} onChange={(e) => set("factura_cfdi", e.target.value)} />
          </FieldRow>
          <FieldRow label="Factura (PDF)">
            <FacturaPdfUpload itemId={id} path={facturaPdfPath} onChange={setFacturaPdfPath} />
          </FieldRow>
          <FieldRow label="Precio de referencia (mercado)">
            <RowInput
              type="number"
              step="0.01"
              min="0"
              value={form.reference_price}
              onChange={(e) => set("reference_price", e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Precio sugerido (investigación)">
            <RowInput
              type="number"
              step="0.01"
              min="0"
              value={form.suggested_resale_price}
              onChange={(e) => set("suggested_resale_price", e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Precio de venta (anula el sugerido)">
            <RowInput
              type="number"
              step="0.01"
              min="0"
              value={form.asking_price_override}
              onChange={(e) => set("asking_price_override", e.target.value)}
            />
          </FieldRow>
        </FieldGroup>
        <p className="text-xs text-ink-soft">
          El de referencia es solo un dato externo (p. ej. precio promedio de artículos nuevos similares en el
          mercado) — no afecta el precio al público.{" "}
          {form.asking_price_override
            ? "Precio al público: el de venta (arriba)."
            : "Precio al público: el sugerido, hasta que captures uno de venta."}
          {item.discount_pct != null && ` Descuento vs. compra: ${item.discount_pct}% (se actualiza solo al guardar).`}
        </p>
        {/* Precio de referencia/sugerido/de venta, y el CFDI/link de PDF,
            solo las ve Editor/Owner — items_public (0006/0008/0013) los
            oculta para cualquier otra sesión; esta pantalla ya requiere
            ese rol para cargar. */}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold tracking-wide text-ink-soft uppercase">Descripción</h2>
        <FieldGroup>
          <FieldRow label="Marca">
            <RowInput value={form.brand} onChange={(e) => set("brand", e.target.value)} />
          </FieldRow>
          <FieldRow label="Modelo">
            <RowInput value={form.model} onChange={(e) => set("model", e.target.value)} />
          </FieldRow>
          <FieldRow label="No. de serie">
            <RowInput value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} />
          </FieldRow>
          <PickerField label="Área" value={form.area} options={areaOptions} onChange={(v) => set("area", v)} />
          <PickerField label="Tipo" value={form.type} options={typeOptions} onChange={(v) => set("type", v)} />
          <PickerField
            label="Ubicación"
            value={form.location}
            options={locationOptions}
            onChange={(v) => set("location", v)}
          />
          <FieldRow label="Alto (cm)">
            <RowInput
              type="number"
              step="0.1"
              min="0"
              value={form.height_cm}
              onChange={(e) => set("height_cm", e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Ancho (cm)">
            <RowInput
              type="number"
              step="0.1"
              min="0"
              value={form.width_cm}
              onChange={(e) => set("width_cm", e.target.value)}
            />
          </FieldRow>
          <FieldRow label="Largo (cm)">
            <RowInput
              type="number"
              step="0.1"
              min="0"
              value={form.length_cm}
              onChange={(e) => set("length_cm", e.target.value)}
            />
          </FieldRow>
        </FieldGroup>
        <LabeledTextarea
          label="Detalles"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold tracking-wide text-ink-soft uppercase">Estado del artículo</h2>
        <FieldGroup>
          <FieldRow label="Condición">
            <RowSelect
              value={form.condition_rating}
              onChange={(e) => set("condition_rating", e.target.value as FormState["condition_rating"])}
            >
              <option value="">Sin dato</option>
              {CONDITION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </RowSelect>
          </FieldRow>
          <FieldRow label="Años de uso">
            <RowInput
              type="number"
              step="0.1"
              min="0"
              value={form.years_in_use}
              onChange={(e) => set("years_in_use", e.target.value)}
            />
          </FieldRow>
        </FieldGroup>
        <LabeledTextarea
          label="Notas de condición"
          value={form.condition_notes}
          onChange={(e) => set("condition_notes", e.target.value)}
        />
        {/* maintenance_notes (db/migrations/0001: "repair history, separate
            from current condition") — a real column that had no home in
            this form until now; condition_notes above is the current
            state, this is what's been done to it over time. */}
        <LabeledTextarea
          label="Notas de mantenimiento"
          value={form.maintenance_notes}
          onChange={(e) => set("maintenance_notes", e.target.value)}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold tracking-wide text-ink-soft uppercase">Referencias</h2>
        {links.length > 0 && (
          <ul className="space-y-1.5">
            {links.map((link) => (
              <li key={link.id} className="flex items-center justify-between gap-2 rounded-md border border-line-strong px-3 py-2">
                <span className="min-w-0 truncate text-sm text-ink">{link.label || link.url}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteLink(link.id)}
                  aria-label="Eliminar referencia"
                  className="shrink-0 text-ink-faint"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            type="url"
            value={newLinkUrl}
            onChange={(e) => setNewLinkUrl(e.target.value)}
            placeholder="https://..."
            className="h-11 min-w-0 flex-1 rounded-md border border-line-strong bg-card px-3 text-sm text-ink"
          />
          <input
            type="text"
            value={newLinkLabel}
            onChange={(e) => setNewLinkLabel(e.target.value)}
            placeholder="Etiqueta (opcional)"
            className="h-11 w-32 rounded-md border border-line-strong bg-card px-3 text-sm text-ink"
          />
          <button
            type="button"
            onClick={handleAddLink}
            aria-label="Agregar referencia"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line-strong text-ink"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {linkError && <p className="text-sm text-red-600">{linkError}</p>}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="flex h-12 w-full items-center justify-center rounded-md bg-ink text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Guardando..." : "Guardar"}
      </button>

      {/* Same size/shape as items-list.tsx's "Agregar artículo" bar,
          just red — a deliberately distinct destructive action, never
          reachable without the confirm step below. */}
      <button
        type="button"
        onClick={() => setShowDeleteConfirm(true)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-negative text-sm font-semibold text-white"
      >
        <Trash2 className="h-5 w-5" aria-hidden="true" />
        Borrar artículo
      </button>

      {showDeleteConfirm && (
        <ModalSheet onBackdropClick={() => setShowDeleteConfirm(false)}>
          <h2 className="text-lg font-bold text-ink">¿Borrar este artículo?</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Esta acción no se puede deshacer. También se eliminarán sus fotos y referencias.
          </p>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="flex h-11 flex-1 items-center justify-center rounded-md border border-line-strong text-sm font-medium text-ink"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex h-11 flex-1 items-center justify-center rounded-md bg-negative text-sm font-semibold text-white disabled:opacity-50"
            >
              {deleting ? "Borrando..." : "Borrar"}
            </button>
          </div>
        </ModalSheet>
      )}
    </form>
  );
}
