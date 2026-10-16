-- lili_search unaccents the QUERY before matching search_en
-- (plainto_tsquery('english', unaccent(expanded))), so the VECTOR has to be
-- built the same way or "Hermès" in a title never matches a search for
-- "Hermes". Restoring unaccent on the english vector; the arabic vector uses
-- the 'simple' config on the raw text, which is what the query side does too.

create or replace function lili.build_search()
returns trigger
language plpgsql
as $$
begin
  new.search_raw :=
    coalesce(new.title,'') || ' ' || coalesce(new.title_ar,'') || ' ' ||
    coalesce(new.subtitle,'') || ' ' || coalesce(new.brand,'') || ' ' ||
    coalesce(new.category,'') || ' ' || coalesce(new.description,'') || ' ' ||
    coalesce(new.condition,'') || ' ' || coalesce(new.size,'') || ' ' ||
    coalesce(new.era,'');
  new.search_en := to_tsvector('english', unaccent(new.search_raw));
  new.search_ar := to_tsvector('simple',  new.search_raw);
  return new;
end; $$;
