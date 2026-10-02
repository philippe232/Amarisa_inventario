-- Buyers pick how many units they want of an article in their list.
-- Defaults to 1, so every existing entry reads as one unit. The upper
-- bound (what's still available) depends on sales the buyer can't see,
-- so the UI caps it using items_public.units_sold, and the owner's
-- conversion to a cart caps it again against what's really free.
alter table wishlist_items
  add column quantity integer not null default 1 check (quantity > 0);

-- owner_wishlists() (0037) gains quantity. A function's return type
-- can't be changed in place, so drop and recreate it, same rules.
drop function owner_wishlists();

create function owner_wishlists()
returns table (
  user_id uuid,
  email text,
  is_anonymous boolean,
  item_id uuid,
  quantity integer,
  bid_amount numeric,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select w.user_id, u.email::text, u.is_anonymous, w.item_id, w.quantity, w.bid_amount, w.created_at
  from wishlist_items w
  join auth.users u on u.id = w.user_id
  where is_owner()
$$;

revoke all on function owner_wishlists() from public, anon;
grant execute on function owner_wishlists() to authenticated;
