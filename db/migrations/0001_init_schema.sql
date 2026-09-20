-- Amarisa Inventarios: initial schema
-- Catalog of items being sold off, plus customer wishlist capture.

create extension if not exists pgcrypto;

create table if not exists items (
  id uuid primary key default gen_random_uuid(),

  name text not null,
  description text,
  area text,                 -- e.g. 'Cocina', 'Piso' — free text, not an enum, so new areas don't need a migration
  location text,              -- sub-location within area, e.g. 'COCINA SERVICIO', 'área de comensales'
  type text,                  -- category, e.g. 'Electrodomestico', 'Mobiliario', 'Menaje y utensilios'
  brand text,
  model text,
  serial_number text,

  quantity integer not null default 1 check (quantity > 0),

  years_in_use numeric(4,1),
  condition_pct integer check (condition_pct between 0 and 100),
  condition_notes text,       -- current state, e.g. "dañado, requiere cambio de motor"
  maintenance_notes text,     -- repair history, separate from current condition

  has_factura boolean,
  price_new numeric(12,2),
  purchase_price numeric(12,2),
  suggested_resale_price numeric(12,2),
  discount_pct numeric(5,1) generated always as (
    case
      when price_new is not null and price_new > 0 and suggested_resale_price is not null
        then round((1 - (suggested_resale_price / price_new)) * 100, 1)
    end
  ) stored,

  status text not null default 'for_sale' check (status in ('for_sale', 'reserved', 'sold')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists items_area_idx on items (area);
create index if not exists items_type_idx on items (type);
create index if not exists items_status_idx on items (status);

create table if not exists item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items (id) on delete cascade,
  url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists item_photos_item_id_idx on item_photos (item_id);

create table if not exists item_links (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items (id) on delete cascade,
  url text not null,
  label text,
  created_at timestamptz not null default now()
);

create index if not exists item_links_item_id_idx on item_links (item_id);

-- Customer-facing contact capture (no real auth, just a gate before wishlisting)
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  email text,
  whatsapp text,
  created_at timestamptz not null default now(),
  constraint contacts_has_identifier check (email is not null or whatsapp is not null)
);

create table if not exists wishlist_items (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts (id) on delete cascade,
  item_id uuid not null references items (id) on delete cascade,
  reviewed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (contact_id, item_id)
);

create index if not exists wishlist_items_item_id_idx on wishlist_items (item_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists items_set_updated_at on items;
create trigger items_set_updated_at
  before update on items
  for each row
  execute function set_updated_at();
