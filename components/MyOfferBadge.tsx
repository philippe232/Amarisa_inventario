import { Check } from "lucide-react";

// "Yo oferté": the viewer has this article on their own list. Solid dark,
// the calm counterpart to InterestBadge's gold — one says "others want it",
// this one says "you're already in".
export default function MyOfferBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-ink bg-ink font-bold text-white ${
        compact ? "px-2 py-px text-[11px] leading-5 tracking-wide uppercase" : "px-2.5 py-0.5 text-xs"
      }`}
    >
      <Check className={`${compact ? "h-3 w-3" : "h-3.5 w-3.5"} shrink-0`} strokeWidth={3} aria-hidden="true" />
      Yo oferté
    </span>
  );
}
