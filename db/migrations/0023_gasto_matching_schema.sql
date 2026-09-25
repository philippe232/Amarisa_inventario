-- Purchase-price & CFDI matching: imports historical purchase data from
-- the Gastos/Flujos AppSheet exports (gasto_notas/gasto_lines/
-- gasto_flujos), scores candidate gasto_lines against each inventory
-- item (item_match_candidates, precomputed — never scored on page
-- load), and records the admin's confirmed pick (item_purchase_matches,
-- one active row per item, history kept by superseding via is_active
-- rather than deleting).
--
-- All five tables are Editor/Owner-only, same is_admin() pattern already
-- used for items writes (0004) — zero policies for anon/authenticated-
-- non-admin, so RLS denies everything by default. Purchase costs,
-- suppliers and CFDIs must never reach a Viewer/Bidder session, same as
-- factura_cfdi/factura_pdf/suggested_resale_price already are.

create extension if not exists pg_trgm;

-- 1. gasto_notas — one row per purchase note (NotasC) -------------------
create table gasto_notas (
  uid_gasto text primary key,
  ref_notac text,
  ref_proveedor text,
  proveedor_nombre text,
  fecha_op date,
  locacion text,                 -- normalized uppercase at import time
  area text,
  total_neto numeric(12,2),
  factura_timbrada boolean,

  cfdi_raw text,                 -- original NotaC_CFDI free text
  cfdi_uuid text,                -- UUID extracted from cfdi_raw, uppercased
  -- Resolved against the linked gasto_flujos rows (REF_NotaC = REF_NOTA)
  -- by the import script, not a generated column — needs the flujos
  -- table to already be loaded, and REF_NOTA can repeat (split
  -- payments), so the join is a real query, not a per-row expression.
  cfdi_resolved text,            -- cfdi_uuid, else first non-empty flujo CFDI
  cfdi_source text check (cfdi_source in ('gastos', 'flujos')),
  cfdi_conflict boolean not null default false,  -- gastos and flujos both have a UUID and they differ
  cfdi_suspect boolean not null default false,   -- this UUID appears on >10 unrelated notas

  comentario text,
  foto_url text,                 -- NotaC_Foto, an already-hosted external link — not something we upload

  source_file text not null,     -- which xlsx this row came from, for traceability
  raw jsonb not null,            -- original row, untouched
  created_at timestamptz not null default now()
);

create index gasto_notas_ref_notac_idx on gasto_notas (ref_notac);
create index gasto_notas_cfdi_uuid_idx on gasto_notas (cfdi_uuid);

-- 2. gasto_lines — one row per purchase line item (NotasC_Items) --------
-- This is what actually gets matched against inventory items.
create table gasto_lines (
  uid_itemc text primary key,
  uid_nota text not null references gasto_notas (uid_gasto),
  ref_notac text,
  descripcion text not null,
  fecha_op date,
  locacion text,
  area text,
  uds numeric,
  precio_por_ud numeric(12,2),
  total_neto numeric(12,2),
  ref_proveedor text,
  clase text,
  categoria text,
  subcategoria text,
  tipo text,
  comentarios text,

  -- Whether this line is even eligible to be scored/shown as a match
  -- candidate (lib/gasto-matching/config.mjs's keyword/category rules),
  -- computed once at import time so scoring never has to re-derive it.
  is_candidate boolean not null default false,

  source_file text not null,
  raw jsonb not null,
  created_at timestamptz not null default now()
);

create index gasto_lines_uid_nota_idx on gasto_lines (uid_nota);
create index gasto_lines_is_candidate_idx on gasto_lines (is_candidate) where is_candidate;
-- Backs the Buscar free-text fallback over every line, candidate or not.
create index gasto_lines_descripcion_trgm_idx on gasto_lines using gin (descripcion gin_trgm_ops);

-- 3. gasto_flujos — payment-flow rows where Flujo_Fuente = 'Gastos' -----
-- (payroll/B2B-sales rows are never imported — only the Gastos-sourced
-- subset this feature needs).
create table gasto_flujos (
  uid_flujo text primary key,
  ref_nota text,
  ref_tercero text,
  fecha_op date,
  total_neto numeric(12,2),
  pago_status text,
  factura_status text,
  cfdi_raw text,
  cfdi_uuid text,
  comentario text,

  raw jsonb not null,
  created_at timestamptz not null default now()
);

create index gasto_flujos_ref_nota_idx on gasto_flujos (ref_nota);

-- 4. item_match_candidates — precomputed top ~10 per item ---------------
create table item_match_candidates (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items (id) on delete cascade,
  uid_itemc text not null references gasto_lines (uid_itemc) on delete cascade,
  score numeric(5,1) not null,
  tier text not null check (tier in ('fuerte', 'ambiguo', 'debil', 'sin_candidato')),
  rank int not null,
  score_breakdown jsonb,          -- per-signal contribution, for tuning the config
  computed_at timestamptz not null default now(),
  unique (item_id, uid_itemc)
);

create index item_match_candidates_item_rank_idx on item_match_candidates (item_id, rank);

-- 5. item_purchase_matches — the admin's confirmed pick ------------------
create table item_purchase_matches (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items (id) on delete cascade,
  uid_itemc text references gasto_lines (uid_itemc),
  uid_gasto text references gasto_notas (uid_gasto),
  units_covered numeric,
  unit_cost numeric(12,2),
  cfdi_uuid text,
  cfdi_source text check (cfdi_source in ('gastos', 'flujos', 'manual')),
  status text not null check (status in ('pendiente', 'confirmado', 'sin_registro', 'precio_referencia')),
  note text,
  reviewed_by text,               -- admin email
  reviewed_at timestamptz,
  -- History is kept by superseding (setting the old row's is_active to
  -- false), never deleting — this partial unique index is what enforces
  -- "one active match per item" while still allowing old rows to pile up.
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index item_purchase_matches_one_active_idx on item_purchase_matches (item_id) where is_active;
create index item_purchase_matches_item_idx on item_purchase_matches (item_id);

-- RLS ---------------------------------------------------------------------
alter table gasto_notas enable row level security;
alter table gasto_lines enable row level security;
alter table gasto_flujos enable row level security;
alter table item_match_candidates enable row level security;
alter table item_purchase_matches enable row level security;

create policy "admins can read gasto_notas" on gasto_notas for select to authenticated using (is_admin());
create policy "admins can read gasto_lines" on gasto_lines for select to authenticated using (is_admin());
create policy "admins can read gasto_flujos" on gasto_flujos for select to authenticated using (is_admin());

create policy "admins can read item_match_candidates" on item_match_candidates for select to authenticated using (is_admin());
create policy "admins can write item_match_candidates" on item_match_candidates for insert to authenticated with check (is_admin());
create policy "admins can update item_match_candidates" on item_match_candidates for update to authenticated using (is_admin()) with check (is_admin());
create policy "admins can delete item_match_candidates" on item_match_candidates for delete to authenticated using (is_admin());

create policy "admins can read item_purchase_matches" on item_purchase_matches for select to authenticated using (is_admin());
create policy "admins can write item_purchase_matches" on item_purchase_matches for insert to authenticated with check (is_admin());
create policy "admins can update item_purchase_matches" on item_purchase_matches for update to authenticated using (is_admin()) with check (is_admin());

-- gasto_notas/gasto_lines/gasto_flujos are written only by the import
-- script, which connects with the full pg role (bypasses RLS entirely)
-- the same way every other one-time import in this project does — no
-- insert/update policy needed for the app's anon-key sessions.
