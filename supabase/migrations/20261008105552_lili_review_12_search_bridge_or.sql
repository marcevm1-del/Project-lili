-- The bilingual bridge appended every synonym to the query and passed the lot
-- to plainto_tsquery, which ANDs words: searching "عباية" required a listing to
-- contain abaya AND abayah AND abbaya AND abaia AND 3abaya AND عباية, so no
-- translated search ever matched. Terms also matched inside words ("ring" in
-- "earrings", "new" in "newspaper"). Each translation is now an alternative
-- (OR), terms match whole words only, and the typo threshold is pg_trgm's own
-- default (0.3) so a swapped letter ("scraf") still finds "scarf".
create or replace function public.lili_search(p_query text, p_limit integer default 40)
returns table(id uuid, title text, title_ar text, brand text, price numeric, condition text,
              photos text[], shop_id uuid, rank real, matched text)
language plpgsql stable set search_path to 'public', 'pg_temp'
as $$
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
        where q ~ ('(^|[^[:alnum:]])' || lower(k) || '([^[:alnum:]]|$)'))
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
     and (i.search_en @@ x_en or i.search_ar @@ x_ar or word_similarity(q, i.search_raw) > 0.3)
   order by rank desc, i.created_at desc
   limit least(coalesce(p_limit, 40), 100);
end; $$;

-- Who follows which shop was readable by anyone, signed in or not. The count
-- is already public on lili_shops.followers (kept by sync_followers), so the
-- list itself need not be: each person now sees only her own follows.
alter policy follows_count_read on public.lili_follows
  using (user_id = (select auth.uid()));
