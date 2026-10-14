-- ─────────────────────────────────────────────────────────────────────────────
-- 37 · Holiday mode
--
-- Every resale app she has used has one: away for Eid, travelling for the
-- summer, she pauses the shop instead of disappointing buyers. Until a date
-- she picks (at most 90 days ahead) her pieces leave search, new offers and
-- orders on them are refused, and the shop says when she is back. Nothing is
-- deleted and nothing has to be switched back on: the date passing reopens it.
--
-- A seller can still answer an offer made before she left, and counter it;
-- only new offers from buyers wait.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.lili_shops add column if not exists away_until timestamptz;
alter table public.lili_shops add column if not exists away_note text
  check (away_note is null or char_length(away_note) <= 140);

-- readable like the rest of the shop's public face; written by the owner only
-- (shops_update already limits updates to owner_uid = auth.uid())
grant select (away_until, away_note) on public.lili_shops to anon, authenticated;
grant update (away_until, away_note) on public.lili_shops to authenticated;

create or replace function lili.shop_away_guard()
returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $$
begin
  if new.away_until is not null and new.away_until <= now() then
    new.away_until := null;                       -- a date already past means "back"
  end if;
  if new.away_until is not null and new.away_until > now() + interval '90 days' then
    raise exception 'You can be away for up to 90 days at a time' using errcode = '22023';
  end if;
  if new.away_until is null then new.away_note := null; end if;
  new.away_note := nullif(btrim(coalesce(new.away_note, '')), '');
  return new;
end; $$;
revoke all on function lili.shop_away_guard() from public, anon, authenticated;
create or replace trigger lili_shop_away_guard before insert or update of away_until, away_note on public.lili_shops
  for each row execute function lili.shop_away_guard();

-- new offers from buyers wait until she is back
create or replace function lili.offer_respects_away()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare back timestamptz;
begin
  if coalesce(new.made_by, 'buyer') <> 'buyer' then return new; end if;
  select s.away_until into back
    from public.lili_items i join public.lili_shops s on s.id = i.shop_id
   where i.id = new.item_id and s.away_until > now();
  if back is not null then
    raise exception 'This seller is away until %. Offers reopen then.', to_char(back at time zone 'Asia/Dubai', 'FMDD Mon')
      using errcode = '55000';
  end if;
  return new;
end; $$;
revoke all on function lili.offer_respects_away() from public, anon, authenticated;
create or replace trigger lili_offer_respects_away before insert on public.lili_offers
  for each row execute function lili.offer_respects_away();

-- …and so do orders (checked when the order is created, before any payment)
create or replace function lili.order_respects_away()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare back timestamptz;
begin
  select away_until into back from public.lili_shops where id = new.shop_id and away_until > now();
  if back is not null then
    raise exception 'This seller is away until %. Orders reopen then.', to_char(back at time zone 'Asia/Dubai', 'FMDD Mon')
      using errcode = '55000';
  end if;
  return new;
end; $$;
revoke all on function lili.order_respects_away() from public, anon, authenticated;
create or replace trigger lili_order_respects_away before insert on public.lili_orders
  for each row execute function lili.order_respects_away();

-- search leaves out a shop that is away (migration 34's body, plus that line)
create or replace function public.lili_search(p_query text, p_limit integer default 40)
returns table(id uuid, title text, title_ar text, brand text, price numeric, condition text,
              photos text[], shop_id uuid, rank real, matched text)
language plpgsql stable set search_path to 'public', 'pg_temp'
as $function$
declare
  q text; w text;
  q_en tsquery; q_ar tsquery; x_en tsquery; x_ar tsquery;
begin
  q := lower(btrim(coalesce(p_query, '')));
  if q = '' then return; end if;

  q_en := plainto_tsquery('english', unaccent(q));
  q_ar := plainto_tsquery('simple', q);
  x_en := q_en;
  x_ar := q_ar;

  for w in
    select distinct v
      from public.lili_search_terms t
     cross join lateral unnest(array[t.english, t.arabic] || coalesce(t.aliases, '{}')) v
     where exists (
       select 1 from unnest(array[t.english, t.arabic] || coalesce(t.aliases, '{}')) k
        where k <> ''
          and strpos(q, lower(k)) > 0
          and q ~ ('(^|[^[:alnum:]])' || lower(k) || '([^[:alnum:]]|$)'))
  loop
    x_en := x_en || plainto_tsquery('english', unaccent(lower(w)));
    x_ar := x_ar || plainto_tsquery('simple', lower(w));
  end loop;

  return query
  select i.id, i.title, i.title_ar, i.brand, i.price, i.condition, i.photos, i.shop_id,
         greatest(ts_rank(i.search_en, x_en) * 2,
                  ts_rank(i.search_ar, x_ar) * 2,
                  word_similarity(q, i.search_raw))::real as rank,
         case
           when i.search_en @@ q_en or i.search_ar @@ q_ar then 'exact'
           when i.search_en @@ x_en or i.search_ar @@ x_ar then 'translated'
           else 'close'
         end as matched
    from public.lili_items i
   where i.status = 'live'
     and not exists (select 1 from public.lili_shops s where s.id = i.shop_id and s.away_until > now())
     and (i.search_en @@ x_en or i.search_ar @@ x_ar or word_similarity(q, i.search_raw) > 0.3)
   order by rank desc, i.created_at desc
   limit least(coalesce(p_limit, 40), 100);
end; $function$;
