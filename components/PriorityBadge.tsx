import { PRIORITY_LABELS } from "@/lib/priority";
import type { ItemPriority } from "@/lib/types";

// Same outline-badge shape as ConditionBadge/StatusBadge — urgent to
// calm reads as red -> yellow -> neutral, not a best-to-worst scale.
const COLORS: Record<ItemPriority, string> = {
  alta: "border-negative/30 bg-negative/10 text-negative",
  media: "border-yellow/30 bg-yellow/10 text-yellow",
  baja: "border-neutral/30 bg-neutral/10 text-neutral",
};

export default function PriorityBadge({ priority }: { priority: ItemPriority }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${COLORS[priority]}`}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
