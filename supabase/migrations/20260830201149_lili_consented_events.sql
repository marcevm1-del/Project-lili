-- The consent sheet has asked every user, since v2.7, to agree to analytics —
-- "Help us fix what's broken / Which screens get used and where the app falls
-- over". The answer is stored, audited, and withdrawable. No code path has ever
-- read it, because there was no analytics of any kind in the app.
--
-- Collecting consent for a capability that does not exist is the mirror image
-- of the problem this project keeps fixing: a control that looks like a control.
-- Either the toggle goes or the capability arrives. Here is the capability.
--
-- Design constraints, all of them load-bearing:
--
--   · Nothing is sent unless consent.analytics is true. Enforced on the client
--     (analytics/funnel.js refuses) and here (a row can only be inserted by the
--     account it belongs to, and the client is the only thing that inserts).
--   · No free text except a zero-result search term, and only when it carries
--     no digits and no "@" — see the note in funnel.js. Everything else is an
--     enum or a number.
--   · Nobody can read anyone's events, including their own shop's. Analytics is
--     for finding broken funnels, not for looking at a named woman's evening.
--     SELECT is service_role only.
--   · Withdrawal erases. UAE PDPL (Federal Decree-Law 45 of 2021) gives a data
--     subject erasure rights; a toggle that stops future collection but leaves
--     the history is not erasure. DELETE of one's own rows is granted, and the
--     client calls it the moment consent is switched off.

create table if not exists public.lili_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id  text not null,
  name        text not null,
  props       jsonb not null default '{}'::jsonb,
  app_version text,
  created_at  timestamptz not null default now(),
  constraint lili_events_name_len  check (char_length(name) between 1 and 48),
  constraint lili_events_sess_len  check (char_length(session_id) between 8 and 64),
  constraint lili_events_props_size check (pg_column_size(props) < 2048)
);

create index if not exists lili_events_name_time on public.lili_events (name, created_at desc);
create index if not exists lili_events_session   on public.lili_events (session_id, created_at);

alter table public.lili_events enable row level security;

drop policy if exists lili_events_insert_own on public.lili_events;
create policy lili_events_insert_own on public.lili_events
  for insert to authenticated
  with check (user_id = auth.uid());

-- Erasure, not just cessation. See the PDPL note above.
drop policy if exists lili_events_delete_own on public.lili_events;
create policy lili_events_delete_own on public.lili_events
  for delete to authenticated
  using (user_id = auth.uid());

-- Deliberately no SELECT policy: not for the user, not for a moderator, not
-- for a shop owner. Reading happens with the service role, off the handset.
revoke all on public.lili_events from anon, authenticated;
grant insert (session_id, name, props, app_version) on public.lili_events to authenticated;
grant delete on public.lili_events to authenticated;
grant usage, select on all sequences in schema public to authenticated;
