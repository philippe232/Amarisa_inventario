import type { ItemPriority } from "@/lib/types";

// Ordered urgent to calm — same order used everywhere this scale
// appears (badge, edit-form select, revisión's sort rank).
export const PRIORITY_OPTIONS: { value: ItemPriority; label: string }[] = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "baja", label: "Baja" },
];

export const PRIORITY_LABELS: Record<ItemPriority, string> = Object.fromEntries(
  PRIORITY_OPTIONS.map((o) => [o.value, o.label]),
) as Record<ItemPriority, string>;
