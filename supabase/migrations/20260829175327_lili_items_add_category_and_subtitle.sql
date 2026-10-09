-- The client has always sent `category` and `subtitle` on every new listing.
-- Neither column existed, so PostgREST rejected the insert with PGRST204 and
-- repo.addItem swallowed the error into device storage. The seller saw her
-- listing; the database never did. lili_items held 0 rows.
--
-- `category` also does real work now: it is the fallback the v2.8 price band
-- uses when the title alone does not say what kind of thing the piece is.

alter table public.lili_items
  add column if not exists category text,
  add column if not exists subtitle text;

comment on column public.lili_items.category is
  'Seller-chosen shelf (Bags, Dresses, Abayas...). Used as the fallback when the title does not identify the kind of item for price banding. "Luxury" identifies nothing and is treated as unknown.';
comment on column public.lili_items.subtitle is
  'Short descriptor under the title, e.g. "Medium · Beige Lambskin". Screened and searched alongside the title.';

-- Fold the new fields into the search vector the same way the title is.
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
  new.search_en := to_tsvector('english', new.search_raw);
  new.search_ar := to_tsvector('simple',  new.search_raw);
  return new;
end; $$;

drop trigger if exists build_search on public.lili_items;
create trigger build_search
  before insert or update of title, title_ar, subtitle, brand, category, description, condition, size, era
  on public.lili_items
  for each row execute function lili.build_search();
