"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSessionInfo } from "@/lib/auth";
import { CONDITION_OPTIONS } from "@/lib/condition";
import PhotoManager from "@/components/PhotoManager";
import type { ConditionRating, Item, ItemLink, ItemPhoto, ItemStatus } from "@/lib/types";

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
  height_cm: string;
  width_cm: string;
  length_cm: string;
  years_in_use: string;
  condition_rating: ConditionRating | "";
  condition_notes: string;
  has_factura: "unknown" | "yes" | "no";
  purchase_price: string;
  suggested_resale_price: string;
  asking_price_override: string;
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
    height_cm: item.height_cm != null ? String(item.height_cm) : "",
    width_cm: item.width_cm != null ? String(item.width_cm) : "",
    length_cm: item.length_cm != null ? String(item.length_cm) : "",
    years_in_use: item.years_in_use != null ? String(item.years_in_use) : "",
    condition_rating: item.condition_rating ?? "",
    condition_notes: item.condition_notes ?? "",
    has_factura: item.has_factura == null ? "unknown" : item.has_factura ? "yes" : "no",
    purchase_price: item.purchase_price != null ? String(item.purchase_price) : "",
    suggested_resale_price: item.suggested_resale_price != null ? String(item.suggested_resale_price) : "",
    asking_price_override: item.asking_price_override != null ? String(item.asking_price_override) : "",
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
  const { role, loading: roleLoading } = useSessionInfo();

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
        has_factura: form.has_factura === "unknown" ? null : form.has_factura === "yes",
        purchase_price: numOrNull(form.purchase_price),
        suggested_resale_price: numOrNull(form.suggested_resale_price),
        asking_price_override: numOrNull(form.asking_price_override),
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
            label="Precio de compra original"
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
          <LabeledInput
            label="Precio sugerido (investigación)"
            type="number"
            step="0.01"
            min="0"
            value={form.suggested_resale_price}
            onChange={(e) => set("suggested_resale_price", e.target.value)}
          />
          <LabeledInput
            label="Precio de venta (anula el sugerido)"
            type="number"
            step="0.01"
            min="0"
            value={form.asking_price_override}
            onChange={(e) => set("asking_price_override", e.target.value)}
          />
        </div>
        <p className="text-xs text-ink-soft">
          {form.asking_price_override
            ? "Precio al público: el de venta (arriba)."
            : "Precio al público: el sugerido, hasta que captures uno de venta."}
          {item.discount_pct != null && ` Descuento vs. compra: ${item.discount_pct}% (se actualiza solo al guardar).`}
        </p>
        {/* Precio sugerido/de venta solo las ve Editor/Owner — items_public
            (0006) los oculta para cualquier otra sesión; esta pantalla ya
            requiere ese rol para cargar. */}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold tracking-wide text-ink-soft uppercase">Descripción</h2>
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Marca" value={form.brand} onChange={(e) => set("brand", e.target.value)} />
          <LabeledInput label="Modelo" value={form.model} onChange={(e) => set("model", e.target.value)} />
          <LabeledInput label="No. de serie" value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} />
          <LabeledInput label="Área" value={form.area} onChange={(e) => set("area", e.target.value)} />
          <LabeledInput label="Tipo" value={form.type} onChange={(e) => set("type", e.target.value)} />
          <LabeledInput label="Ubicación" value={form.location} onChange={(e) => set("location", e.target.value)} />
          <LabeledInput
            label="Cantidad disponible"
            type="number"
            min="1"
            value={form.quantity}
            onChange={(e) => set("quantity", e.target.value)}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <LabeledInput
            label="Alto (cm)"
            type="number"
            step="0.1"
            min="0"
            value={form.height_cm}
            onChange={(e) => set("height_cm", e.target.value)}
          />
          <LabeledInput
            label="Ancho (cm)"
            type="number"
            step="0.1"
            min="0"
            value={form.width_cm}
            onChange={(e) => set("width_cm", e.target.value)}
          />
          <LabeledInput
            label="Largo (cm)"
            type="number"
            step="0.1"
            min="0"
            value={form.length_cm}
            onChange={(e) => set("length_cm", e.target.value)}
          />
        </div>
        <LabeledTextarea
          label="Descripción"
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold tracking-wide text-ink-soft uppercase">Estado del artículo</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold tracking-wide text-ink-soft uppercase">Condición</span>
            <select
              value={form.condition_rating}
              onChange={(e) => set("condition_rating", e.target.value as FormState["condition_rating"])}
              className="h-11 w-full rounded-md border border-line-strong bg-card px-3 text-sm text-ink"
            >
              <option value="">Sin dato</option>
              {CONDITION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <LabeledInput
            label="Años de uso"
            type="number"
            step="0.1"
            min="0"
            value={form.years_in_use}
            onChange={(e) => set("years_in_use", e.target.value)}
          />
        </div>
        <LabeledTextarea
          label="Notas de mantenimiento/servicio"
          value={form.condition_notes}
          onChange={(e) => set("condition_notes", e.target.value)}
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
