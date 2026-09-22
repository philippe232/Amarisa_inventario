-- Amarisa Inventarios: admins can create new items.
--
-- 0004 added "admins can update items" but never a matching INSERT
-- policy — items had no create path at all until now (every prior
-- migration only ever wrote items via direct DB scripts using the
-- service_role key, which bypasses RLS entirely, so this gap was never
-- hit through the app itself). Needed now that Editor/Owner can create
-- a new item from the app (items-list.tsx's "Agregar artículo").
create policy "admins can insert items"
  on items for insert
  to authenticated
  with check (is_admin());
