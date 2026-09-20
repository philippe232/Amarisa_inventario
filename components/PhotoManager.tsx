"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Images, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ItemPhoto } from "@/lib/types";

// Android/iOS chooser split ported from reference/cereza/app/photo-
// capture.tsx's own header comment: a plain accept="image/*" input opens
// the OS's full menu (camera + gallery) on iOS, but on Android 13+ it
// opens the system Photo Picker with NO camera entry point — so Android
// gets its own small chooser offering both paths via two separate
// inputs, one of them capture="environment".
function isAndroid() {
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
}

export default function PhotoManager({
  itemId,
  photos,
  onChange,
}: {
  itemId: string;
  photos: ItemPhoto[];
  onChange: (photos: ItemPhoto[]) => void;
}) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [showAndroidChooser, setShowAndroidChooser] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAddTap() {
    if (isAndroid()) setShowAndroidChooser(true);
    else fileInputRef.current?.click();
  }

  async function handleFileSelected(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${itemId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("item-photos").upload(path, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("item-photos").getPublicUrl(path);
      const nextSortOrder = photos.length > 0 ? Math.max(...photos.map((p) => p.sort_order)) + 1 : 0;
      const { data, error: insertError } = await supabase
        .from("item_photos")
        .insert({ item_id: itemId, url: urlData.publicUrl, sort_order: nextSortOrder })
        .select("*")
        .single();
      if (insertError) throw insertError;

      onChange([...photos, data as ItemPhoto]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(photo: ItemPhoto) {
    setError(null);
    const { error: deleteError } = await supabase.from("item_photos").delete().eq("id", photo.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    // Best-effort storage cleanup — the row is already gone either way,
    // so a failure here (e.g. an already-missing object) isn't surfaced.
    const path = photo.url.split("/item-photos/")[1];
    if (path) await supabase.storage.from("item-photos").remove([path]);
    onChange(photos.filter((p) => p.id !== photo.id));
  }

  async function handleMove(photo: ItemPhoto, direction: "left" | "right") {
    const sorted = [...photos].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((p) => p.id === photo.id);
    const swapIdx = direction === "left" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];

    setError(null);
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("item_photos").update({ sort_order: other.sort_order }).eq("id", photo.id),
      supabase.from("item_photos").update({ sort_order: photo.sort_order }).eq("id", other.id),
    ]);
    if (e1 || e2) {
      setError((e1 ?? e2)!.message);
      return;
    }
    onChange(
      photos.map((p) => {
        if (p.id === photo.id) return { ...p, sort_order: other.sort_order };
        if (p.id === other.id) return { ...p, sort_order: photo.sort_order };
        return p;
      }),
    );
  }

  const sorted = [...photos].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {sorted.map((photo, idx) => (
          <div key={photo.id} className="shrink-0">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="h-24 w-24 rounded-lg border border-line-strong object-cover" />
              <button
                type="button"
                onClick={() => handleDelete(photo)}
                aria-label="Eliminar foto"
                className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-1 flex justify-center gap-1">
              <button
                type="button"
                onClick={() => handleMove(photo, "left")}
                disabled={idx === 0}
                aria-label="Mover a la izquierda"
                className="text-ink-soft disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => handleMove(photo, "right")}
                disabled={idx === sorted.length - 1}
                aria-label="Mover a la derecha"
                className="text-ink-soft disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={handleAddTap}
          disabled={uploading}
          className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong text-ink-faint disabled:opacity-50"
        >
          <ImagePlus className="h-6 w-6" aria-hidden="true" />
          <span className="text-xs">{uploading ? "Subiendo..." : "Agregar"}</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFileSelected(e.target.files?.[0] ?? null)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileSelected(e.target.files?.[0] ?? null)}
      />

      {showAndroidChooser && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/30 sm:items-center"
          onClick={() => setShowAndroidChooser(false)}
        >
          <div
            className="w-full max-w-md rounded-t-lg bg-white p-3 shadow-lg sm:rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                setShowAndroidChooser(false);
                cameraInputRef.current?.click();
              }}
              className="flex h-12 w-full items-center gap-3 rounded-md px-3 text-left text-ink"
            >
              <Camera className="h-5 w-5" aria-hidden="true" />
              Tomar foto
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAndroidChooser(false);
                fileInputRef.current?.click();
              }}
              className="flex h-12 w-full items-center gap-3 rounded-md px-3 text-left text-ink"
            >
              <Images className="h-5 w-5" aria-hidden="true" />
              Elegir de galería o archivo
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
