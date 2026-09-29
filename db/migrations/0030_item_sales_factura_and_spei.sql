-- Replaces the generic "was IVA already included in the price" toggle
-- with the real business trigger: whether the buyer requested a
-- factura. Most sales here are informal/cash and never touch IVA at
-- all; final_price is simply what's paid. Only when a factura is
-- requested does IVA become a real amount (16% of final_price) that
-- needs adding on top and actually transferring.
--
-- Safe as a straight rename + regenerate — item_sales has never carried
-- real rows for more than a few minutes at a time (every test sale
-- this session was cleaned up immediately after verifying it).

-- Generated columns can't have their expression altered in place; drop
-- and re-add.
alter table item_sales drop column total_with_iva;

alter table item_sales rename column iva_included to requires_invoice;
alter table item_sales alter column requires_invoice set default false;

-- Only meaningful (non-null) when a factura is actually requested.
alter table item_sales add column iva_amount numeric(12,2) generated always as (
  case when requires_invoice then round(final_price * 0.16, 2) end
) stored;

-- Always "what's owed in total" regardless of the requires_invoice
-- state — final_price alone when there's no factura to worry about,
-- final_price + IVA (the amount to actually transfer) when there is.
alter table item_sales add column total_with_iva numeric(12,2) generated always as (
  case when requires_invoice then round(final_price * 1.16, 2) else final_price end
) stored;

-- "Transferencia" -> "SPEI" (Mexico's actual interbank transfer system
-- name — more precise than the generic term, and what Philippe actually
-- calls it). No existing rows reference the old value (same reasoning
-- as above), so a straight constraint swap is safe.
alter table item_sale_payments drop constraint item_sale_payments_method_check;
alter table item_sale_payments add constraint item_sale_payments_method_check check (method in ('efectivo', 'spei', 'otro'));
