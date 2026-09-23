-- Amarisa Inventarios: two fiscal-invoice detail fields alongside the
-- existing has_factura boolean — the CFDI folio/UUID and a link to
-- where the PDF itself is kept (Drive, email, wherever — just a text
-- field, not a file upload). has_factura (yes/no) stays public, same
-- as today; these two are Editor/Owner-only, same masking pattern as
-- pricing/location — a CFDI folio is enough to look the real invoice
-- up in SAT's own systems, not something to expose to a Viewer/Bidder.
alter table items add column if not exists factura_cfdi text;
alter table items add column if not exists factura_pdf text;

-- Same column list/order as 0008's version (CREATE OR REPLACE VIEW
-- can't drop or reorder columns) — both new fields appended at the end.
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
  case when is_admin() then factura_pdf end as factura_pdf
from items;

grant select on items_public to anon, authenticated;
