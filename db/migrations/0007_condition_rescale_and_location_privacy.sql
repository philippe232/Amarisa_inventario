-- Amarisa Inventarios: rescales the condition badge to 4 tiers with new
-- labels/colors, and masks ubicación the same way suggested_resale_price
-- already is.

-- 1. Condition scale rescale --------------------------------------------
-- Old top tier "mint" (Como nuevo) is dropped — "very_good" (Muy bueno)
-- is now the top tier, and a new "good" (Bueno) tier is inserted below
-- it. Relative ordering of every existing rating is preserved exactly
-- (old tier 1 -> new tier 1, old tier 2 -> new tier 2); only the labels
-- shift. A single CASE update, not two sequential UPDATEs, so a row
-- already 'very_good' doesn't collide with a row just renamed from
-- 'mint' to 'very_good' in the same statement.
--
-- Constraint dropped BEFORE the update, not after — the rename briefly
-- writes 'good', which the old constraint doesn't allow yet.
alter table items drop constraint items_condition_rating_check;

update items set condition_rating = case condition_rating
  when 'mint' then 'very_good'
  when 'very_good' then 'good'
  else condition_rating
end
where condition_rating in ('mint', 'very_good');

alter table items add constraint items_condition_rating_check
  check (condition_rating in ('very_good', 'good', 'needs_maintenance', 'needs_repair'));

-- 2. Ubicación is now Editor/Owner-only, same pattern as pricing --------
-- (0006's items_public masking) — hidden from Viewer/Bidder sessions.
-- Same column list/order as 0006's view (CREATE OR REPLACE VIEW can't
-- drop or reorder columns) — location just swaps to a masked expression
-- in place, brand/model/serial_number stay exactly where they were.
create or replace view items_public as
select
  id, name, description, area,
  case when is_admin() then location end as location,
  type, brand, model, serial_number,
  quantity, years_in_use, condition_rating, condition_notes, maintenance_notes,
  height_cm, width_cm, length_cm,
  has_factura, purchase_price, asking_price, discount_pct,
  case when is_admin() then suggested_resale_price end as suggested_resale_price,
  case when is_admin() then asking_price_override end as asking_price_override,
  status, created_at, updated_at
from items;

grant select on items_public to anon, authenticated;
