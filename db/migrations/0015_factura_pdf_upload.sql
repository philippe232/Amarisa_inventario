-- Amarisa Inventarios: factura_pdf becomes an actual uploaded file, not
-- a typed-in link — a new private storage bucket, mirroring 0004's
-- item-photos bucket/policies but NOT public: an invoice PDF is a real
-- financial document (often shows purchase price, supplier RFC), so
-- unlike item-photos there's no public-read case for it at all, only
-- Editor/Owner. factura_pdf itself keeps storing a plain storage path
-- (e.g. "<item_id>/factura-<uuid>.pdf"), not a URL — the app generates
-- a short-lived signed URL on demand to view it.
--
-- Named generically ("item-documents", not "item-facturas") in case a
-- second document type belongs here later — no schema reason to
-- special-case facturas at the bucket level.
insert into storage.buckets (id, name, public)
values ('item-documents', 'item-documents', false)
on conflict (id) do nothing;

create policy "admins can upload item documents to storage"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'item-documents' and is_admin());

-- Private bucket, unlike item-photos — reading an object (including
-- signing a URL for it) needs its own RLS policy here; a public
-- bucket's objects serve directly and never hit this check.
create policy "admins can read item documents from storage"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'item-documents' and is_admin());

create policy "admins can delete item documents from storage"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'item-documents' and is_admin());
