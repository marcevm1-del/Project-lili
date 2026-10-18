-- M-2 · anyone could list every file in lili-photos, and the folder names are
-- user ids. Listing is now limited to her own folder (which is what deleting
-- her photos on erasure needs). Viewing is unaffected: the bucket is public,
-- and public object URLs do not go through this policy.
alter policy lili_photos_read on storage.objects
  using (bucket_id = 'lili-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
