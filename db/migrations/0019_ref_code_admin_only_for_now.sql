-- Per explicit instruction: every column added while inventory is
-- still being filled in stays Editor/Owner-only, same as priority and
-- review_status (0017/0018) — buyer-facing exposure is a later pass,
-- once the catalog itself is done. ref_code was briefly public in 0016
-- (reasoning: a bidder could match a sticker to a listing); mask it now
-- to match everything else added this round, revisit when that buyer
-- pass happens.
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
  case when is_admin() then review_status end as review_status
from items;

grant select on items_public to anon, authenticated;
