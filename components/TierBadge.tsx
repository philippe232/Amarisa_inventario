import { TIER_LABELS, type Tier } from "@/lib/tier";

// The effective tier as a tag (see getEffectiveTier). Neutral on purpose:
// it's a category, not a status, so it shouldn't compete with the status
// and priority badges beside it.
export default function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line-strong bg-page px-2.5 py-0.5 text-xs font-bold text-ink">
      {TIER_LABELS[tier]}
    </span>
  );
}
