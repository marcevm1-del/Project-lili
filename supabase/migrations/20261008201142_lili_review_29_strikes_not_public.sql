-- A shop's strike count is a moderation sanction, not a public signal: it is
-- readable only through security-definer moderation code. Clients get every
-- other column by name.
revoke select on public.lili_shops from anon, authenticated;
grant select (id, owner_uid, name, name_ar, bio, banner, seller_type, status,
              followers, market_code, created_at, updated_at)
  on public.lili_shops to anon, authenticated;
