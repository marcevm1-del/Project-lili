-- ═══════════════════════════════════════════════════════════════════════════
--  SERVER-SIDE ENFORCEMENT
--
--  The app screens listings while a seller types, but that is a courtesy. This
--  is the gate. Earlier in this project the counterfeit screen was wired into
--  one of two publishing paths and the faster path published anything — the
--  kind of bug that cannot happen once the database decides.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function lili.screen_listing()
returns trigger
language plpgsql
security definer
set search_path = lili, public
as $$
declare
  blob      text;
  floor_val numeric;
  found     text[] := '{}';
  verdict   text  := 'live';
begin
  blob := lower(coalesce(new.title,'') || ' ' || coalesce(new.description,'') || ' ' || coalesce(new.brand,''));

  -- self-declared counterfeits, protected species, weapons, pharma, alcohol,
  -- used intimates: never listable, no human review needed
  if blob ~ '(replica|counterfeit|\mfake\M|mirror quality|1:1|aaa grade|\mdupe\M)'
     or blob ~ '(ivory|tortoiseshell|shahtoosh|python skin|crocodile skin)'
     or blob ~ '(firearm|\mgun\M|ammunition|taser|pepper spray|\mdagger\M)'
     or blob ~ '(tramadol|xanax|viagra|steroid|prescription)'
     or blob ~ '(whisky|vodka|\mwine\M|vape|e-cigarette|shisha|tobacco)'
     or blob ~ 'used (underwear|panties|lingerie|swimwear|socks)'
  then
    verdict := 'removed';
    found := array_append(found, 'prohibited');
  elsif blob ~ '(inspired by|style of|similar to|looks like|unauthenticated|no receipt|factory direct|wholesale|\mmoq\M)'
  then
    verdict := 'in_review';
    found := array_append(found, 'signals');
  end if;

  -- a flagship brand priced far below its floor, with no authentication,
  -- goes to a human rather than straight to the feed
  if verdict = 'live' then
    floor_val := case lower(coalesce(new.brand,''))
      when 'hermès' then 4000 when 'hermes' then 4000
      when 'chanel' then 3000 when 'louis vuitton' then 1500
      when 'dior' then 1500   when 'cartier' then 3000
      when 'rolex' then 15000 when 'bottega veneta' then 1200
      when 'gucci' then 1000  else null end;
    if floor_val is not null and new.price < floor_val and not new.authenticated then
      verdict := 'in_review';
      found := array_append(found, 'price_floor');
    end if;
  end if;

  new.status := verdict;
  new.screening := jsonb_build_object(
    'verdict', verdict, 'findings', to_jsonb(found), 'at', now()
  );

  if verdict <> 'live' then
    insert into lili.moderation_cases (kind, source, target_item_id, shop_id, reasons, state, sla_hours)
    values ('listing', 'auto_screen', new.id, new.shop_id, found, 'pending',
            case when 'prohibited' = any(found) then 24 else 72 end);
  end if;

  return new;
end;
$$;

drop trigger if exists screen_listing_ins on lili.items;
create trigger screen_listing_ins
  before insert on lili.items
  for each row execute function lili.screen_listing();

-- Re-screen on edit, so a listing cannot be published clean and then edited
-- into a counterfeit advert afterwards.
drop trigger if exists screen_listing_upd on lili.items;
create trigger screen_listing_upd
  before update of title, description, brand, price on lili.items
  for each row execute function lili.screen_listing();

-- ── privileged columns ─────────────────────────────────────────────────────
-- RLS decides which ROWS you may touch, not which COLUMNS. Without this a
-- seller could update her own shop row and hand herself 50,000 followers or
-- clear her own strikes.
create or replace function lili.guard_shop_columns()
returns trigger language plpgsql security definer set search_path = lili as $$
begin
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;
  new.owner_uid := old.owner_uid;
  new.followers := old.followers;
  new.strikes   := old.strikes;
  new.status    := old.status;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists guard_shop_cols on lili.shops;
create trigger guard_shop_cols before update on lili.shops
  for each row execute function lili.guard_shop_columns();

-- ── follower counts ────────────────────────────────────────────────────────
-- Maintained by the database, so the number reflects real rows rather than
-- whatever a client last claimed.
create or replace function lili.sync_followers()
returns trigger language plpgsql security definer set search_path = lili as $$
begin
  if tg_op = 'INSERT' then
    update lili.shops set followers = followers + 1 where id = new.shop_id;
  elsif tg_op = 'DELETE' then
    update lili.shops set followers = greatest(0, followers - 1) where id = old.shop_id;
  end if;
  return null;
end; $$;

drop trigger if exists sync_followers_ins on lili.follows;
create trigger sync_followers_ins after insert on lili.follows
  for each row execute function lili.sync_followers();
drop trigger if exists sync_followers_del on lili.follows;
create trigger sync_followers_del after delete on lili.follows
  for each row execute function lili.sync_followers();

-- ── timestamps ─────────────────────────────────────────────────────────────
create or replace function lili.touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists touch_items on lili.items;
create trigger touch_items before update on lili.items
  for each row execute function lili.touch();
