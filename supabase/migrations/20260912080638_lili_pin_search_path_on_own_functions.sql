-- A SECURITY DEFINER function with an unpinned search_path runs whatever the
-- CALLER's search_path resolves the names to. Create a table called `lili_items`
-- in a schema you control, put it first on your path, and the definer-rights
-- function operates on your table with the owner's privileges. It is the
-- standard Postgres privilege-escalation route and the reason Supabase's linter
-- flags it.
--
-- Eleven of lili's own functions were unpinned. Pinned here, leaving the other
-- application's functions alone — they are not ours to change, and they are
-- reported separately.
do $$
declare f record; n int := 0;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace nsp on nsp.oid = p.pronamespace
     where (nsp.nspname = 'lili'
            or (nsp.nspname = 'public' and p.proname like 'lili\_%'))
       and p.prokind = 'f'
       and (p.proconfig is null
            or not exists (select 1 from unnest(p.proconfig) c where c like 'search\_path=%'))
  loop
    execute format('alter function %s set search_path to %L, %L', f.sig, 'public', 'pg_temp');
    n := n + 1;
  end loop;
  raise notice 'pinned search_path on % function(s)', n;
end $$;
