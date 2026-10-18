-- ─────────────────────────────────────────────────────────────────────────────
-- 39 · Meeting in person is removed
--
-- Every piece now goes by courier. The owner's call: lili sells across the UAE
-- and the GCC, and a handover between strangers is the part of the product
-- lili can do least about.
--
-- Nothing is dropped here (that is the owner's, in supabase/pending): the
-- lili_meets table and its functions stay, unused, until then. What changes:
--
--   · a listing can no longer offer "meet". A listing saved by an older app
--     that still sends it has it taken out, and one left with no courier gets
--     the default pair, the same as a new listing's column default;
--   · no new meet plan can be proposed;
--   · no order can be created for a meet.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.lili_items alter column delivery set default '{aramex,emirates_post}';

create or replace function lili.item_courier_only()
returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $$
begin
  new.delivery := array_remove(coalesce(new.delivery, '{}'::text[]), 'meet');
  if cardinality(new.delivery) = 0 then
    new.delivery := '{aramex,emirates_post}';
  end if;
  return new;
end; $$;
revoke all on function lili.item_courier_only() from public, anon, authenticated;
create or replace trigger lili_item_courier_only before insert or update of delivery on public.lili_items
  for each row execute function lili.item_courier_only();

create or replace function lili.meet_removed()
returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $$
begin
  raise exception 'Meeting in person has been removed. Agree a courier with her in Messages.'
    using errcode = '55000';
end; $$;
revoke all on function lili.meet_removed() from public, anon, authenticated;
create or replace trigger lili_meet_removed before insert on public.lili_meets
  for each row execute function lili.meet_removed();

create or replace function lili.order_courier_only()
returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $$
begin
  if new.method = 'meet' then
    raise exception 'Meeting in person has been removed. Choose a courier.' using errcode = '22023';
  end if;
  return new;
end; $$;
revoke all on function lili.order_courier_only() from public, anon, authenticated;
create or replace trigger lili_order_courier_only before insert on public.lili_orders
  for each row execute function lili.order_courier_only();
