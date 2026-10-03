-- A discount on the order's total: either a percentage or a fixed amount,
-- applied to the cart's subtotal. IVA (when the order needs a factura) is
-- worked out on the discounted amount, since that's what's invoiced.
-- Both columns are set together or not at all; null = no discount.
alter table sale_orders
  add column discount_type text check (discount_type in ('percent', 'amount')),
  add column discount_value numeric(12,2) check (discount_value >= 0),
  add constraint sale_orders_discount_pair check ((discount_type is null) = (discount_value is null)),
  add constraint sale_orders_discount_percent_max check (discount_type is distinct from 'percent' or discount_value <= 100);
