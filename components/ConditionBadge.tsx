import { CONDITION_LABELS } from "@/lib/condition";
import type { ConditionRating } from "@/lib/types";

// Same outline-badge shape as StatusBadge — deep green -> light green ->
// yellow -> orange reads as a best-to-worst scale.
const COLORS: Record<ConditionRating, string> = {
  very_good: "border-positive/30 bg-positive/10 text-positive",
  good: "border-positive-light/30 bg-positive-light/10 text-positive-light",
  needs_maintenance: "border-yellow/30 bg-yellow/10 text-yellow",
  needs_repair: "border-orange/30 bg-orange/10 text-orange",
};

export default function ConditionBadge({ rating }: { rating: ConditionRating }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${COLORS[rating]}`}>
      {CONDITION_LABELS[rating]}
    </span>
  );
}
