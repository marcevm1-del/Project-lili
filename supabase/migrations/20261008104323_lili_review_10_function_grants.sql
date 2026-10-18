revoke all on function public.lili_mark_sold(uuid, boolean) from public, anon;
revoke execute on function public.lili_invite_code() from public, anon, authenticated;
revoke execute on function public.lili_meet_guard() from public, anon, authenticated;
revoke execute on function public.lili_offer_not_lapsed() from public, anon, authenticated;
revoke execute on function public.lili_rate_ok(text, integer, interval) from public, anon, authenticated;
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p where p.pronamespace = 'lili'::regnamespace loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
