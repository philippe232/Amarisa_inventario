-- Internal triage flag — which items to deal with first (list, price,
-- photograph, move). Not customer-facing: masked in items_public the
-- same way suggested_resale_price/reference_price are, since a Viewer/
-- Bidder has no use for Amarisa's own handling order.
alter table items add column if not exists priority text check (priority in ('alta', 'media', 'baja'));

-- Same column list/order as 0016's version, priority appended at the end.
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
  case when is_admin() then priority end as priority
from items;

grant select on items_public to anon, authenticated;
