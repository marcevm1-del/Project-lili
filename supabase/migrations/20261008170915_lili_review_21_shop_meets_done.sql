-- How many handovers a shop has completed: meets both sides agreed whose time
-- has passed and that nobody reported as a no-show. The one track record
-- lili can vouch for, since it takes no payment and sees no sale. Public, a
-- count only — never who met or where.
create or replace function public.lili_shop_meets_done(p_shop uuid)
returns int language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select count(*)::int
    from public.lili_meets m
    join public.lili_conversations c on c.id = m.conversation_id
   where c.shop_id = p_shop
     and (m.state = 'done' or (m.state = 'confirmed' and m.meet_at < now()))
     and m.checkin_state is distinct from 'no_show';
$$;
revoke all on function public.lili_shop_meets_done(uuid) from public;
grant execute on function public.lili_shop_meets_done(uuid) to anon, authenticated;
