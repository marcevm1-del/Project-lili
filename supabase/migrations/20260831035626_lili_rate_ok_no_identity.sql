-- The first cut returned false — deny — when auth.uid() was null, and the
-- listing limit then refused the very first insert made by the service role.
-- Caught by the verification script, not in review, which is the argument for
-- running one against the live database rather than reading the SQL twice.
--
-- The right direction here is allow, and the reason is a grant rather than a
-- guess: a request with no auth.uid() is either the service role, a migration,
-- or a scheduled job — none of which is a client — and the only client role
-- that could reach these tables at all is `authenticated`, which by definition
-- has a uid. `anon` holds no INSERT on lili_items, lili_messages,
-- lili_conversations, lili_offers or lili_moderation_cases, so an
-- unauthenticated request never gets as far as this trigger.
--
-- The role is checked as well, with current_setting('role') rather than
-- current_user: SECURITY DEFINER changes current_user and would defeat the
-- check, which is the same trap the case-evidence guard was written around.

create or replace function public.lili_rate_ok(p_action text, p_limit int, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := auth.uid();
  who text := coalesce(current_setting('role', true), '');
  key text := to_char(date_trunc('hour', now()) +
              (floor(extract(epoch from (now() - date_trunc('hour', now()))) /
                     greatest(1, extract(epoch from p_window)))
               * p_window), 'YYYYMMDDHH24MISS');
  cur int;
begin
  -- Not a client request: the service role, a migration, or cron. Nothing to
  -- limit, and limiting it would break the platform's own writes.
  if me is null and who not in ('authenticated', 'anon') then
    return true;
  end if;
  -- A client with no identity has no grant to be here; refuse rather than
  -- count, so a bug that lets one through does not also get unlimited tries.
  if me is null then
    return false;
  end if;

  insert into public.lili_attempts (actor, action, window_key, n)
  values (me, p_action, key, 1)
  on conflict (actor, action, window_key)
    do update set n = public.lili_attempts.n + 1
  returning n into cur;
  return cur <= p_limit;
end;
$$;

revoke all on function public.lili_rate_ok(text, int, interval) from public, anon, authenticated;
