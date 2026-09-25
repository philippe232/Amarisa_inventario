-- 54 of 59,710 gasto_lines rows (all old, tiny-value, non-equipment: a
-- laundry service, an event promo, a produce line) have a null
-- Insumo_NombreCompleto in the source AppSheet export itself — a real
-- data gap, not an import bug. None would ever be a match candidate
-- (isCandidateLine rejects them on categoria/clase alone), but the raw
-- archival table should still hold them. Relax the constraint rather
-- than dropping rows the import legitimately found.
alter table gasto_lines alter column descripcion drop not null;
