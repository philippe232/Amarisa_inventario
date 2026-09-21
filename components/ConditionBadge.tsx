import { CONDITION_LABELS } from "@/lib/condition";
import type { ConditionRating } from "@/lib/types";

// Same outline-badge shape as StatusBadge — green→gray→amber→red reads
// as a best-to-worst scale without needing a 4th brand-new hue.
const COLORS: Record<ConditionRating, string> = {
  mint: "border-positive/30 bg-positive/10 text-positive",
  very_good: "border-neutral/30 bg-neutral/10 text-neutral",
  needs_maintenance: "border-caution/30 bg-caution/10 text-caution",
  needs_repair: "border-negative/30 bg-negative/10 text-negative",
};

export default function ConditionBadge({ rating }: { rating: ConditionRating }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${COLORS[rating]}`}>
      {CONDITION_LABELS[rating]}
    </span>
  );
}
