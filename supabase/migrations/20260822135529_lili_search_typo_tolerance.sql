-- Typo tolerance did nothing. `search_raw % q` compares the query against the
-- ENTIRE document, so "chanl" against a fifty-word listing scores near zero and
-- never crosses the threshold — the check passed syntactically and protected
-- nobody.
--
-- word_similarity (<%) compares the query against the best-matching WORD in the
-- document, which is what a misspelt brand name actually needs.
create index if not exists lili_items_search_trgm_words
  on public.lili_items using gin(search_raw gin_trgm_ops);

create or replace function public.lili_search(
  p_query text, p_limit int default 40)
returns table (
  id uuid, title text, title_ar text, brand text, price numeric,
  condition text, photos text[], shop_id uuid, rank real, matched text)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare q text; bridged text := ''; expanded text;
begin
  q := lower(btrim(coalesce(p_query,'')));
  if q = '' then return; end if;

  select string_agg(t.english || ' ' || t.arabic || ' ' || array_to_string(t.aliases,' '), ' ')
    into bridged from public.lili_search_terms t
   where q like '%' || lower(t.english) || '%'
      or q like '%' || t.arabic || '%'
      or exists (select 1 from unnest(t.aliases) a where q like '%' || lower(a) || '%');

  expanded := q || ' ' || coalesce(bridged, '');

  -- 0.35 is forgiving enough for a dropped letter, strict enough that "bag"
  -- does not match "bags of everything else".
  return query
  select i.id, i.title, i.title_ar, i.brand, i.price, i.condition, i.photos, i.shop_id,
         greatest(
           ts_rank(i.search_en, plainto_tsquery('english', unaccent(expanded))) * 2,
           ts_rank(i.search_ar, plainto_tsquery('simple',  expanded)) * 2,
           word_similarity(q, i.search_raw)
         )::real as rank,
         case
           when i.search_en @@ plainto_tsquery('english', unaccent(q))
             or i.search_ar @@ plainto_tsquery('simple', q)            then 'exact'
           when i.search_en @@ plainto_tsquery('english', unaccent(expanded))
             or i.search_ar @@ plainto_tsquery('simple',  expanded)    then 'translated'
           else 'close'
         end as matched
  from public.lili_items i
  where i.status = 'live'
    and (
      i.search_en @@ plainto_tsquery('english', unaccent(expanded))
      or i.search_ar @@ plainto_tsquery('simple', expanded)
      or word_similarity(q, i.search_raw) > 0.35
    )
  order by rank desc, i.created_at desc
  limit least(coalesce(p_limit,40), 100);
end; $$;

grant execute on function public.lili_search(text, int) to anon, authenticated;
