-- lili: sellers could not create a single listing.
--
-- items_create required `status = 'pending' AND screening = '{}'`. But RLS
-- WITH CHECK is evaluated *after* BEFORE triggers, and the SECURITY DEFINER
-- trigger `screen_listing_ins` always rewrites both columns (status becomes
-- live / in_review / removed, screening becomes the verdict object). So every
-- insert by a real seller failed with 42501 "new row violates row-level
-- security policy". Verified live against the original policy.
--
-- The two conditions are redundant anyway: the trigger owns status and
-- screening on insert, so whatever the client sends is overwritten. Ownership,
-- shop ownership and the beta gate stay enforced.
alter policy items_create on public.lili_items
  with check (((owner_uid = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.lili_shops s
  WHERE ((s.id = lili_items.shop_id) AND (s.owner_uid = (select auth.uid()))))) AND public.lili_is_beta_member()));
