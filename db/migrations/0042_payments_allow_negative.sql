-- A payment can be negative: money handed back (a refund, a returned
-- deposit, a correction). Zero stays out — a $0 payment records nothing.
-- Totals already just sum the payments, so a negative one reduces what's
-- counted as paid.
alter table sale_order_payments drop constraint sale_order_payments_amount_check;
alter table sale_order_payments add constraint sale_order_payments_amount_check check (amount <> 0);
