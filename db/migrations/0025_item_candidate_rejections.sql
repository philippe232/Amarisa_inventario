-- "Descartar" on a match candidate — the admin marking a specific
-- gasto_line as definitely NOT the purchase for this item, distinct
-- from "Sin registro" (no purchase record exists at all). Persisted
-- separately from item_match_candidates (which Recalcular freely
-- deletes/reinserts as a scoring cache) so a rejection survives
-- recomputation — the rejected line is excluded from the candidate
-- pool BEFORE ranking, not just hidden after, so the next-best real
-- candidate moves up to fill its spot.
create table item_candidate_rejections (
  item_id uuid not null references items (id) on delete cascade,
  uid_itemc text not null references gasto_lines (uid_itemc) on delete cascade,
  rejected_by text,
  rejected_at timestamptz not null default now(),
  primary key (item_id, uid_itemc)
);

alter table item_candidate_rejections enable row level security;

create policy "admins can read item_candidate_rejections" on item_candidate_rejections for select to authenticated using (is_admin());
create policy "admins can write item_candidate_rejections" on item_candidate_rejections for insert to authenticated with check (is_admin());
create policy "admins can delete item_candidate_rejections" on item_candidate_rejections for delete to authenticated using (is_admin());
