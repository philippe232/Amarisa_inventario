import type { Item } from "@/lib/types";

// Shared by the list chip and the detail screen — brand + model reads
// better than the raw inventory name when both are known (most items
// don't have them yet, since the September count only captured name/
// description, not a separate brand/model split).
export function getDisplayName(item: Pick<Item, "brand" | "model" | "name">): string {
  if (item.brand && item.model) return `${item.brand} ${item.model}`;
  return item.name;
}

// "40 × 60 × 80 cm" (H×W×L) when all three are known. Dimensions are
// captured per-item as they're measured, so a partial reading falls
// back to labeled parts instead of an ambiguous "40 × 80 cm".
export function formatDimensions(item: Pick<Item, "height_cm" | "width_cm" | "length_cm">): string | null {
  const { height_cm, width_cm, length_cm } = item;
  if (height_cm != null && width_cm != null && length_cm != null) {
    return `${height_cm} × ${width_cm} × ${length_cm} cm`;
  }
  const labeled = [
    height_cm != null && `Alto ${height_cm} cm`,
    width_cm != null && `Ancho ${width_cm} cm`,
    length_cm != null && `Largo ${length_cm} cm`,
  ].filter((s): s is string => Boolean(s));
  return labeled.length > 0 ? labeled.join(", ") : null;
}
