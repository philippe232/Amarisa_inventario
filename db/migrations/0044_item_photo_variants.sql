-- Smaller copies of each photo, so lists and article pages don't download
-- full camera-size originals (1.7 MB on average; one catalog load was
-- ~590 MB and blew the free plan's cached-egress quota).
--   thumb_url  ~320px, for lists and thumbnails
--   md_url     ~1280px, for the article page and the full-size viewer
-- `url` stays the original / full version. Null means "no small copy yet":
-- screens fall back to the next size up, so nothing breaks while the
-- existing photos are converted (db/make-photo-variants.mjs).
alter table item_photos
  add column thumb_url text,
  add column md_url text;
