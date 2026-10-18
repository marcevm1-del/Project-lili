-- The bucket the app has been uploading to since v2.8 did not exist.
--
-- Four policies on storage.objects reference bucket_id = 'lili-photos' — read,
-- insert, update and delete, each correctly scoped so a seller writes only
-- inside a folder named for her own uid. All four were written. The bucket they
-- guard was never created, so storage.buckets was empty and
-- `remote.uploadPhoto` would have thrown on the first photograph anybody
-- published. Since `repo.addItem` now fails loudly (v2.8) she would at least
-- have been told, but she could not have listed anything with a picture.
--
-- Found by preflight.mjs on its first run, which is the argument for having
-- written it: nothing in the source tree can see a bucket that isn't there.
--
-- Public read, because a listing photograph is shown to browsers who have no
-- session — the same reason lili_items is anonymously readable. Writes are the
-- policies above, not this flag.
--
-- 8 MB and image types only: data/images.js already resizes through a canvas
-- and produces JPEG well under that, so this is the backstop for a client that
-- has been tampered with, not the working limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lili-photos', 'lili-photos', true, 8388608,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
