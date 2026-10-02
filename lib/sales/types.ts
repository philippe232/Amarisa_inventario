// Mirrors db/migrations/0029_item_sales.sql, 0030's factura/SPEI
// rework and 0032's quantity — kept by hand, same convention as lib/types.ts for items.

export type PaymentMethod = "efectivo" | "spei" | "otro";

export type ItemSale = {
  id: string;
  item_id: string;
  // Price per unit; the amounts owed below are already multiplied by
  // quantity (db/migrations/0032).
  final_price: number;
  quantity: number;
  // Whether the buyer requested a factura — the real trigger for IVA,
  // not an abstract "was it already included" toggle. iva_amount is
  // only ever non-null when this is true (16% of final_price);
  // total_with_iva is always "what's owed in total" either way.
  requires_invoice: boolean;
  iva_amount: number | null;
  total_with_iva: number;
  buyer_name: string | null;
  buyer_contact: string | null;
  notes: string | null;
  sold_by: string | null;
  sold_at: string;
  updated_at: string;
};

export type ItemSalePayment = {
  id: string;
  item_sale_id: string;
  amount: number;
  method: PaymentMethod;
  paid_at: string;
  note: string | null;
  created_at: string;
};
