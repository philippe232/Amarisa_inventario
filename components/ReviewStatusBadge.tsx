import { REVIEW_STATUS_LABELS } from "@/lib/review-status";
import type { ItemReviewStatus } from "@/lib/types";

// Same outline-badge shape as StatusBadge/PriorityBadge — unprocessed
// -> in progress -> cleared reads as neutral -> yellow -> positive.
const COLORS: Record<ItemReviewStatus, string> = {
  nuevo: "border-neutral/30 bg-neutral/10 text-neutral",
  en_revision: "border-yellow/30 bg-yellow/10 text-yellow",
  aprobado: "border-positive/30 bg-positive/10 text-positive",
};

export default function ReviewStatusBadge({ status }: { status: ItemReviewStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${COLORS[status]}`}>
      {REVIEW_STATUS_LABELS[status]}
    </span>
  );
}
