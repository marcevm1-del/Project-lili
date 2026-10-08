create or replace function public.lili_rate_ok(p_action text, p_limit integer, p_window interval)
returns boolean language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  me  uuid := auth.uid();
  who text := coalesce(current_setting('role', true), '');
  w   numeric := greatest(1, extract(epoch from p_window));
  key text := to_char(to_timestamp(floor(extract(epoch from now()) / w) * w) at time zone 'UTC',
                      'YYYYMMDDHH24MISS');
  cur int;
begin
  if me is null and who not in ('authenticated', 'anon') then return true; end if;
  if me is null then return false; end if;
  insert into public.lili_attempts (actor, action, window_key, n)
  values (me, p_action, key, 1)
  on conflict (actor, action, window_key) do update set n = public.lili_attempts.n + 1
  returning n into cur;
  return cur <= p_limit;
end; $$;
