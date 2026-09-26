-- Buscar (the free-text fallback in /match-compras) is about to search
-- gasto_notas.proveedor_nombre as well as gasto_lines.descripcion — an
-- ilike filter across the gasto_lines -> gasto_notas !inner join with no
-- index on proveedor_nombre timed out in testing ("rosales", 57014
-- statement timeout) even though other patterns happened to return fast.
-- Same fix as 0023's descripcion index: pg_trgm-accelerated ilike.
create index gasto_notas_proveedor_nombre_trgm_idx on gasto_notas using gin (proveedor_nombre gin_trgm_ops);
