-- Free-text internal notes — why an item is flagged a certain priority,
-- what stage it's at, anything that doesn't fit condition_notes (the
-- article's physical state) or maintenance_notes (its repair history).
-- Same masking as priority/review_status/ref_code: Editor/Owner-only
-- for now, per instruction that every field added while inventory is
-- still being filled in stays admin-scoped until the buyer-facing pass.
alter table items add column if not exists internal_notes text;

-- Same column list/order as 0019's version, internal_notes appended at
-- the end.
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
  case when is_admin() then reference_price end as reference_price,
  case when is_admin() then factura_cfdi end as factura_cfdi,
  case when is_admin() then factura_pdf end as factura_pdf,
  case when is_admin() then ref_code end as ref_code,
  case when is_admin() then priority end as priority,
  case when is_admin() then review_status end as review_status,
  case when is_admin() then internal_notes end as internal_notes
from items;

grant select on items_public to anon, authenticated;
