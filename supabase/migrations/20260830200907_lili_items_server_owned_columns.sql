-- The client has a SERVER_OWNED list in remote.js that strips these fields
-- before every write. That list is a courtesy, not a control: it lives in
-- JavaScript on a handset, and anyone holding the publishable key can post
-- straight to PostgREST without it.
--
-- Checking what `authenticated` could actually update on lili_items:
--
--   previous_price, price_changed_at  — a seller could invent a discount by
--     writing her own "was" price. The comment in remote.js says exactly this
--     must not be possible; nothing was stopping it.
--   created_at  — forgeable, and now load-bearing: "New In" is derived from it
--     rather than from the old client-set isNew boolean, so a seller who could
--     write it could keep a piece at the top of the strip forever.
--   saves  — added this migration; a count nobody can inflate is the only
--     reason it is worth showing.
--   id, owner_uid  — reassignment of a row.
--
-- status, screening and the search_* vectors were already neutral because
-- BEFORE UPDATE triggers overwrite whatever is sent. Privileges are better than
-- overwriting: the write is refused rather than silently ignored, so a bug on
-- the client surfaces instead of hiding.

revoke update on public.lili_items from authenticated, anon;

grant update (title, title_ar, subtitle, brand, price, currency, category,
              condition, size, era, color, description, photos, thumbs,
              authenticated, market_code, icon, shop_id, updated_at)
  on public.lili_items to authenticated;

-- Same reasoning on shops: followers and strikes are earned or imposed, never
-- self-assigned.
revoke update on public.lili_shops from authenticated, anon;

grant update (name, name_ar, bio, banner, seller_type, market_code, updated_at)
  on public.lili_shops to authenticated;
