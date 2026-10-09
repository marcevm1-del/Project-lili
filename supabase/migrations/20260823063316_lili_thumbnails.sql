-- The photo pipeline already produced a 400px thumbnail and then threw it away:
-- only the 1600px original was uploaded. So a feed of 2-column tiles about
-- 180px wide was pulling full-size images — roughly twenty times the bytes it
-- needed, on mobile data, for every tile on screen.
--
-- Thumbnails are stored alongside, positionally matched to photos.
alter table public.lili_items
  add column if not exists thumbs text[] not null default '{}';

comment on column public.lili_items.thumbs is
  'Small versions of photos[], same order. The feed reads these; the item detail reads photos[]. A tile should never download a 1600px image.';
