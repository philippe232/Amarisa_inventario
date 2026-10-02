-- units_sold on the public catalog view: how many units of an item have
-- been sold, i.e. lines of CLOSED orders (or of no order — sales from
-- before carts). Lets the Artículos list show "Vendido 1 de 15" on an
-- article that still has units left. item_sales is owner-only, but this
-- view runs with its owner's rights (same as it already does to read
-- items past RLS), so only the aggregate count is exposed, never the
-- sales rows, prices or buyers.
--
-- Everything else is 0031's definition (+ internal_notes from 0020)
-- unchanged; the new column is appended last, as create or replace view
-- requires.
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
  case when is_admin() then internal_notes end as internal_notes,
  coalesce((
    select sum(s.quantity)
    from item_sales s
    left join sale_orders o on o.id = s.order_id
    where s.item_id = items.id and (s.order_id is null or o.status = 'closed')
  ), 0)::int as units_sold
from items;

grant select on items_public to anon, authenticated;
