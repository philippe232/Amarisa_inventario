-- Two more ways to pay: CLIP (card terminal) and "En especie" (paid in
-- goods/services rather than money). The commission CLIP charges (2.6% +
-- IVA on the commission) isn't stored — it's computed from the payment's
-- amount wherever net income is shown — so no new column.
--
-- Payments take the five real methods; an order's forma de pago takes
-- those plus "por_pagar". The two pre-cart tables are kept in line with
-- the payment methods, as in 0039.
alter table sale_order_payments drop constraint sale_order_payments_method_check;
alter table sale_order_payments add constraint sale_order_payments_method_check
  check (method in ('efectivo', 'spei_8055', 'spei_pas', 'clip', 'en_especie'));

alter table sale_orders drop constraint sale_orders_payment_method_check;
alter table sale_orders add constraint sale_orders_payment_method_check
  check (payment_method in ('efectivo', 'spei_8055', 'spei_pas', 'clip', 'en_especie', 'por_pagar'));

alter table item_sales drop constraint item_sales_payment_method_check;
alter table item_sales add constraint item_sales_payment_method_check
  check (payment_method in ('efectivo', 'spei_8055', 'spei_pas', 'clip', 'en_especie'));

alter table item_sale_payments drop constraint item_sale_payments_method_check;
alter table item_sale_payments add constraint item_sale_payments_method_check
  check (method in ('efectivo', 'spei_8055', 'spei_pas', 'clip', 'en_especie'));
