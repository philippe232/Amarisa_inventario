import type { Item, ItemStatus } from "@/lib/types";

// Shared by the list chip and the detail screen. Brand/model are entered
// for matching purposes (see match-compras) and are often a placeholder
// like "SN"/"SIN MARCA" rather than real data, so they're never a safe
// stand-in for the actual item name — always show the raw `name` field,
// same as the revisión screen's Artículo column already does.
export function getDisplayName(item: Pick<Item, "name">): string {
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

// What the catalog treats an item's status as. "Sold" is a fact about the
// sales (every unit is in a closed order), but items.status is also an
// ordinary field — the Estado selects on the edit form and in Revisión can
// set it back to "En venta" after the order closed, and then a sold article
// kept showing up as available. So an item whose units are all sold counts
// as sold whatever the field says; a hand-set "sold" is kept as is.
// units_sold only exists on rows read through items_public.
export function effectiveStatus(item: Pick<Item, "status" | "quantity" | "units_sold">): ItemStatus {
  if (item.status === "sold") return "sold";
  return item.quantity > 0 && (item.units_sold ?? 0) >= item.quantity ? "sold" : item.status;
}
