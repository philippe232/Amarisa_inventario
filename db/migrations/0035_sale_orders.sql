-- Carritos / pedidos: a named cart (one per buyer) holding several
-- articles, closed out ("checkout") with its payment form. Replaces
-- registering a sale one article at a time.
--
--   sale_orders          the cart: buyer name, contact, notes, open|closed,
--                        and the checkout fields (factura, forma de pago)
--   item_sales           a cart LINE = one row per article in the cart
--                        (order_id set). final_price stays the price paid
--                        per unit; line_total is the exact amount paid for
--                        the line — kept separately because the user can
--                        type either one and a total that doesn't divide
--                        evenly by the units (1,000 for 3) would otherwise
--                        drift by cents when rebuilt from a rounded unit
--                        price. Null on rows from before orders existed
--                        (total = final_price * quantity there).
--   sale_order_payments  payments are against the whole order, not a line
--
-- IVA is computed per order from the lines' totals when the order needs a
-- factura (iva_amount / total_with_iva on item_sales are not used for
-- order lines). Units across an article's lines never exceeding its
-- quantity, and only CLOSED orders counting as sold, are enforced in the
-- UI, as with the earlier sales tables. item_sale_payments is no longer
-- written to and can be dropped once nothing needs it.

create table sale_orders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  buyer_contact text,
  notes text,
  status text not null default 'open' check (status in ('open', 'closed')),
  requires_invoice boolean not null default false,
  payment_method text check (payment_method in ('efectivo', 'spei', 'otro')),
  created_by text,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);

drop trigger if exists sale_orders_set_updated_at on sale_orders;
create trigger sale_orders_set_updated_at
  before update on sale_orders
  for each row
  execute function set_updated_at();

create table sale_order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references sale_orders (id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('efectivo', 'spei', 'otro')),
  paid_at date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index sale_order_payments_order_idx on sale_order_payments (order_id);

alter table item_sales add column order_id uuid references sale_orders (id) on delete cascade;
alter table item_sales add column line_total numeric(12,2) check (line_total >= 0);
create index item_sales_order_idx on item_sales (order_id);

alter table sale_orders enable row level security;
alter table sale_order_payments enable row level security;

create policy "owner can read sale_orders" on sale_orders for select to authenticated using (is_owner());
create policy "owner can insert sale_orders" on sale_orders for insert to authenticated with check (is_owner());
create policy "owner can update sale_orders" on sale_orders for update to authenticated using (is_owner()) with check (is_owner());
create policy "owner can delete sale_orders" on sale_orders for delete to authenticated using (is_owner());

create policy "owner can read sale_order_payments" on sale_order_payments for select to authenticated using (is_owner());
create policy "owner can insert sale_order_payments" on sale_order_payments for insert to authenticated with check (is_owner());
create policy "owner can update sale_order_payments" on sale_order_payments for update to authenticated using (is_owner()) with check (is_owner());
create policy "owner can delete sale_order_payments" on sale_order_payments for delete to authenticated using (is_owner());
