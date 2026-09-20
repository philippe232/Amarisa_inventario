-- Adds bidding to the wishlist, and makes wishlist ownership real: a
-- wishlist_items row now belongs to a Supabase Auth user (auth.uid()),
-- not just a self-reported contact_id, so RLS can genuinely restrict a
-- visitor to their own rows. The app signs visitors in anonymously
-- (supabase.auth.signInAnonymously()) — no login form, no password —
-- purely to get a real, unspoofable identity for this.
--
-- contact_id is relaxed to nullable: it's captured later (whenever the
-- contact form ships), not at wishlist-add time, so a fresh anonymous
-- session with no contact info yet must still be able to add items.

alter table wishlist_items
  alter column contact_id drop not null;

alter table wishlist_items
  add column user_id uuid not null references auth.users (id) on delete cascade,
  add column bid_amount numeric(12, 2);

-- Ownership/dedup key moves from (contact_id, item_id) to (user_id,
-- item_id) — contact_id is no longer guaranteed present, and user_id is
-- the real identity a duplicate-prevention constraint should key off.
alter table wishlist_items
  drop constraint wishlist_items_contact_id_item_id_key,
  add constraint wishlist_items_user_id_item_id_key unique (user_id, item_id);

-- Public bidder COUNT still needs to reflect everyone's wishlist
-- activity, but the base table itself must not be readable across
-- users (bid_amount is exactly the sensitive field this task asked to
-- lock down). This view is owned by the migration role and reads
-- wishlist_items with the OWNER's privileges (security_invoker = false,
-- the Postgres default for views) — it bypasses the querying user's RLS
-- internally, but the only thing it ever exposes is a per-item count,
-- never a row, a user_id, or a bid_amount, so that bypass is safe to
-- grant broadly.
create view item_wishlist_counts
  with (security_invoker = false)
  as
  select item_id, count(*)::int as bidder_count
  from wishlist_items
  group by item_id;

grant select on item_wishlist_counts to anon, authenticated;

drop policy "wishlist_items are publicly readable" on wishlist_items;

create policy "users can view their own wishlist items"
  on wishlist_items for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users can update their own wishlist items"
  on wishlist_items for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "users can delete their own wishlist items"
  on wishlist_items for delete
  to authenticated
  using (auth.uid() = user_id);

-- Replaces "anyone can add a wishlist item" (2026-09-20 migration): an
-- anonymous-auth session is still unauthenticated in the "no login UI"
-- sense, but it IS a real `authenticated` Postgres role with a real
-- auth.uid() — the plain anon role (no session at all) can no longer
-- insert, and whoever does insert can only attribute the row to
-- themselves.
drop policy "anyone can add a wishlist item" on wishlist_items;

create policy "authenticated users can add their own wishlist item"
  on wishlist_items for insert
  to authenticated
  with check (auth.uid() = user_id);
