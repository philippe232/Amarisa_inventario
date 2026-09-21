import { ImageOff, Users } from "lucide-react";
import Row from "@/components/Row";
import { formatCurrency } from "@/lib/currency";
import { getDisplayName } from "@/lib/items";
import type { ItemListRow } from "@/lib/types";

// Ported from reference/cereza/app/(shell)/gastos/gastos-list.tsx's inline
// row content (icon + primary/secondary left + primary/secondary right),
// wrapped in the same Row "line" container. Same 5-slot structure, new
// data mapping for Amarisa's resale catalog instead of Cereza's ledger.

function ItemPhoto({ url, alt }: { url: string | null; alt: string }) {
  if (url) {
    return (
      <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-line bg-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} className="h-full w-full object-cover" />
      </span>
    );
  }
  // No photo yet — most items haven't been shot. Same bordered-badge
  // treatment as Cereza's icon slot, just square instead of circular
  // (a photo thumbnail reads better as a rounded square than a circle
  // crop once real photos land here).
  return (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-card text-ink-faint">
      <ImageOff className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

function bidderLabel(count: number): string {
  if (count === 0) return "Sin interesados";
  if (count === 1) return "1 interesado";
  return `${count} interesados`;
}

export default function ItemChip({ item, href }: { item: ItemListRow; href?: string }) {
  const displayName = getDisplayName(item);

  return (
    <Row variant="line" href={href}>
      <ItemPhoto url={item.primaryPhotoUrl} alt={displayName} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-bold text-ink">{displayName}</p>
        <div className="mt-0.5 flex items-center gap-1 text-[13px] text-ink-soft">
          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{bidderLabel(item.bidderCount)}</span>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-[16px] font-bold text-ink [font-variant-numeric:tabular-nums]">
          {item.asking_price != null ? formatCurrency(item.asking_price) : "—"}
        </p>
        {item.purchase_price != null && (
          <p className="mt-0.5 text-[12px] text-ink-faint line-through [font-variant-numeric:tabular-nums]">
            {formatCurrency(item.purchase_price)}
          </p>
        )}
      </div>
    </Row>
  );
}
