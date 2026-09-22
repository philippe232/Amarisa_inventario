-- Amarisa Inventarios: discount_pct falls back to reference_price when
-- purchase_price is unknown — lets a researched item (no real purchase
-- record) still show a discount badge, benchmarked against the market
-- instead of Amarisa's own cost. reference_price itself stays
-- Editor/Owner-only (items_public, 0008); only the resulting percentage
-- is public, same as before — a viewer never sees the crossed-out
-- number this was computed against unless purchase_price is also set.
--
-- items_public depends on discount_pct, so it has to go before the drop
-- (cascading would take it out entirely) and come back after, identical
-- to its 0008 definition — this migration only touches the base table.
drop view items_public;

alter table items drop column discount_pct;
alter table items add column discount_pct numeric(5,1) generated always as (
  case
    when coalesce(purchase_price, reference_price) is not null
     and coalesce(purchase_price, reference_price) > 0
     and coalesce(asking_price_override, suggested_resale_price) is not null
    then round((1 - (coalesce(asking_price_override, suggested_resale_price) / coalesce(purchase_price, reference_price))) * 100, 1)
  end
) stored;

create view items_public as
select
  id, name, description, area,
  case when is_admin() then location end as location,
  type, brand, model, serial_number,
  quantity, years_in_use, condition_rating, condition_notes, maintenance_notes,
  height_cm, width_cm, length_cm,
  has_factura, purchase_price, asking_price, discount_pct,
  case when is_admin() then suggested_resale_price end as suggested_resale_price,
  case when is_admin() then asking_price_override end as asking_price_override,
  status, created_at, updated_at,
  case when is_admin() then reference_price end as reference_price
from items;

grant select on items_public to anon, authenticated;
