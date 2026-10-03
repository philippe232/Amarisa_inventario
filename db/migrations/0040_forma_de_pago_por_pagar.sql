-- "Por Pagar" joins the order's forma de pago (Efectivo, SPEI - 8055,
-- SPEI - PAS, Por Pagar): the buyer hasn't paid yet / will pay later.
-- Only the order's forma de pago gets it — an individual payment is money
-- actually received, so sale_order_payments.method keeps the three real
-- methods.
alter table sale_orders drop constraint sale_orders_payment_method_check;
alter table sale_orders add constraint sale_orders_payment_method_check
  check (payment_method in ('efectivo', 'spei_8055', 'spei_pas', 'por_pagar'));
