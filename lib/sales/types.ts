// Mirrors db/migrations/0029_item_sales.sql — kept by hand, same
// convention as lib/types.ts for the items table.

export type PaymentMethod = "efectivo" | "transferencia" | "otro";

export type ItemSale = {
  id: string;
  item_id: string;
  final_price: number;
  iva_included: boolean;
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
