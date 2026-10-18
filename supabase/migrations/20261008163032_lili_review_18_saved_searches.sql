-- Saved searches: "tell me when a Celine bag under AED 3,000 is listed".
-- Vinted, Depop and Vestiaire all have it; lili already recorded what people
-- searched for and did not find (lili_missing_demand) and did nothing for the
-- person who searched.
--
-- * Up to 10 per person, private to her, reached only through the functions.
-- * Each one reports how many matching pieces went live since she last
--   looked, so the app can show "3 new" without any notification at all.
-- * A new listing that matches notifies her, at most once per search every
--   6 hours (a seller listing forty pieces must not mean forty alerts). The
--   notification needs the kind 'saved_search', which the notifications CHECK
--   does not allow yet: until the owner runs the pending SQL the alert is
--   skipped quietly and the in-app count still works.

create table if not exists public.lili_saved_searches (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  query            text not null check (char_length(btrim(query)) between 2 and 80),
  max_price        numeric check (max_price is null or max_price > 0),
  category         text check (category is null or char_length(category) <= 40),
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  last_notified_at timestamptz
);
create unique index if not exists lili_saved_searches_uniq
  on public.lili_saved_searches (user_id, lower(btrim(query)), coalesce(max_price, 0), coalesce(category, ''));
alter table public.lili_saved_searches enable row level security;
revoke all on public.lili_saved_searches from anon, authenticated;

-- Does this live piece answer this search? Same search the app runs, so an
-- alert never names a piece the search screen would not show her.
create or replace function lili.search_hits(s public.lili_saved_searches, p_item uuid)
returns boolean language sql stable set search_path to 'public', 'pg_temp'
as $$
  select exists (select 1 from public.lili_search(s.query, 100) r
                  join public.lili_items i on i.id = r.id
                 where r.id = p_item
                   and (s.max_price is null or i.price <= s.max_price)
                   and (s.category is null or i.category = s.category));
$$;
revoke all on function lili.search_hits(public.lili_saved_searches, uuid) from public, anon, authenticated;

create or replace function public.lili_save_search(p_query text, p_max_price numeric default null, p_category text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare me uuid := auth.uid(); q text := btrim(coalesce(p_query, '')); new_id uuid;
begin
  if me is null then raise exception 'sign in to save a search' using errcode = '42501'; end if;
  if char_length(q) < 2 then raise exception 'type at least two letters' using errcode = '22023'; end if;
  if (select count(*) from public.lili_saved_searches where user_id = me) >= 10 then
    raise exception 'you can keep up to 10 saved searches' using errcode = '54000';
  end if;
  if not public.lili_rate_ok('save_search', 30, interval '1 day') then
    raise exception 'too many saved searches today' using errcode = '54000';
  end if;
  insert into public.lili_saved_searches (user_id, query, max_price, category)
  values (me, left(q, 80), p_max_price, nullif(btrim(coalesce(p_category, '')), ''))
  on conflict do nothing
  returning id into new_id;
  if new_id is null then
    select id into new_id from public.lili_saved_searches
     where user_id = me and lower(btrim(query)) = lower(left(q, 80))
       and coalesce(max_price, 0) = coalesce(p_max_price, 0)
       and coalesce(category, '') = coalesce(nullif(btrim(coalesce(p_category, '')), ''), '');
  end if;
  return jsonb_build_object('ok', true, 'id', new_id);
end; $$;

create or replace function public.lili_my_saved_searches()
returns table (id uuid, query text, max_price numeric, category text, created_at timestamptz, new_count int)
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select s.id, s.query, s.max_price, s.category, s.created_at,
         (select count(*)::int from public.lili_search(s.query, 100) r
            join public.lili_items i on i.id = r.id
           where i.created_at > s.last_seen_at and i.owner_uid <> s.user_id
             and (s.max_price is null or i.price <= s.max_price)
             and (s.category is null or i.category = s.category))
    from public.lili_saved_searches s
   where s.user_id = auth.uid()
   order by s.created_at desc;
$$;

create or replace function public.lili_saw_search(p_id uuid)
returns void language sql security definer set search_path to 'public', 'pg_temp'
as $$
  update public.lili_saved_searches set last_seen_at = now()
   where id = p_id and user_id = auth.uid();
$$;

create or replace function public.lili_forget_search(p_id uuid)
returns void language sql security definer set search_path to 'public', 'pg_temp'
as $$
  delete from public.lili_saved_searches where id = p_id and user_id = auth.uid();
$$;

create or replace function lili.notify_saved_searches()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare s public.lili_saved_searches;
begin
  if new.status is distinct from 'live' then return null; end if;
  -- newly live: listed and passed screening, or cleared by a moderator.
  -- A sold piece put back on sale is not news to anyone's search.
  if tg_op = 'UPDATE' and old.status is distinct from 'in_review' then return null; end if;

  for s in
    select * from public.lili_saved_searches ss
     where ss.user_id <> new.owner_uid
       and (ss.last_notified_at is null or ss.last_notified_at < now() - interval '6 hours')
       and (ss.max_price is null or new.price <= ss.max_price)
       and (ss.category is null or new.category = ss.category)
  loop
    continue when not lili.search_hits(s, new.id);
    begin
      insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
      values (s.user_id, 'saved_search',
              coalesce(nullif(btrim(new.title), ''), 'A new piece') || ' — AED ' || to_char(round(new.price), 'FM999,999,999'),
              'New for your saved search “' || s.query || '”.', 'item', new.id);
      update public.lili_saved_searches set last_notified_at = now() where id = s.id;
    exception when check_violation then
      null;   -- the notification kind is not allowed until the pending SQL runs
    end;
  end loop;
  return null;
end; $$;
revoke all on function lili.notify_saved_searches() from public, anon, authenticated;

create or replace trigger notify_saved_searches_ins
  after insert on public.lili_items
  for each row execute function lili.notify_saved_searches();
create or replace trigger notify_saved_searches_upd
  after update of status on public.lili_items
  for each row when (new.status = 'live') execute function lili.notify_saved_searches();

revoke all on function public.lili_save_search(text, numeric, text) from public, anon;
revoke all on function public.lili_my_saved_searches() from public, anon;
revoke all on function public.lili_saw_search(uuid) from public, anon;
revoke all on function public.lili_forget_search(uuid) from public, anon;
grant execute on function public.lili_save_search(text, numeric, text) to authenticated;
grant execute on function public.lili_my_saved_searches() to authenticated;
grant execute on function public.lili_saw_search(uuid) to authenticated;
grant execute on function public.lili_forget_search(uuid) to authenticated;
