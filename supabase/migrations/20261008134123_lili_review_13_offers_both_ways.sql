-- Counter-offers never worked. The app marked the original "countered" and then
-- inserted a new offer as the seller, which offers_create refuses (the creator
-- must be the buyer), leaving the original stuck. Even had it been stored, the
-- guard let a buyer only withdraw, so she could never accept a counter.
--
-- An offer now records who made it. The other person answers it (accept,
-- decline, counter); the person who made it may withdraw it. Counters go
-- through lili_counter_offer, which does both steps in one transaction.

alter table public.lili_offers
  add column if not exists made_by text not null default 'buyer'
  check (made_by in ('buyer', 'seller'));

create or replace function lili.guard_offer()
returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $$
declare maker uuid; responder uuid;
begin
  if current_user in ('postgres', 'service_role') then return new; end if;

  -- money, parties, authorship and timing are fixed once made
  new.amount := old.amount; new.item_id := old.item_id;
  new.buyer_uid := old.buyer_uid; new.seller_uid := old.seller_uid;
  new.made_by := old.made_by; new.counter_of := old.counter_of;
  new.created_at := old.created_at; new.expires_at := old.expires_at;

  if old.state <> 'pending' then
    raise exception 'That offer has already been %', old.state using errcode = '55000';
  end if;
  if now() > old.expires_at and new.state <> 'expired' then
    raise exception 'That offer has expired' using errcode = '55000';
  end if;

  maker     := case old.made_by when 'seller' then old.seller_uid else old.buyer_uid end;
  responder := case old.made_by when 'seller' then old.buyer_uid  else old.seller_uid end;

  if auth.uid() = responder then
    if new.state = 'countered' then
      raise exception 'Use Counter to reply with a price' using errcode = '22023';
    end if;
    if new.state not in ('accepted', 'declined') then
      raise exception 'You can accept, decline or counter this offer' using errcode = '22023';
    end if;
  elsif auth.uid() = maker then
    if new.state <> 'withdrawn' then
      raise exception 'You can only withdraw an offer you made' using errcode = '22023';
    end if;
  else
    raise exception 'Not your offer' using errcode = '42501';
  end if;

  new.responded_at := now();
  return new;
end; $$;

create or replace function lili.guard_offer_insert()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce(current_setting('role', true), '') not in ('authenticated', 'anon') then return new; end if;
  new.created_at := now(); new.expires_at := now() + interval '48 hours'; new.responded_at := null;
  select shop_id into new.shop_id from public.lili_items where id = new.item_id;
  -- only lili_counter_offer may create a seller-made offer or a counter link
  if coalesce(current_setting('lili.counter', true), '') <> 'on' then
    new.made_by := 'buyer';
    new.counter_of := null;
  end if;
  return new;
end; $$;

create or replace function public.lili_counter_offer(p_offer uuid, p_amount numeric, p_message text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare me uuid := auth.uid(); o public.lili_offers; n public.lili_offers; v_status text;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 10000000 then
    raise exception 'Enter an amount' using errcode = '22023';
  end if;

  select * into o from public.lili_offers where id = p_offer for update;
  if not found then raise exception 'No such offer' using errcode = 'P0002'; end if;
  if me is distinct from (case o.made_by when 'seller' then o.buyer_uid else o.seller_uid end) then
    raise exception 'Only the person this offer was made to can counter it' using errcode = '42501';
  end if;
  if o.state <> 'pending' then
    raise exception 'That offer has already been %', o.state using errcode = '55000';
  end if;
  if now() > o.expires_at then
    raise exception 'That offer has expired' using errcode = '55000';
  end if;
  select status into v_status from public.lili_items where id = o.item_id;
  if v_status is distinct from 'live' then
    raise exception 'That piece is no longer for sale' using errcode = '55000';
  end if;

  update public.lili_offers set state = 'countered', responded_at = now() where id = o.id;

  perform set_config('lili.counter', 'on', true);
  insert into public.lili_offers (item_id, shop_id, buyer_uid, seller_uid, amount, currency,
                                  message, made_by, counter_of)
  values (o.item_id, o.shop_id, o.buyer_uid, o.seller_uid, p_amount, o.currency,
          left(nullif(btrim(coalesce(p_message, '')), ''), 500),
          case when me = o.seller_uid then 'seller' else 'buyer' end, o.id)
  returning * into n;
  perform set_config('lili.counter', 'off', true);

  return to_jsonb(n);
end; $$;
revoke all on function public.lili_counter_offer(uuid, numeric, text) from public, anon;
grant execute on function public.lili_counter_offer(uuid, numeric, text) to authenticated;

-- Tell the person who has to answer; when it is answered, tell the person who
-- made it. A counter is announced once, by the new offer, not twice.
create or replace function lili.notify_offer()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare item_title text; maker uuid; responder uuid; price text;
begin
  select coalesce(title, title_ar) into item_title from public.lili_items where id = new.item_id;
  maker     := case new.made_by when 'seller' then new.seller_uid else new.buyer_uid end;
  responder := case new.made_by when 'seller' then new.buyer_uid  else new.seller_uid end;
  price     := new.currency || ' ' || trim(to_char(new.amount, 'FM999,999,990'));

  if tg_op = 'INSERT' then
    insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
    values (responder, 'offer',
            case when new.made_by = 'seller' then 'Counter-offer: ' else 'New offer: ' end || price,
            coalesce(item_title, 'Your listing') ||
            case when new.message is not null and new.message <> ''
                 then ' — "' || left(new.message, 90) || '"' else '' end,
            'offer', new.id);
    return null;
  end if;

  if new.state <> old.state and new.state in ('accepted', 'declined') then
    insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
    values (maker, 'offer',
            case new.state when 'accepted' then 'Your offer was accepted'
                           else 'Your offer was declined' end,
            coalesce(item_title, 'A listing') || ' — ' || price,
            'offer', new.id);
  end if;
  return null;
end; $$;

create or replace function public.lili_expire_offers(p_limit integer default 500)
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare n int := 0;
begin
  with lapsed as (
    select id from public.lili_offers
     where state = 'pending' and expires_at is not null and expires_at < now()
     order by expires_at limit p_limit for update skip locked
  ), moved as (
    update public.lili_offers o set state = 'expired' from lapsed l where o.id = l.id
    returning o.id, o.item_id, case o.made_by when 'seller' then o.seller_uid else o.buyer_uid end as maker
  )
  insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
  select m.maker, 'offer', 'Your offer expired',
         'It was not answered within 48 hours. The piece may still be there — make another if you still want it.',
         'offer', m.id
    from moved m;
  get diagnostics n = row_count;
  return n;
end; $$;

-- The app's live feed listens for listing changes, but lili_items was never in
-- the realtime publication, so the feed never refreshed. Row-level security
-- still decides what each subscriber receives.
alter publication supabase_realtime add table public.lili_items;
