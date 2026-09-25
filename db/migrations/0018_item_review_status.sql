-- Internal approval pipeline for a listing, separate from `status`
-- (which tracks the sale itself: for_sale/reserved/sold). Every item
-- starts 'nuevo' the moment it exists — not customer-facing, masked in
-- items_public the same way priority (0017) is.
alter table items
  add column if not exists review_status text not null default 'nuevo'
  check (review_status in ('nuevo', 'en_revision', 'aprobado'));

-- Same column list/order as 0017's version, review_status appended at
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
  ref_code,
  case when is_admin() then priority end as priority,
  case when is_admin() then review_status end as review_status
from items;

grant select on items_public to anon, authenticated;
