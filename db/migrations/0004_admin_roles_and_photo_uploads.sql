-- Owner/Editor write access for items/item_photos/item_links, backed by
-- a real (magic-link) Supabase Auth identity rather than the anonymous
-- sessions everyone else gets — RLS can only genuinely restrict writes
-- to specific people if there's a verifiable identity to check, same
-- reasoning 0003 gave for wishlist ownership.
--
-- Editor and Owner currently have identical capabilities (per the spec
-- that asked for this table: "every field is editable" for both) — the
-- role column exists so that can diverge later without a schema change,
-- not because anything here treats them differently yet.

create type admin_role as enum ('owner', 'editor');

-- No user_id column: matched by verified JWT email instead (auth.jwt()
-- ->> 'email'), which works from the moment this row is seeded, without
-- waiting for that person to actually sign in first to learn their
-- auth.users.id.
create table admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role admin_role not null,
  created_at timestamptz not null default now()
);

alter table admins enable row level security;
-- Deliberately zero policies — nobody can read or write this table
-- through the API, including a logged-in admin. is_admin()/my_admin_role()
-- below are the only sanctioned way anything reads it, via
-- SECURITY DEFINER (runs as the table owner, which bypasses RLS on
-- tables it owns), and both only ever return a boolean/the caller's own
-- role — never the admins list itself.

insert into admins (email, role) values ('philippe@amarisacafe.com', 'owner');

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from admins where email = (auth.jwt() ->> 'email')
  );
$$;

create or replace function my_admin_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role::text from admins where email = (auth.jwt() ->> 'email');
$$;

grant execute on function is_admin() to authenticated;
grant execute on function my_admin_role() to authenticated;

create policy "admins can update items"
  on items for update
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "admins can insert item photos"
  on item_photos for insert
  to authenticated
  with check (is_admin());

create policy "admins can update item photos"
  on item_photos for update
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "admins can delete item photos"
  on item_photos for delete
  to authenticated
  using (is_admin());

create policy "admins can insert item links"
  on item_links for insert
  to authenticated
  with check (is_admin());

create policy "admins can delete item links"
  on item_links for delete
  to authenticated
  using (is_admin());

-- Public bucket: item photos are shown on a public resale catalog with
-- no login required to browse, so reads need no policy (Storage serves
-- a public bucket's objects directly). Writes are admin-only.
insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', true)
on conflict (id) do nothing;

create policy "admins can upload item photos to storage"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'item-photos' and is_admin());

create policy "admins can delete item photos from storage"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'item-photos' and is_admin());
