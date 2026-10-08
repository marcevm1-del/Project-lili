-- The guard that stops a seller awarding herself followers was also stopping
-- MODERATION from applying strikes. It tested current_setting('role'), which
-- stays 'authenticated' inside a SECURITY DEFINER function — so the moderation
-- path was silently reverted and a decision recorded "strike_applied: 1" while
-- the shop's strike count stayed at zero. A seller could collect violations
-- forever with no consequence.
--
-- current_user is the right test: inside a SECURITY DEFINER function owned by
-- postgres it becomes 'postgres', while a direct client write is still
-- 'authenticated'. So our own trusted functions pass and nothing else does.
create or replace function lili.guard_shop_columns()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if current_user in ('postgres', 'service_role')
     or current_setting('role', true) = 'service_role' then
    return new;                     -- trusted server-side path
  end if;
  new.owner_uid  := old.owner_uid;
  new.followers  := old.followers;
  new.strikes    := old.strikes;
  new.status     := old.status;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end; $$;
