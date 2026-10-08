-- Audit fixes H-13, M-3, M-4.

-- H-13 · saves and follows are rate-limited like every other write. Both feed
-- public numbers (a piece's saves drive "Most saved"; a shop shows followers),
-- and anonymous accounts are free to mint.
create or replace function public.lili_limit_social()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
begin
  if tg_table_name = 'lili_saves' then
    if not public.lili_rate_ok('save', 300, interval '24 hours') then
      raise exception 'That is a lot of saves today. Try again tomorrow.' using errcode = '53400';
    end if;
  elsif not public.lili_rate_ok('follow', 100, interval '24 hours') then
    raise exception 'That is a lot of follows today. Try again tomorrow.' using errcode = '53400';
  end if;
  return new;
end; $$;
revoke all on function public.lili_limit_social() from public, anon, authenticated;

create or replace trigger lili_saves_limit
  before insert on public.lili_saves for each row execute function public.lili_limit_social();
create or replace trigger lili_follows_limit
  before insert on public.lili_follows for each row execute function public.lili_limit_social();

-- M-3 · the minimum listing price (AED 200 for the UAE, markets.AE in the app)
-- was enforced only by the form. Enforced here for client writes; the
-- database's own jobs and tests are not affected.
create or replace function lili.guard_min_price()
returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce(current_setting('role', true), '') not in ('authenticated', 'anon') then return new; end if;
  if coalesce(new.market_code, 'AE') = 'AE' and new.price < 200 then
    raise exception 'The minimum price on lili is AED 200' using errcode = '22023';
  end if;
  return new;
end; $$;
revoke all on function lili.guard_min_price() from public, anon, authenticated;

create or replace trigger guard_min_price
  before insert or update of price on public.lili_items
  for each row execute function lili.guard_min_price();

-- M-4 · one live meet plan per conversation. Two proposed at once left the app
-- showing one while the other could be confirmed unseen.
create unique index if not exists lili_meets_one_live
  on public.lili_meets (conversation_id) where state in ('proposed', 'confirmed');
