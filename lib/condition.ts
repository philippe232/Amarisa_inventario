import type { ConditionRating } from "@/lib/types";

// Short Mexican-Spanish labels, ordered best to worst — same order used
// everywhere this scale appears (badge, edit-form select).
export const CONDITION_OPTIONS: { value: ConditionRating; label: string }[] = [
  { value: "very_good", label: "Muy bueno" },
  { value: "good", label: "Bueno" },
  { value: "needs_maintenance", label: "Necesita mantenimiento" },
  { value: "needs_repair", label: "Requiere reparación" },
];

export const CONDITION_LABELS: Record<ConditionRating, string> = Object.fromEntries(
  CONDITION_OPTIONS.map((o) => [o.value, o.label]),
) as Record<ConditionRating, string>;
