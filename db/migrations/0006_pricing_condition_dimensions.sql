-- Amarisa Inventarios: restructures the Precio section, adds a
-- categorical condition scale, dimensions, and self-disambiguating
-- unique item names.

-- 1. Name uniqueness, auto-disambiguated -----------------------------
-- Decision (Philippe, 2026-09-21): don't block a save on a duplicate
-- name — 13 existing groups (e.g. "Licuadora" x4) are separate physical
-- units entered as separate rows, not a data error. Instead, the first
-- item to use a name keeps it bare; any later item with the same name
-- (case-insensitive) is automatically suffixed " #01", " #02", ... on
-- save, so `name` can carry a real DB-level unique constraint without
-- ever rejecting a write.
create or replace function ensure_unique_item_name()
returns trigger as $$
declare
  candidate text := new.name;
  suffix_num int := 1;
begin
  while exists (
    select 1 from items
    where lower(name) = lower(candidate)
      and id is distinct from new.id
  ) loop
    candidate := new.name || ' #' || lpad(suffix_num::text, 2, '0');
    suffix_num := suffix_num + 1;
  end loop;
  new.name := candidate;
  return new;
end;
$$ language plpgsql;

drop trigger if exists items_ensure_unique_name on items;
create trigger items_ensure_unique_name
  before insert or update of name on items
  for each row
  execute function ensure_unique_item_name();

-- Backfill the 13 existing duplicate-name groups before the constraint
-- goes on: oldest row per name keeps it bare, each later one numbered.
update items i
set name = i.name || ' #' || lpad((ranked.rn - 1)::text, 2, '0')
from (
  select id, row_number() over (partition by lower(name) order by created_at) as rn
  from items
) ranked
where i.id = ranked.id and ranked.rn > 1;

create unique index if not exists items_name_unique_idx on items (lower(name));

-- 2. Pricing restructure ----------------------------------------------
-- asking_price_override: manual price an editor/owner sets by hand.
-- asking_price: what buyers actually see — the override if set, else
-- whatever the research-driven suggested_resale_price currently is.
-- Both suggested_resale_price and the override itself are internal
-- (see items_public below); only the resulting asking_price is public.
alter table items add column if not exists asking_price_override numeric(12,2);

alter table items add column if not exists asking_price numeric(12,2) generated always as (
  coalesce(asking_price_override, suggested_resale_price)
) stored;

-- discount_pct now compares the public asking price against what
-- Amarisa originally paid (purchase_price), not retail-when-new — the
-- liquidation story is "priced below our own cost", not "below retail".
alter table items drop column if exists discount_pct;
alter table items add column discount_pct numeric(5,1) generated always as (
  case
    when purchase_price is not null and purchase_price > 0
     and coalesce(asking_price_override, suggested_resale_price) is not null
    then round((1 - (coalesce(asking_price_override, suggested_resale_price) / purchase_price)) * 100, 1)
  end
) stored;

-- 3. Dimensions ---------------------------------------------------------
alter table items add column if not exists height_cm numeric(8,1);
alter table items add column if not exists width_cm numeric(8,1);
alter table items add column if not exists length_cm numeric(8,1);

-- 4. Condition scale ------------------------------------------------------
-- Replaces the free-form 0-100 condition_pct (kept, unused by the UI
-- going forward, so the 44 existing readings aren't lost) with a short
-- 4-point scale that reads as a badge/color instead of a raw number.
alter table items add column if not exists condition_rating text
  check (condition_rating in ('mint', 'very_good', 'needs_maintenance', 'needs_repair'));

update items set condition_rating = case
  when condition_pct >= 90 then 'mint'
  when condition_pct >= 70 then 'very_good'
  when condition_pct >= 40 then 'needs_maintenance'
  when condition_pct is not null then 'needs_repair'
end
where condition_pct is not null and condition_rating is null;

-- 5. Public read view, masking admin-only pricing research --------------
-- Mirrors the admins table's own pattern (0004): the raw column stays
-- unreachable from a non-admin query, not just unrendered client-side —
-- item-detail.tsx and items-list.tsx read through this view instead of
-- `items` directly. item-edit-form.tsx (admin-only route) still reads
-- the base table, since Editor/Owner need the real research figure to
-- decide whether to override it.
create or replace view items_public as
select
  id, name, description, area, location, type, brand, model, serial_number,
  quantity, years_in_use, condition_rating, condition_notes, maintenance_notes,
  height_cm, width_cm, length_cm,
  has_factura, purchase_price, asking_price, discount_pct,
  case when is_admin() then suggested_resale_price end as suggested_resale_price,
  case when is_admin() then asking_price_override end as asking_price_override,
  status, created_at, updated_at
from items;

grant select on items_public to anon, authenticated;
