-- Changes the duplicate-name policy from "oldest keeps the bare name,
-- only later ones get numbered" (0006's original behavior) to "every
-- member of a duplicate-ish group is numbered #01, #02, ... — nothing
-- stays bare once a second item shares its name." e.g. adding a second
-- "Lampara" now renames the FIRST one to "Lampara #01" too, not just
-- the new one to "Lampara #01" while the original stays bare.
--
-- Two triggers replace 0006's single one:
--   1. items_avoid_name_collision (BEFORE): only exists to satisfy the
--      unique index at insert/update time — gives a colliding name a
--      throwaway random-digit suffix so the write never fails. Not
--      trying to be pretty; #2 immediately fixes it up.
--   2. items_renumber_group (AFTER): whenever a name is set, looks at
--      every row sharing that base name (suffix stripped) and — if
--      there are 2 or more — renumbers the whole group #01.."#0N" in
--      created_at order. A group of exactly 1 is left bare.
-- The AFTER trigger re-fires on its own UPDATEs, but only ever writes
-- a row whose name doesn't already match its target, so it settles
-- after at most two passes per affected row (never a real loop).

drop trigger if exists items_ensure_unique_name on items;
drop function if exists ensure_unique_item_name();

create or replace function items_avoid_name_collision() returns trigger as $$
begin
  while exists (
    select 1 from items
    where lower(name) = lower(new.name) and id is distinct from new.id
  ) loop
    new.name := new.name || ' #' || (100000 + floor(random() * 900000))::text;
  end loop;
  return new;
end;
$$ language plpgsql;

create trigger items_avoid_name_collision
  before insert or update of name on items
  for each row
  execute function items_avoid_name_collision();

-- Two phases, not one pass: assigning "Lámparas #02" to row B while
-- row C still holds that exact name (hasn't had its own turn yet)
-- makes B's own BEFORE trigger think it collided and bolt on a random
-- suffix ("Lámparas #02 #700213"), which then reads as its own
-- singleton group and never gets fixed. Parking every member on a
-- name unique-by-construction (its own id) first means phase 2's
-- assignments never collide with a not-yet-updated sibling.
--
-- pg_trigger_depth() guard: the two loops below update every row in
-- the group directly (by id), so the whole group is handled in one
-- top-level firing — nothing needs the recursive re-fires each of
-- those UPDATEs would otherwise trigger, and without the guard they
-- blow the stack (each nested call re-runs both loops again).
create or replace function items_renumber_group() returns trigger as $$
declare
  base text := regexp_replace(coalesce(new.name, old.name), ' #[0-9]+$', '');
  grp_ids uuid[];
  grp_size int;
  i int;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  select array_agg(id order by created_at) into grp_ids
  from items
  where lower(regexp_replace(name, ' #[0-9]+$', '')) = lower(base);

  grp_size := coalesce(array_length(grp_ids, 1), 0);
  if grp_size < 2 then
    return null;
  end if;

  for i in 1..grp_size loop
    update items set name = name || '~~renumbering~~' || grp_ids[i]::text where id = grp_ids[i];
  end loop;

  for i in 1..grp_size loop
    update items set name = base || ' #' || lpad(i::text, 2, '0') where id = grp_ids[i];
  end loop;

  return null;
end;
$$ language plpgsql;

drop trigger if exists items_renumber_group on items;
create trigger items_renumber_group
  after insert or update of name on items
  for each row
  execute function items_renumber_group();

-- One-time backfill: touching every row's name (even to its own
-- current value) fires items_renumber_group for all of them — an
-- "UPDATE OF column" trigger runs whenever that column is in the SET
-- clause, whether or not the value actually changes. Cheap no-op for
-- the ~230 items with no name-mate; renumbers all 34 existing
-- duplicate-ish groups (95 items) per the new policy.
update items set name = name;
