-- ═══════════════════════════════════════════════════════════════════════════
--  BILINGUAL SEARCH
--
--  Dubai shops in two languages, often in one sentence. A woman searching
--  عباية must find a listing titled "Black Abaya", and one searching "abaya"
--  must find عباية سوداء. Substring matching cannot do that, and neither can
--  a single-language full-text index.
--
--  Three layers, in order of confidence:
--    1. full text  — proper stemming, so "dresses" finds "dress"
--    2. bridge     — a curated Arabic↔English term map, because no stemmer
--                    knows that عباية and abaya are the same garment
--    3. trigram    — typo tolerance, because "zimmerman" and "chanl" happen
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ── the bridge ─────────────────────────────────────────────────────────────
-- Curated rather than machine-translated: these are garment words as this
-- market actually says them, including the transliterations people type on a
-- Latin keyboard ("abaya", "jalabiya", "kaftan").
create table if not exists public.lili_search_terms (
  id       bigserial primary key,
  english  text not null,
  arabic   text not null,
  aliases  text[] not null default '{}'
);
alter table public.lili_search_terms enable row level security;
create policy terms_read on public.lili_search_terms for select using (true);
grant select on public.lili_search_terms to anon, authenticated;

insert into public.lili_search_terms (english, arabic, aliases) values
  ('abaya',      'عباية',    array['abayah','abbaya','abaia','3abaya']),
  ('jalabiya',   'جلابية',   array['jalabiyah','galabeya','jellabiya']),
  ('kaftan',     'قفطان',    array['caftan','kaftaan']),
  ('hijab',      'حجاب',     array['hijaab','scarf','shayla','شيلة']),
  ('dress',      'فستان',    array['dresses','gown','فساتين']),
  ('bag',        'حقيبة',    array['bags','handbag','purse','حقائب','شنطة']),
  ('shoes',      'أحذية',    array['shoe','heels','sandals','حذاء','كعب']),
  ('jacket',     'جاكيت',    array['jackets','coat','blazer','معطف']),
  ('skirt',      'تنورة',    array['skirts','تنانير']),
  ('top',        'توب',      array['tops','blouse','shirt','بلوزة','قميص']),
  ('trousers',   'بنطلون',   array['pants','jeans','بناطيل','جينز']),
  ('jewellery',  'مجوهرات',  array['jewelry','necklace','earrings','ring','خاتم','قلادة']),
  ('watch',      'ساعة',     array['watches','ساعات']),
  ('sunglasses', 'نظارات',   array['glasses','shades','نظارة']),
  ('vintage',    'فينتاج',   array['retro','قديم']),
  ('luxury',     'فاخر',     array['designer','فخم']),
  ('new',        'جديد',     array['brandnew','bnwt','unworn','جديدة']),
  ('worn once',  'لبسة وحدة', array['barely worn','like new','شبه جديد'])
on conflict do nothing;

-- ── searchable text per listing ────────────────────────────────────────────
alter table public.lili_items
  add column if not exists search_en tsvector,
  add column if not exists search_ar tsvector,
  add column if not exists search_raw text;

create or replace function lili.build_search()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare bridged text := '';
begin
  -- Pull in the other language's word for anything the listing mentions, so a
  -- listing written in English is findable in Arabic and the reverse.
  select string_agg(t.english || ' ' || t.arabic || ' ' || array_to_string(t.aliases,' '), ' ')
    into bridged
    from public.lili_search_terms t
   where lower(coalesce(new.title,'') || ' ' || coalesce(new.description,'') || ' ' ||
               coalesce(new.title_ar,'') || ' ' || coalesce(new.brand,''))
         like '%' || lower(t.english) || '%'
      or coalesce(new.title,'') || ' ' || coalesce(new.description,'') || ' ' ||
         coalesce(new.title_ar,'') like '%' || t.arabic || '%'
      or exists (select 1 from unnest(t.aliases) a
                  where lower(coalesce(new.title,'') || ' ' || coalesce(new.description,'')
                        || ' ' || coalesce(new.title_ar,'')) like '%' || lower(a) || '%');

  new.search_raw := lower(concat_ws(' ', new.title, new.title_ar, new.brand,
                                    new.description, new.condition, new.size,
                                    new.era, coalesce(bridged,'')));
  new.search_en := to_tsvector('english', unaccent(coalesce(new.search_raw,'')));
  new.search_ar := to_tsvector('simple',  coalesce(new.search_raw,''));
  return new;
end; $$;

drop trigger if exists build_search on public.lili_items;
create trigger build_search
  before insert or update of title, title_ar, brand, description, condition, size, era
  on public.lili_items for each row execute function lili.build_search();

create index if not exists lili_items_search_en on public.lili_items using gin(search_en);
create index if not exists lili_items_search_ar on public.lili_items using gin(search_ar);
create index if not exists lili_items_search_trgm
  on public.lili_items using gin(search_raw gin_trgm_ops);

-- ── the search itself ──────────────────────────────────────────────────────
create or replace function public.lili_search(
  p_query text, p_limit int default 40)
returns table (
  id uuid, title text, title_ar text, brand text, price numeric,
  condition text, photos text[], shop_id uuid, rank real, matched text)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare q text; bridged text := '';
begin
  q := lower(btrim(coalesce(p_query,'')));
  if q = '' then return; end if;

  -- expand the query itself, so searching عباية also searches "abaya"
  select string_agg(t.english || ' ' || t.arabic || ' ' || array_to_string(t.aliases,' '), ' ')
    into bridged from public.lili_search_terms t
   where q like '%' || lower(t.english) || '%'
      or q like '%' || t.arabic || '%'
      or exists (select 1 from unnest(t.aliases) a where q like '%' || lower(a) || '%');

  return query
  with expanded as (select q || ' ' || coalesce(bridged,'') as text)
  select i.id, i.title, i.title_ar, i.brand, i.price, i.condition, i.photos, i.shop_id,
         greatest(
           ts_rank(i.search_en, plainto_tsquery('english', unaccent((select text from expanded)))),
           ts_rank(i.search_ar, plainto_tsquery('simple',  (select text from expanded))),
           similarity(i.search_raw, q)
         )::real as rank,
         case
           when i.search_en @@ plainto_tsquery('english', unaccent(q)) then 'exact'
           when i.search_ar @@ plainto_tsquery('simple', q)            then 'exact'
           when bridged is not null and (
                i.search_en @@ plainto_tsquery('english', unaccent((select text from expanded)))
             or i.search_ar @@ plainto_tsquery('simple',  (select text from expanded))) then 'translated'
           else 'close'
         end as matched
  from public.lili_items i
  where i.status = 'live'
    and (
      i.search_en @@ plainto_tsquery('english', unaccent((select text from expanded)))
      or i.search_ar @@ plainto_tsquery('simple', (select text from expanded))
      or i.search_raw % q                          -- trigram: tolerates typos
    )
  order by rank desc, i.created_at desc
  limit least(coalesce(p_limit,40), 100);
end; $$;

grant execute on function public.lili_search(text, int) to anon, authenticated;

-- backfill anything already listed
update public.lili_items set title = title where true;
