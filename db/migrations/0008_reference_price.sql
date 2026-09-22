-- Amarisa Inventarios: adds a market reference price, separate from
-- suggested_resale_price.
--
-- suggested_resale_price is Amarisa's own research/target figure (what
-- Editor/Owner actually thinks this should sell for, used or discounted
-- as needed). reference_price is a neutral external data point — e.g. a
-- blended average of current new-unit retail listings found online —
-- input for that decision, not the decision itself. Kept as a plain
-- column, not folded into asking_price/discount_pct's formulas: it's
-- context for setting a price, never itself the price shown to buyers.
alter table items add column if not exists reference_price numeric(12,2);

-- Same masking as suggested_resale_price/asking_price_override/location
-- (0006/0007) — Editor/Owner only, hidden from Viewer/Bidder. Same
-- column list/order as before, reference_price appended at the end
-- (CREATE OR REPLACE VIEW can't reorder or drop columns).
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
  status, created_at, updated_at,
  case when is_admin() then reference_price end as reference_price
from items;

grant select on items_public to anon, authenticated;
