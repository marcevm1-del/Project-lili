-- "Will it fit?" and "what's wrong with it?" — the two questions a size label
-- and a one-word condition cannot answer, and the reason clothing resale
-- buyers message before they buy (and return after). Every fashion resale app
-- that does well on fit asks the seller for flat measurements; lili asked for
-- a size only.
--
-- * fit: how it runs against its label — 'small', 'true', 'large'.
-- * measurements: flat measurements in centimetres, a small fixed set of keys.
-- * flaws: what the seller disclosed, from a fixed list, so a buyer can filter
--   on it and a dispute can point to it. An empty list means "none noted".

create or replace function lili.valid_measurements(m jsonb)
returns boolean language sql immutable set search_path to 'pg_catalog'
as $$
  select m is null or (
    jsonb_typeof(m) = 'object'
    and not exists (
      select 1 from jsonb_each(m) e
       where e.key not in ('chest', 'waist', 'hips', 'length', 'shoulders', 'sleeve', 'inseam')
          or jsonb_typeof(e.value) <> 'number'
          or (e.value)::numeric <= 0 or (e.value)::numeric > 300));
$$;
grant execute on function lili.valid_measurements(jsonb) to anon, authenticated;

alter table public.lili_items
  add column if not exists fit text check (fit is null or fit in ('small', 'true', 'large')),
  add column if not exists measurements jsonb check (lili.valid_measurements(measurements)),
  add column if not exists flaws text[] check (flaws is null or (
    cardinality(flaws) <= 8 and flaws <@ array['stain', 'pilling', 'fading', 'hole', 'missing_button',
                                               'altered', 'odour', 'wear', 'scuff', 'loose_thread']));

grant update (fit, measurements, flaws) on public.lili_items to authenticated;
