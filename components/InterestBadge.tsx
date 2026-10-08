import { Flame } from "lucide-react";

// "Ya ofertaron": other people have already put this article on their list,
// so the next buyer sees it's wanted. Filled gold with a flame — meant to
// catch the eye, which is why it's not part of StatusBadge's quiet outline
// set. Shown only while the article is still for sale.
export default function InterestBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-yellow bg-yellow font-bold text-ink ${
        compact ? "px-2 py-px text-[11px] leading-5 tracking-wide uppercase" : "px-2.5 py-0.5 text-xs"
      }`}
    >
      <Flame className={`${compact ? "h-3 w-3" : "h-3.5 w-3.5"} shrink-0 fill-red-700 text-red-700`} aria-hidden="true" />
      Ya ofertaron
    </span>
  );
}
