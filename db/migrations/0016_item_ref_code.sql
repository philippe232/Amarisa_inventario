-- A short, permanent, human-writable code for each item — meant to be
-- copied onto a physical sticker/label and stuck on the real article,
-- so someone holding the object can match it back to its listing (and
-- vice versa, by searching the code in the app). Two properties matter
-- more than anything else here:
--   1. It must never change once assigned — a sticker already on a
--      shelf can't be un-written. Enforced below by a trigger that
--      rejects any UPDATE touching ref_code once it's set, not just a
--      UI convention.
--   2. It must be safe to hand-copy. The suffix is drawn from Crockford
--      Base32 (0-9, A-Z minus I/L/O/U) — the standard alphabet for
--      exactly this problem, since it drops the letter/digit pairs a
--      human (or a phone camera) most often confuses: I/1, O/0, and it
--      also skips U to avoid accidental words. Same reasoning Philippe
--      raised for receipt numbering.
-- Shape: "{ÁREA}_{4 chars}", e.g. "COC_4KX7" — the área prefix is a
-- readability aid, not a live reference: if an item's área changes
-- later, its ref_code's prefix stays exactly as first assigned (see
-- point 1). That's an accepted tradeoff, not a bug.

create or replace function item_ref_alphabet() returns text as $$
  select '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
$$ language sql immutable;

create or replace function item_area_prefix(p_area text) returns text as $$
  select case
    when p_area = 'Cocina' then 'COC'
    when p_area = 'Piso' then 'PIS'
    when p_area = 'Barra' then 'BAR'
    when p_area = 'Panadería' then 'PAN'
    when p_area is null or btrim(p_area) = '' then 'GEN'
    -- Any future área not in the list above: first 3 letters, stripped
    -- of anything that isn't plain a-z (accents included), uppercased.
    -- Falls back to 'GEN' if that leaves nothing usable.
    else coalesce(nullif(upper(left(regexp_replace(p_area, '[^a-zA-Z]', '', 'g'), 3)), ''), 'GEN')
  end;
$$ language sql immutable;

create or replace function generate_item_ref_code(p_area text) returns text as $$
declare
  alphabet text := item_ref_alphabet();
  prefix text := item_area_prefix(p_area);
  candidate text;
  i int;
  attempt int := 0;
begin
  loop
    candidate := '';
    for i in 1..4 loop
      candidate := candidate || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
    end loop;
    candidate := prefix || '_' || candidate;
    exit when not exists (select 1 from items where ref_code = candidate);
    attempt := attempt + 1;
    if attempt > 50 then
      raise exception 'No se pudo generar un ref_code único para área % después de 50 intentos', p_area;
    end if;
  end loop;
  return candidate;
end;
$$ language plpgsql;

alter table items add column if not exists ref_code text;

-- Backfill every existing row before the column is locked to not null.
do $$
declare
  r record;
begin
  for r in select id, area from items where ref_code is null loop
    update items set ref_code = generate_item_ref_code(r.area) where id = r.id;
  end loop;
end $$;

alter table items alter column ref_code set not null;
alter table items add constraint items_ref_code_unique unique (ref_code);

create or replace function items_set_ref_code() returns trigger as $$
begin
  if new.ref_code is null then
    new.ref_code := generate_item_ref_code(new.area);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger items_ref_code_insert
  before insert on items
  for each row execute function items_set_ref_code();

create or replace function items_prevent_ref_code_change() returns trigger as $$
begin
  if old.ref_code is not null and new.ref_code is distinct from old.ref_code then
    raise exception 'ref_code no se puede modificar una vez creado (artículo %: % -> %)', old.id, old.ref_code, new.ref_code;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger items_ref_code_immutable
  before update on items
  for each row execute function items_prevent_ref_code_change();

-- Public on purpose (not masked) — the whole point is a Viewer/Bidder
-- holding the physical sticker can look the item up by it. Same column
-- list/order as 0013's version, appended at the end.
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
  ref_code
from items;

grant select on items_public to anon, authenticated;
