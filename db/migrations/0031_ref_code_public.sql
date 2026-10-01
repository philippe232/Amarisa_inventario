-- 0019 masked ref_code to admin-only "until the buyer-facing pass
-- happens" — that pass is now: the Artículos list shows each item's
-- ref# next to the interesados count, for every viewer, so a bidder
-- can match a physical sticker to a listing. Unmask it; everything
-- else in 0019's admin-only set (location, resale/override pricing,
-- factura docs, priority, review_status) stays internal.
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
  ref_code,
  case when is_admin() then priority end as priority,
  case when is_admin() then review_status end as review_status,
  case when is_admin() then internal_notes end as internal_notes
from items;

grant select on items_public to anon, authenticated;
