-- A sale can cover several units of a multi-unit item (123 of the 264
-- items have quantity > 1). final_price stays the price PER UNIT — what
-- the buyer agreed to pay for one piece, comparable to the item's own
-- asking_price — and the amounts owed scale with quantity:
--   subtotal = final_price * quantity
--   iva      = 16% of the subtotal (only with a factura)
--   total    = subtotal (+ iva)
--
-- The upper bound (quantity <= items.quantity) spans two tables, so it
-- lives in the UI rather than a CHECK. Existing rows (none in practice)
-- default to quantity 1, which leaves their totals unchanged.

-- Generated columns can't be altered in place; drop and re-add.
alter table item_sales drop column total_with_iva;
alter table item_sales drop column iva_amount;

alter table item_sales add column quantity integer not null default 1 check (quantity > 0);

alter table item_sales add column iva_amount numeric(12,2) generated always as (
  case when requires_invoice then round(final_price * quantity * 0.16, 2) end
) stored;

alter table item_sales add column total_with_iva numeric(12,2) generated always as (
  case when requires_invoice then round(final_price * quantity * 1.16, 2) else final_price * quantity end
) stored;
