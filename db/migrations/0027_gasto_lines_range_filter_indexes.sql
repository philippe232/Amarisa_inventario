-- Buscar's new monto/fecha range filters (searchGastoLines in
-- match-compras-screen.tsx) can run with no other predicate at all —
-- just "total_neto between X and Y", no descripcion/proveedor text to
-- narrow it first. Confirmed directly: that shape times out (57014)
-- scanning all ~59,710 gasto_lines under RLS with no index to lean on.
-- Plain b-tree indexes, not trigram — these are numeric/date range
-- filters, not text search.
create index gasto_lines_total_neto_idx on gasto_lines (total_neto);
create index gasto_lines_fecha_op_idx on gasto_lines (fecha_op);
