-- ─────────────────────────────────────────────────────────────────────────────
-- 41 · Parcels delivered, a shop's public count
--
-- The track record lili can vouch for without holding money: parcels the
-- seller recorded in Messages and the buyer confirmed she received (40). It
-- replaces "meets completed" (21), which ended with meeting in person (39), as
-- the strongest of a shop's earned trust signals. A count only: nothing about
-- who bought, what, or where it went.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.lili_shop_parcels_done(p_shop uuid)
returns integer language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select count(*)::int
    from public.lili_parcels p
   where p.shop_id = p_shop and p.received_at is not null;
$$;
revoke all on function public.lili_shop_parcels_done(uuid) from public;
grant execute on function public.lili_shop_parcels_done(uuid) to anon, authenticated, service_role;
