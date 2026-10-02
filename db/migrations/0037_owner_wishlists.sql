-- The owner can see every buyer's list ("Mi lista") with the email they
-- linked, to turn it into a carrito in /ventas. wishlist_items is
-- RLS-restricted to each user's own rows (and bid_amount is deliberately
-- private), and the email lives in auth.users, which the client can't
-- read — so this is a SECURITY DEFINER function that returns rows only
-- when the caller is the owner (is_owner() reads the caller's JWT, which
-- is still the request's inside a definer function). A function rather
-- than a view so nothing selectable exposes auth.users to other roles.
create or replace function owner_wishlists()
returns table (
  user_id uuid,
  email text,
  is_anonymous boolean,
  item_id uuid,
  bid_amount numeric,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select w.user_id, u.email::text, u.is_anonymous, w.item_id, w.bid_amount, w.created_at
  from wishlist_items w
  join auth.users u on u.id = w.user_id
  where is_owner()
$$;

revoke all on function owner_wishlists() from public, anon;
grant execute on function owner_wishlists() to authenticated;
