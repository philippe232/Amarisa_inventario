import type { Item } from "@/lib/types";

// Items priced ABOVE this (per unit, in MXN) are "Equipo y muebles"; at or
// below it, or with no price yet, they're "Gangas". The one place this
// number lives — change it here and the list, detail and filters follow.
export const BIG_TICKET_THRESHOLD = 500;

export type Tier = "equipo" | "gangas";

// Stored on items.tier_override (0045); null = automatic.
export type TierOverride = Tier;

export const TIER_LABELS: Record<Tier, string> = {
  equipo: "Equipo y muebles",
  gangas: "Gangas",
};

// The effective tier: the manual override if one is set, otherwise derived
// from the price buyers see. Never stored (so it can't drift when a price
// changes, and an override survives price edits) — every screen goes
// through this instead of re-deriving it.
//
// Uses asking_price, not suggested_resale_price: items_public masks the
// latter to null for anyone who isn't Editor/Owner, which would make every
// item a "ganga" for buyers; asking_price is the public figure
// (asking_price_override if set, else suggested_resale_price).
export function getEffectiveTier(item: Pick<Item, "asking_price" | "tier_override">): Tier {
  if (item.tier_override) return item.tier_override;
  return item.asking_price != null && item.asking_price > BIG_TICKET_THRESHOLD ? "equipo" : "gangas";
}
