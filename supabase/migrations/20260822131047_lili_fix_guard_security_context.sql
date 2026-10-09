-- The guard was SECURITY DEFINER, which meant current_user was ALWAYS 'postgres'
-- inside it — so the bypass I added for moderation matched every caller,
-- including the seller. She could clear her own strikes and award herself
-- followers. The guard was defeating itself.
--
-- It never needed elevated rights: all it does is rewrite NEW. Without
-- SECURITY DEFINER it inherits the caller's context, so:
--   · a client write runs as 'authenticated'  → columns reverted
--   · our SECURITY DEFINER moderation function runs as 'postgres' → allowed
--
-- The lesson: a guard that can be reached through a privileged path must not
-- itself be privileged.
create or replace function lili.guard_shop_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('postgres', 'service_role') then
    return new;                     -- trusted server-side path only
  end if;
  new.owner_uid  := old.owner_uid;
  new.followers  := old.followers;
  new.strikes    := old.strikes;
  new.status     := old.status;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end; $$;
