-- H-8 · when the app crashed on a phone, nobody found out: the error boundary
-- wrote to that phone's localStorage and the console, both of which stay on
-- the phone. This is the smallest honest crash log: one table no client can
-- read, one function any client can append to, with caps so it cannot be used
-- as free storage or a flood.
--
-- Nothing personal is accepted: the app strips emails and long numbers before
-- sending, and the user id is taken from the session, never from the payload.

create table if not exists public.lili_client_errors (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  uid        uuid,
  kind       text not null check (kind in ('crash', 'error', 'rejection')),
  message    text not null,
  stack      text,
  screen     text,
  version    text,
  platform   text
);
create index if not exists lili_client_errors_at on public.lili_client_errors (at desc);
alter table public.lili_client_errors enable row level security;
revoke all on public.lili_client_errors from anon, authenticated;

create or replace function public.lili_report_error(
  p_kind text, p_message text, p_stack text default null, p_screen text default null,
  p_version text default null, p_platform text default null)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare me uuid := auth.uid();
begin
  if p_kind not in ('crash', 'error', 'rejection') or coalesce(btrim(p_message), '') = '' then return; end if;
  -- a flood from anywhere is dropped, not stored
  if (select count(*) from public.lili_client_errors where at > now() - interval '1 hour') >= 2000 then return; end if;
  if me is not null and not public.lili_rate_ok('client_error', 50, interval '1 hour') then return; end if;
  insert into public.lili_client_errors (uid, kind, message, stack, screen, version, platform)
  values (me, p_kind, left(p_message, 500), left(p_stack, 4000), left(p_screen, 60),
          left(p_version, 20), left(p_platform, 20));
end; $$;
revoke all on function public.lili_report_error(text, text, text, text, text, text) from public;
grant execute on function public.lili_report_error(text, text, text, text, text, text) to anon, authenticated;

-- What the owner reads: the most common errors of the last week, newest first.
create or replace view lili.recent_errors as
  select kind, message, version, platform, count(*) as times, max(at) as last_seen,
         count(distinct uid) as people
    from public.lili_client_errors
   where at > now() - interval '7 days'
   group by kind, message, version, platform
   order by last_seen desc;
revoke all on lili.recent_errors from public, anon, authenticated;
