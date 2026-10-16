-- Where a device registration would go, if push were switched on.
--
-- Created empty and unused on purpose. The alternative is inventing the schema
-- on the afternoon somebody adds FCM credentials, which is how a device token —
-- an identifier that follows a phone across reinstalls — ends up in a table
-- anybody with the publishable key can read.
--
-- The policies are the point:
--   · a woman can read, register and delete ONLY her own device tokens
--   · nobody can read anyone else's, including through a join
--   · `anon` holds no grant at all: a browsing session has no device to register
--   · the token is never returned to any client but the one that wrote it
--
-- Nothing sends anything. src/notifications/push.js refuses every call until a
-- sender is registered, and no screen imports it.
create table if not exists public.lili_push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token       text not null,
  platform    text not null check (platform in ('android', 'ios')),
  app_version text,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  unique (user_id, token)
);

alter table public.lili_push_tokens enable row level security;

create policy push_read   on public.lili_push_tokens
  for select using (user_id = auth.uid());
create policy push_create on public.lili_push_tokens
  for insert with check (user_id = auth.uid());
create policy push_touch  on public.lili_push_tokens
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_delete on public.lili_push_tokens
  for delete using (user_id = auth.uid());

revoke all on public.lili_push_tokens from anon, authenticated;
grant select, insert, delete on public.lili_push_tokens to authenticated;
-- Only the heartbeat column is client-writable. A client that can rewrite
-- `user_id` can point somebody else's notifications at its own phone.
grant update (last_seen, app_version) on public.lili_push_tokens to authenticated;

-- Erasure has to cover this too. lili_erase_me() enumerates tables explicitly,
-- so a new table that is not added there is a table that survives "delete my
-- account" — which is exactly the bug v2.9 fixed for fifteen other tables.
comment on table public.lili_push_tokens is
  'Device push tokens. Owner-only by policy. MUST be included in lili_erase_me() and lili_export_me() — see the v2.9 erasure bug.';
