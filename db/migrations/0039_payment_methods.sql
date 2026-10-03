-- The payment options are exactly three: Efectivo, SPEI - 8055 and
-- SPEI - PAS (two different bank accounts a transfer can land in). That
-- replaces the earlier efectivo / spei / otro. Nothing existing needed
-- converting (the only order is efectivo, with no payments); if a row
-- with an old value did exist, adding a constraint would fail and this
-- migration would roll back instead of silently rewriting it.
--
-- All four tables that carry a method are aligned, including the two
-- from before carts (item_sales, item_sale_payments), so the database
-- agrees on one set.
alter table sale_orders drop constraint sale_orders_payment_method_check;
alter table sale_orders add constraint sale_orders_payment_method_check
  check (payment_method in ('efectivo', 'spei_8055', 'spei_pas'));

alter table sale_order_payments drop constraint sale_order_payments_method_check;
alter table sale_order_payments add constraint sale_order_payments_method_check
  check (method in ('efectivo', 'spei_8055', 'spei_pas'));

alter table item_sales drop constraint item_sales_payment_method_check;
alter table item_sales add constraint item_sales_payment_method_check
  check (payment_method in ('efectivo', 'spei_8055', 'spei_pas'));

alter table item_sale_payments drop constraint item_sale_payments_method_check;
alter table item_sale_payments add constraint item_sale_payments_method_check
  check (method in ('efectivo', 'spei_8055', 'spei_pas'));
