-- Forma de pago on the sale itself — how the buyer is paying (cash,
-- SPEI transfer, other). Each individual payment still records its own
-- method (a sale can be settled partly in cash, partly by SPEI); this is
-- the agreed one, and the default for new payments on the sale.
-- Nullable: it says nothing about rows saved before it existed.
alter table item_sales
  add column payment_method text check (payment_method in ('efectivo', 'spei', 'otro'));
