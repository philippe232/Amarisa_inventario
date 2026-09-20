// Mirrors db/migrations/0001_init_schema.sql — keep in sync by hand,
// there's no generated-types step in this project yet.

export type ItemStatus = "for_sale" | "reserved" | "sold";

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
  years_in_use: number | null;
  condition_pct: number | null;
  condition_notes: string | null;
  maintenance_notes: string | null;
  has_factura: boolean | null;
  price_new: number | null;
  purchase_price: number | null;
  suggested_resale_price: number | null;
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
  // Count of wishlist_items rows for this item — e.g. via PostgREST's
  // embedded count (`.select("*, wishlist_items(count)")`) so it can
  // never drift out of sync with a stored counter.
  bidderCount: number;
};
