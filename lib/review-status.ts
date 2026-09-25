import type { ItemReviewStatus } from "@/lib/types";

// Pipeline order — same order used everywhere this scale appears
// (badge, edit-form select, revisión's sort rank).
export const REVIEW_STATUS_OPTIONS: { value: ItemReviewStatus; label: string }[] = [
  { value: "nuevo", label: "Nuevo" },
  { value: "en_revision", label: "En revisión" },
  { value: "aprobado", label: "Aprobado" },
];

export const REVIEW_STATUS_LABELS: Record<ItemReviewStatus, string> = Object.fromEntries(
  REVIEW_STATUS_OPTIONS.map((o) => [o.value, o.label]),
) as Record<ItemReviewStatus, string>;
