-- Amarisa Inventarios: tags which items were populated by Claude's own
-- online research (brand/model/serial -> fetched specs, description,
-- dimensions, reference links, stock photo) versus confirmed against
-- the real physical unit — lets Philippe/Jorge quickly filter to what
-- still needs a human check. Purely an internal workflow field: not
-- part of items_public, never shown to a Viewer/Bidder.
--
-- Nullable, no default — the 55 originally spreadsheet-imported items
-- get neither value (their provenance is the original inventory count,
-- not this workflow), so this column only ever asserts something about
-- rows it was deliberately set on.
alter table items add column if not exists data_status text
  check (data_status in ('fetched', 'verified'));
