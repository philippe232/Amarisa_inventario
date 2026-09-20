"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAdminRole } from "@/lib/auth";
import PhotoManager from "@/components/PhotoManager";
import type { Item, ItemLink, ItemPhoto, ItemStatus } from "@/lib/types";

const STATUS_OPTIONS: { value: ItemStatus; label: string }[] = [
  { value: "for_sale", label: "En venta" },
  { value: "reserved", label: "Reservado" },
  { value: "sold", label: "Vendido" },
];

function LabeledInput({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold tracking-wide text-ink-soft uppercase">{label}</span>
      <input
        {...props}
        className="h-11 w-full rounded-md border border-line-strong bg-card px-3 text-sm text-ink"
      />
    </label>
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
  years_in_use: string;
  condition_pct: string;
  condition_notes: string;
  maintenance_notes: string;
  has_factura: "unknown" | "yes" | "no";
  price_new: string;
  purchase_price: string;
  suggested_resale_price: string;
  status: ItemStatus;
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
    years_in_use: item.years_in_use != null ? String(item.years_in_use) : "",
    condition_pct: item.condition_pct != null ? String(item.condition_pct) : "",
    condition_notes: item.condition_notes ?? "",
    maintenance_notes: item.maintenance_notes ?? "",
    has_factura: item.has_factura == null ? "unknown" : item.has_factura ? "yes" : "no",
    price_new: item.price_new != null ? String(item.price_new) : "",
    purchase_price: item.purchase_price != null ? String(item.purchase_price) : "",
    suggested_resale_price: item.suggested_resale_price != null ? String(item.suggested_resale_price) : "",
    status: item.status,
  };
}

function numOrNull(s: string): number | null {
  const trimmed = s.trim();
  return trimmed === "" ? null : Number(trimmed);
}

export default function ItemEditForm({ id }: { id: string }) {
  const supabase = createClient();
  const router = useRouter();
  const { role, loading: roleLoading } = useAdminRole();

  const [item, setItem] = useState<Item | null>(null);
  const [photos, setPhotos] = useState<ItemPhoto[]>([]);
  const [links, setLinks] = useState<ItemLink[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [itemRes, photosRes, linksRes] = await Promise.all([
        supabase.from("items").select("*").eq("id", id).single(),
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
      setForm(toFormState(itemRes.data as Item));
      setPhotos((photosRes.data ?? []) as ItemPhoto[]);
      setLinks((linksRes.data ?? []) as ItemLink[]);
      setError(null);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, id]);

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
        years_in_use: numOrNull(form.years_in_use),
        condition_pct: numOrNull(form.condition_pct),
        condition_notes: form.condition_notes || null,
        maintenance_notes: form.maintenance_notes || null,
        has_factura: form.has_factura === "unknown" ? null : form.has_factura === "yes",
        price_new: numOrNull(form.price_new),
        purchase_price: numOrNull(form.purchase_price),
        suggested_resale_price: numOrNull(form.suggested_resale_price),
        status: form.status,
      })
      .eq("id", id);

    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.push(`/items/${id}`);
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

  if (roleLoading || loading) return <p className="p-4 text-sm text-ink-soft">Cargando...</p>;

  // Client-side gate for UX only — RLS (is_admin()) is what actually
  // stops a non-admin from writing, even if this check were somehow
  // bypassed.
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

  if (error && !form) return <p className="p-4 text-sm text-red-600">Error: {error}</p>;
  if (!item || !form) return null;

  return (
    <form onSubmit={handleSave} className="space-y-6 px-3.5 py-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink">Editar artículo</h1>
        <Link href={`/items/${id}`} className="text-sm text-ink-soft">
          Cancelar
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="text-xs font-bold tracking-wide text-ink-soft uppercase">Fotos</h2>
        <PhotoManager itemId={id} photos={photos} onChange={setPhotos} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold tracking-wide text-ink-soft uppercase">Encabezado</h2>
        <LabeledInput label="Nombre" required value={form.name} onChange={(e) => set("name", e.target.value)} />
        <LabeledTextarea label="Descripción" value={form.description} onChange={(e) => set("description", e.target.value)} />
        <label className="block">
          <span className="mb-1 block text-xs font-bold tracking-wide text-ink-soft uppercase">Estado</span>
          <select
            value={form.status}
            onChange={(e) => set("status", e.target.value as ItemStatus)}
            className="h-11 w-full rounded-md border border-line-strong bg-card px-3 text-sm text-ink"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold tracking-wide text-ink-soft uppercase">Precio</h2>
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput
            label="Precio nuevo"
            type="number"
            step="0.01"
            min="0"
            value={form.price_new}
            onChange={(e) => set("price_new", e.target.value)}
          />
          <LabeledInput
            label="Precio de venta"
            type="number"
            step="0.01"
            min="0"
            value={form.suggested_resale_price}
            onChange={(e) => set("suggested_resale_price", e.target.value)}
          />
          <LabeledInput
            label="Precio de compra"
            type="number"
            step="0.01"
            min="0"
            value={form.purchase_price}
            onChange={(e) => set("purchase_price", e.target.value)}
          />
          <label className="block">
            <span className="mb-1 block text-xs font-bold tracking-wide text-ink-soft uppercase">Factura</span>
            <select
              value={form.has_factura}
              onChange={(e) => set("has_factura", e.target.value as FormState["has_factura"])}
              className="h-11 w-full rounded-md border border-line-strong bg-card px-3 text-sm text-ink"
            >
              <option value="unknown">Sin dato</option>
              <option value="yes">Sí</option>
              <option value="no">No</option>
            </select>
          </label>
        </div>
        {item.discount_pct != null && (
          <p className="text-xs text-ink-soft">Descuento calculado: {item.discount_pct}% (se actualiza solo al guardar precios)</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold tracking-wide text-ink-soft uppercase">Datos del artículo</h2>
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Marca" value={form.brand} onChange={(e) => set("brand", e.target.value)} />
          <LabeledInput label="Modelo" value={form.model} onChange={(e) => set("model", e.target.value)} />
          <LabeledInput label="Área" value={form.area} onChange={(e) => set("area", e.target.value)} />
          <LabeledInput label="Tipo" value={form.type} onChange={(e) => set("type", e.target.value)} />
          <LabeledInput label="Ubicación" value={form.location} onChange={(e) => set("location", e.target.value)} />
          <LabeledInput label="No. de serie" value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} />
          <LabeledInput
            label="Cantidad"
            type="number"
            min="1"
            value={form.quantity}
            onChange={(e) => set("quantity", e.target.value)}
          />
          <LabeledInput
            label="Años de uso"
            type="number"
            step="0.1"
            min="0"
            value={form.years_in_use}
            onChange={(e) => set("years_in_use", e.target.value)}
          />
          <LabeledInput
            label="Condición (%)"
            type="number"
            min="0"
            max="100"
            value={form.condition_pct}
            onChange={(e) => set("condition_pct", e.target.value)}
          />
        </div>
        <LabeledTextarea
          label="Notas de condición"
          value={form.condition_notes}
          onChange={(e) => set("condition_notes", e.target.value)}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold tracking-wide text-ink-soft uppercase">Historial de mantenimiento</h2>
        <LabeledTextarea
          label="Notas"
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
    </form>
  );
}
