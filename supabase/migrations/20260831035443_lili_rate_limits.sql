-- There was no rate limiting anywhere in the system.
--
-- The sharpest consequence was the invite gate. `LILI-XXXX` over a 28-symbol
-- alphabet is ~614,000 combinations; with 30 codes live that is roughly 1 in
-- 20,000. No attempt counter, no lockout, no delay, no captcha at any layer —
-- and the client was never the attack surface anyway, because the publishable
-- key ships in the bundle by design and anonymous sign-in hands an attacker a
-- session to POST the RPC in a loop. At 100 requests a second, a valid unused
-- code in three to five minutes. Redeeming one grants shop creation, listing,
-- and the ability to message real users.
--
-- Failed attempts were "recorded" — in the attacker's own device audit log,
-- capped at 500 entries. Nobody server-side ever saw one.
--
-- Two fixes, and both are needed. This migration is the counter; the next
-- widens the keyspace. Neither alone is enough: a longer code with no limit is
-- still enumerable given time, and a limit on a four-character code still lets
-- 30 attempts a day chip away at 614k.

create table if not exists public.lili_attempts (
  actor      uuid not null default auth.uid(),
  action     text not null,
  window_key text not null,
  n          int  not null default 0,
  first_at   timestamptz not null default now(),
  primary key (actor, action, window_key)
);

alter table public.lili_attempts enable row level security;
revoke all on public.lili_attempts from anon, authenticated;
-- No policy at all: only definer functions touch this. A client that could
-- read it would know how close it was to a lockout, and one that could write
-- it would reset its own counter.

/**
 * Count an attempt and say whether it is allowed.
 *
 * Fixed windows rather than a sliding log: one row per actor per action per
 * window, so the table stays small and the cost of a check is a single upsert.
 * A determined attacker gets 2×limit across a window boundary, which for these
 * numbers is irrelevant.
 *
 * Keyed on auth.uid(). An attacker can mint new anonymous sessions, which is
 * why the invite keyspace is widened as well — the limit raises the cost of
 * each identity, the keyspace raises the cost of the whole search.
 */
create or replace function public.lili_rate_ok(p_action text, p_limit int, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  key text := to_char(date_trunc('hour', now()) +
              (floor(extract(epoch from (now() - date_trunc('hour', now()))) /
                     greatest(1, extract(epoch from p_window)))
               * p_window), 'YYYYMMDDHH24MISS');
  cur int;
begin
  if me is null then return false; end if;
  insert into public.lili_attempts (actor, action, window_key, n)
  values (me, p_action, key, 1)
  on conflict (actor, action, window_key)
    do update set n = public.lili_attempts.n + 1
  returning n into cur;
  return cur <= p_limit;
end;
$$;

/** Housekeeping: a fixed-window counter is worthless the moment it is stale. */
create or replace function public.lili_prune_attempts()
returns int
language sql
security definer
set search_path = public, pg_temp
as $$
  with gone as (delete from public.lili_attempts where first_at < now() - interval '7 days' returning 1)
  select count(*)::int from gone;
$$;

revoke all on function public.lili_rate_ok(text, int, interval) from public, anon, authenticated;
revoke all on function public.lili_prune_attempts() from public, anon, authenticated;

select cron.unschedule('lili-prune-attempts')
 where exists (select 1 from cron.job where jobname = 'lili-prune-attempts');
select cron.schedule('lili-prune-attempts', '23 3 * * *',
                     $$select public.lili_prune_attempts();$$);
