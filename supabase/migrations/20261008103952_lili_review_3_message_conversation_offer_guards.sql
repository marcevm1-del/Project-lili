create or replace function lili.guard_message_insert()
returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $$
begin
  if current_user in ('postgres', 'service_role') then return new; end if;
  new.created_at := now(); new.read_at := null;
  return new;
end; $$;
create or replace trigger guard_msg_ins before insert on public.lili_messages
  for each row execute function lili.guard_message_insert();

create or replace function lili.guard_conversation_insert()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_item_owner uuid; v_item_shop uuid;
begin
  if coalesce(current_setting('role', true), '') not in ('authenticated', 'anon') then return new; end if;
  if new.item_id is not null then
    select owner_uid, shop_id into v_item_owner, v_item_shop from public.lili_items where id = new.item_id;
    if v_item_owner is distinct from new.seller_uid then
      raise exception 'That listing is not this seller''s' using errcode = '22023';
    end if;
    new.shop_id := v_item_shop;
  else
    select id into new.shop_id from public.lili_shops where owner_uid = new.seller_uid
     order by (status = 'active') desc, created_at limit 1;
  end if;
  new.last_message := null; new.last_at := now(); new.created_at := now();
  return new;
end; $$;
create or replace trigger guard_conv_ins before insert on public.lili_conversations
  for each row execute function lili.guard_conversation_insert();

create or replace function lili.guard_offer_insert()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce(current_setting('role', true), '') not in ('authenticated', 'anon') then return new; end if;
  new.created_at := now(); new.expires_at := now() + interval '48 hours'; new.responded_at := null;
  select shop_id into new.shop_id from public.lili_items where id = new.item_id;
  if new.counter_of is not null and not exists (
       select 1 from public.lili_offers o
        where o.id = new.counter_of and o.item_id = new.item_id
          and o.buyer_uid = new.buyer_uid and o.seller_uid = new.seller_uid) then
    new.counter_of := null;
  end if;
  return new;
end; $$;
create or replace trigger guard_offer_ins before insert on public.lili_offers
  for each row execute function lili.guard_offer_insert();
