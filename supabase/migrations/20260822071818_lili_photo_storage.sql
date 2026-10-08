-- ═══════════════════════════════════════════════════════════════════════════
--  PHOTO STORAGE
--
--  Listings currently hold their photos as data URLs on the device, which works
--  perfectly for one phone and not at all for a marketplace: every piece would
--  appear blank to everyone except the seller.
--
--  Public read, because a catalogue nobody can see is not a catalogue. Writes
--  are confined to a folder named after the uploader, so one seller cannot
--  overwrite another's photographs.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lili-photos', 'lili-photos', true,
  5242880,                                            -- 5 MB a photo
  array['image/jpeg','image/png','image/webp']         -- no SVG: it can carry script
)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- anyone may look
drop policy if exists lili_photos_read on storage.objects;
create policy lili_photos_read on storage.objects
  for select using (bucket_id = 'lili-photos');

-- you may only write inside your own folder: lili-photos/<your uid>/...
drop policy if exists lili_photos_insert on storage.objects;
create policy lili_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lili-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists lili_photos_update on storage.objects;
create policy lili_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'lili-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists lili_photos_delete on storage.objects;
create policy lili_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'lili-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
