// Mirrors db/migrations/0001_init_schema.sql (plus 0003's additions to
// wishlist_items) — keep in sync by hand, there's no generated-types
// step in this project yet.

export type ItemStatus = "for_sale" | "reserved" | "sold";

// Short 4-point scale (db/migrations/0006) — replaces the old free-form
// 0-100 condition_pct with something that reads as a badge/color.
export type ConditionRating = "mint" | "very_good" | "needs_maintenance" | "needs_repair";

export type Item = {
  id: string;
  name: string;
  description: string | null;
  area: string | null;
  location: string | null;
  type: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  quantity: number;
  height_cm: number | null;
  width_cm: number | null;
  length_cm: number | null;
  years_in_use: number | null;
  condition_pct: number | null;
  condition_rating: ConditionRating | null;
  condition_notes: string | null;
  maintenance_notes: string | null;
  has_factura: boolean | null;
  price_new: number | null;
  purchase_price: number | null;
  // Internal research figure — only populated for Editor/Owner sessions
  // (items_public masks it to null for everyone else; see 0006).
  suggested_resale_price: number | null;
  // Manual override; same masking as suggested_resale_price.
  asking_price_override: number | null;
  // What buyers see: asking_price_override if set, else suggested_resale_price.
  // Always populated, public.
  asking_price: number | null;
  discount_pct: number | null;
  status: ItemStatus;
  created_at: string;
  updated_at: string;
};

export type ItemPhoto = {
  id: string;
  item_id: string;
  url: string;
  sort_order: number;
  created_at: string;
};

export type ItemLink = {
  id: string;
  item_id: string;
  url: string;
  label: string | null;
  created_at: string;
};

// The shape a list screen hands to ItemChip: the base row plus fields
// that only exist as query-time computations (never stored columns).
export type ItemListRow = Item & {
  primaryPhotoUrl: string | null;
  // Count of wishlist_items rows for this item, from the
  // item_wishlist_counts view (0003_wishlist_bids_and_ownership.sql) —
  // the base table's own RLS restricts it to each user's own rows, so
  // the public-facing count has to come from a view that aggregates
  // across everyone instead of an embedded per-row count.
  bidderCount: number;
};

export type WishlistItem = {
  id: string;
  user_id: string;
  item_id: string;
  contact_id: string | null;
  bid_amount: number | null;
  reviewed: boolean;
  created_at: string;
};
