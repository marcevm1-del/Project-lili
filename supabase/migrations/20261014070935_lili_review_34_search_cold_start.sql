-- lili_search compiled a word-boundary regex for every search term and alias
-- (~500) on every query: 56 ms warm, and past the anon role's statement
-- timeout (error 57014) on the first search after the free-tier project sat
-- idle. A plain substring test is a necessary condition for the regex to
-- match, so it runs first and the regex only compiles for the few terms that
-- appear in the query. Results are unchanged.
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
     and (i.search_en @@ x_en or i.search_ar @@ x_ar or word_similarity(q, i.search_raw) > 0.3)
   order by rank desc, i.created_at desc
   limit least(coalesce(p_limit, 40), 100);
end; $function$;
