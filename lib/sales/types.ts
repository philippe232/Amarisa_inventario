// Mirrors db/migrations/0029_item_sales.sql, 0030's factura/SPEI
// rework, 0032's quantity, 0034's payment_method and 0035's orders — kept by hand, same convention as lib/types.ts for items.

// The three ways a sale is paid: cash, or a SPEI transfer into one of two
// accounts (db/migrations/0039).
export type PaymentMethod = "efectivo" | "spei_8055" | "spei_pas";

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
  // How the buyer is paying; null only on rows saved before 0034.
  payment_method: PaymentMethod | null;
  requires_invoice: boolean;
  iva_amount: number | null;
  total_with_iva: number;
  buyer_name: string | null;
  buyer_contact: string | null;
  notes: string | null;
  sold_by: string | null;
  sold_at: string;
  updated_at: string;
  // Cart line (0035): the order it belongs to, and the exact amount paid
  // for the line. Both null on rows from before orders existed.
  order_id: string | null;
  line_total: number | null;
};

export type OrderStatus = "open" | "closed";

// A cart / pedido — one per buyer, holding article lines (ItemSale rows
// with order_id set). Closing it is the "checkout".
export type SaleOrder = {
  id: string;
  name: string;
  buyer_contact: string | null;
  notes: string | null;
  status: OrderStatus;
  requires_invoice: boolean;
  payment_method: PaymentMethod | null;
  created_by: string | null;
  created_at: string;
  closed_at: string | null;
  updated_at: string;
};

export type OrderPayment = {
  id: string;
  order_id: string;
  amount: number;
  method: PaymentMethod;
  paid_at: string;
  note: string | null;
  created_at: string;
};
