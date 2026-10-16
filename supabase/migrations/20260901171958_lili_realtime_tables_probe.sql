-- The bug this exists to catch: `watchMessages` subscribes to postgres_changes
-- on lili_messages and the subscription reports SUBSCRIBED whether or not the
-- table is in the supabase_realtime publication. It was not, so live delivery
-- silently did nothing for as long as the feature has existed, and no test
-- could tell — the client cannot read pg_publication_rel.
--
-- So the server answers the question instead. Table names in a publication are
-- not sensitive: this leaks nothing that list_tables does not, and it lets
-- `npm run preflight` verify live delivery with the same publishable key the
-- app ships rather than needing the service key.
create or replace function public.lili_realtime_tables()
returns text[]
language sql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
  select coalesce(array_agg(c.relname order by c.relname), '{}')
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_publication p on p.oid = pr.prpubid
   where p.pubname = 'supabase_realtime';
$$;

revoke all on function public.lili_realtime_tables() from public;
grant execute on function public.lili_realtime_tables() to anon, authenticated;
