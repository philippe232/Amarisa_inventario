-- Manual override for an item's tier ("Equipo y muebles" vs "Gangas").
--
-- Deliberately the ONLY thing stored about tiers. The tier itself is
-- derived in the app (lib/tier.ts, getEffectiveTier): the override if set,
-- otherwise the public asking price against BIG_TICKET_THRESHOLD. Storing
-- the computed tier would let it drift when a price changes and would
-- clobber manual choices, so only the override lives here. NULL = automatic.
--
-- Same shape as priority (0017): text + check rather than a Postgres enum,
-- so adding a tier later doesn't need ALTER TYPE.
--
-- Writes: nothing new to grant. "admins can update items" (0004) is a
-- row-level policy on the whole table (using/with check is_admin()), so
-- this column is Editor/Owner-only exactly like every other column of items.
alter table items add column if not exists tier_override text
  check (tier_override in ('equipo', 'gangas'));

-- Everyone needs to read it (the tag is public, and the list computes the
-- effective tier client-side), so unlike priority it is NOT masked. Same
-- column list/order as 0036's version, tier_override appended last.
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
  ), 0)::int as units_sold,
  tier_override
from items;

grant select on items_public to anon, authenticated;
