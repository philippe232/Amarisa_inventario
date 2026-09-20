import type { Item } from "@/lib/types";

// Shared by the list chip and the detail screen — brand + model reads
// better than the raw inventory name when both are known (most items
// don't have them yet, since the September count only captured name/
// description, not a separate brand/model split).
export function getDisplayName(item: Pick<Item, "brand" | "model" | "name">): string {
  if (item.brand && item.model) return `${item.brand} ${item.model}`;
  return item.name;
}
