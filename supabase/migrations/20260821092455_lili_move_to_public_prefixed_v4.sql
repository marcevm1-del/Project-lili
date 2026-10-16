do $$
declare r record;
begin
  for r in select c.conname, t.relname from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'lili' and c.conname not like 'lili\_%'
  loop
    execute format('alter table lili.%I rename constraint %I to %I',
                   r.relname, r.conname, 'lili_' || r.conname);
  end loop;

  for r in select i.relname as idxname from pg_class i
    join pg_namespace n on n.oid = i.relnamespace
    where n.nspname = 'lili' and i.relkind = 'i' and i.relname not like 'lili\_%'
  loop
    execute format('alter index lili.%I rename to %I', r.idxname, 'lili_' || r.idxname);
  end loop;

  for r in select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'lili' and c.relkind = 'S' and c.relname not like 'lili\_%'
  loop
    execute format('alter sequence lili.%I rename to %I', r.relname, 'lili_' || r.relname);
  end loop;

  for r in select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'lili' and c.relkind = 'r' and c.relname not like 'lili\_%'
  loop
    execute format('alter table lili.%I rename to %I', r.relname, 'lili_' || r.relname);
  end loop;

  -- Tables only. A serial's sequence is owned by its table and travels with it,
  -- so moving sequences separately looked for one that had already gone.
  for r in select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'lili' and c.relkind = 'r'
  loop
    execute format('alter table lili.%I set schema public', r.relname);
  end loop;
end $$;

-- any sequence left behind (not owned by a moved table) follows now
do $$
declare r record;
begin
  for r in select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'lili' and c.relkind = 'S'
  loop
    execute format('alter sequence lili.%I set schema public', r.relname);
  end loop;
end $$;

grant select, insert, update on public.lili_shops, public.lili_items to authenticated;
grant select on public.lili_shops, public.lili_items, public.lili_follows to anon;
grant select, insert, update, delete on public.lili_profiles, public.lili_follows,
  public.lili_saves, public.lili_carts, public.lili_blocks to authenticated;
grant insert on public.lili_moderation_cases to authenticated;
grant usage, select on all sequences in schema public to authenticated;
