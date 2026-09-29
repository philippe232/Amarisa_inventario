-- Sales tracking, exclusive to Owner — the first real Editor/Owner
-- split in this app (0004's admins table always anticipated this: role
-- existed "so that can diverge later... not because anything here
-- treats them differently yet" — this is that divergence).
--
-- is_owner(): same SECURITY DEFINER pattern as is_admin() (0004), just
-- narrowed to role = 'owner'. is_admin() itself is untouched — Editor
-- keeps everything it already had.
create or replace function is_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from admins where email = (auth.jwt() ->> 'email') and role = 'owner'
  );
$$;

grant execute on function is_owner() to authenticated;

-- One sale record per item (plain unique constraint, not a history-of-
-- superseded-rows model like item_purchase_matches — a sale is a
-- straightforward editable record, not a multi-candidate decision to
-- research and compare, so a direct UPDATE/DELETE is enough: fix a
-- typo, correct the price, or delete the row entirely if a deal falls
-- through and the item goes back on the market).
--
-- total_with_iva is always "what the buyer owes in total" regardless of
-- the iva_included toggle — already the full amount when IVA was
-- included in the negotiated price, else final_price with 16% added on
-- top. Never store which is "correct" as a business rule; the toggle
-- says which case this sale is.
create table item_sales (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null unique references items (id) on delete cascade,
  final_price numeric(12,2) not null check (final_price >= 0),
  iva_included boolean not null default true,
  total_with_iva numeric(12,2) generated always as (
    case when iva_included then final_price else round(final_price * 1.16, 2) end
  ) stored,
  buyer_name text,
  buyer_contact text,
  notes text,
  sold_by text,               -- admin email
  sold_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index item_sales_item_idx on item_sales (item_id);

drop trigger if exists item_sales_set_updated_at on item_sales;
create trigger item_sales_set_updated_at
  before update on item_sales
  for each row
  execute function set_updated_at();

-- Multiple payments per sale — the "super simple" build: a single
-- payment is just one row here, a split payment (deposit today,
-- balance on pickup) is two. No separate code path for either case.
create table item_sale_payments (
  id uuid primary key default gen_random_uuid(),
  item_sale_id uuid not null references item_sales (id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method text not null check (method in ('efectivo', 'transferencia', 'otro')),
  paid_at date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);

create index item_sale_payments_sale_idx on item_sale_payments (item_sale_id);

alter table item_sales enable row level security;
alter table item_sale_payments enable row level security;

create policy "owner can read item_sales" on item_sales for select to authenticated using (is_owner());
create policy "owner can insert item_sales" on item_sales for insert to authenticated with check (is_owner());
create policy "owner can update item_sales" on item_sales for update to authenticated using (is_owner()) with check (is_owner());
create policy "owner can delete item_sales" on item_sales for delete to authenticated using (is_owner());

create policy "owner can read item_sale_payments" on item_sale_payments for select to authenticated using (is_owner());
create policy "owner can insert item_sale_payments" on item_sale_payments for insert to authenticated with check (is_owner());
create policy "owner can update item_sale_payments" on item_sale_payments for update to authenticated using (is_owner()) with check (is_owner());
create policy "owner can delete item_sale_payments" on item_sale_payments for delete to authenticated using (is_owner());
