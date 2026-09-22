-- Amarisa Inventarios: admins can delete items.
--
-- Same gap as 0011's missing INSERT policy, same root cause (items
-- only ever had an UPDATE policy from 0004; create/delete never had an
-- app-driven path before this session's "Agregar artículo"/"Borrar
-- artículo" work) — found the same way, live: a delete silently
-- affected 0 rows (RLS filters which rows a write can target rather
-- than raising an error when nothing matches, so the client saw no
-- error and navigated away as if it had worked).
create policy "admins can delete items"
  on items for delete
  to authenticated
  using (is_admin());
