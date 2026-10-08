-- pin the search_path (flagged by the linter — a mutable one is a
-- privilege-escalation vector on a function that runs during writes)
create or replace function lili.touch()
returns trigger language plpgsql set search_path = lili, public as $$
begin new.updated_at := now(); return new; end; $$;

-- The linter flags lili.audit as "RLS enabled, no policy". That is deliberate:
-- no policy means no client can read or write it under any circumstances, and
-- only the service role — which bypasses RLS — appends to it. A moderation
-- trail a moderator can edit is not a trail.
comment on table lili.audit is
  'Append-only, server-only. RLS enabled with NO policies on purpose: this denies all client access. Written by the service role only.';

-- remove the screening fixtures
delete from lili.moderation_cases where shop_id = '22222222-2222-2222-2222-222222222222';
delete from lili.items  where shop_id  = '22222222-2222-2222-2222-222222222222';
delete from lili.shops  where id       = '22222222-2222-2222-2222-222222222222';
delete from auth.users  where id       = '11111111-1111-1111-1111-111111111111';
