-- RLS is enabled by default on new tables in this project, with zero
-- policies — meaning the anon key currently sees NOTHING (found live:
-- the items list screen rendered "Sin artículos" despite 55 real rows,
-- since Postgres RLS denies every row for a command with no matching
-- policy, regardless of the table-level GRANTs already in place).
--
-- Mutations stay locked down for anon/authenticated beyond what the
-- customer-facing flow needs (contact capture + adding to a wishlist).
-- Admin edits to items themselves go through the service_role key
-- server-side once that flow exists — nothing in the client bundle
-- should be able to write to the catalog yet.

create policy "items are publicly readable"
  on items for select
  to anon, authenticated
  using (true);

create policy "item_photos are publicly readable"
  on item_photos for select
  to anon, authenticated
  using (true);

create policy "item_links are publicly readable"
  on item_links for select
  to anon, authenticated
  using (true);

-- Needed so the items list's embedded wishlist_items(count) aggregate
-- actually has rows to count for a plain visitor. This doesn't expose
-- who's interested in what beyond a random contact_id — contacts has no
-- select policy below, so an actual email/whatsapp is never reachable
-- through the anon key.
create policy "wishlist_items are publicly readable"
  on wishlist_items for select
  to anon, authenticated
  using (true);

create policy "anyone can register as a contact"
  on contacts for insert
  to anon, authenticated
  with check (true);

create policy "anyone can add a wishlist item"
  on wishlist_items for insert
  to anon, authenticated
  with check (true);
