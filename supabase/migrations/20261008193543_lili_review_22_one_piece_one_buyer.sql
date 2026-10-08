-- One piece, one buyer. Accepting an offer reserved nothing: a seller could
-- accept two buyers' offers on the same piece (reproduced in the audit) and
-- the piece stayed live and kept taking offers.
--
-- * At most one accepted offer per item (unique index, so two simultaneous
--   accepts cannot both succeed).
-- * Accepting reserves the piece (lili_items.reserved_offer) and declines the
--   other open offers on it; their buyers are told.
-- * A reserved piece takes no new offers and cannot be accepted again.
-- * Either side can release the reservation (lili_release_reservation): the
--   seller declines it, the buyer withdraws. Marking sold or relisting clears it.
-- * Clients cannot write reserved_offer (no column grant; reset on insert).

alter table public.lili_items
  add column if not exists reserved_offer uuid references public.lili_offers(id) on delete set null;

create unique index if not exists lili_offers_one_accepted
  on public.lili_offers (item_id) where state = 'accepted';

-- clients may never set a reservation themselves
create or replace function lili.guard_item_columns()
returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $$
begin
  if current_user in ('postgres', 'service_role') then return new; end if;
  if tg_op = 'INSERT' then
    new.authenticated := false; new.saves := 0;
    new.previous_price := null; new.price_changed_at := null; new.created_at := now();
    new.reserved_offer := null;
  else
    new.authenticated := old.authenticated; new.shop_id := old.shop_id;
    new.reserved_offer := old.reserved_offer;
  end if;
  return new;
end; $$;

-- answering an offer: accepting needs a live, unreserved piece
create or replace function lili.guard_offer()
returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $$
declare maker uuid; responder uuid; v_status text; v_reserved uuid;
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
    if new.state = 'accepted' then
      select status, reserved_offer into v_status, v_reserved from public.lili_items where id = old.item_id;
      if v_status is distinct from 'live' then
        raise exception 'This piece is no longer for sale' using errcode = '55000';
      end if;
      if v_reserved is not null then
        raise exception 'This piece is already reserved for another buyer' using errcode = '55000';
      end if;
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

-- new offers: only on a live piece that is not reserved
create or replace function lili.guard_offer_insert()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare v_status text; v_reserved uuid;
begin
  if coalesce(current_setting('role', true), '') not in ('authenticated', 'anon') then return new; end if;
  new.created_at := now(); new.expires_at := now() + interval '48 hours'; new.responded_at := null;
  select shop_id, status, reserved_offer into new.shop_id, v_status, v_reserved
    from public.lili_items where id = new.item_id;
  if v_status is distinct from 'live' then
    raise exception 'This piece is no longer for sale' using errcode = '55000';
  end if;
  if v_reserved is not null then
    raise exception 'This piece is reserved for another buyer' using errcode = '55000';
  end if;
  -- only lili_counter_offer may create a seller-made offer or a counter link
  if coalesce(current_setting('lili.counter', true), '') <> 'on' then
    new.made_by := 'buyer';
    new.counter_of := null;
  end if;
  return new;
end; $$;

-- on acceptance: reserve the piece, decline the rival offers
create or replace function lili.reserve_on_accept()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
begin
  if new.state = 'accepted' and old.state is distinct from 'accepted' then
    update public.lili_items set reserved_offer = new.id where id = new.item_id;
    update public.lili_offers
       set state = 'declined', responded_at = now()
     where item_id = new.item_id and state = 'pending' and id <> new.id;
  end if;
  return null;
end; $$;
revoke all on function lili.reserve_on_accept() from public, anon, authenticated;

create or replace trigger reserve_on_accept
  after update of state on public.lili_offers
  for each row when (new.state = 'accepted') execute function lili.reserve_on_accept();

-- the notification says what happened to an accepted offer that was released
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

  if old.state = 'accepted' and new.state in ('declined', 'withdrawn') then
    -- a reservation released: tell whoever did not release it
    insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
    values (case new.state when 'declined' then new.buyer_uid else new.seller_uid end, 'offer',
            case new.state when 'declined' then 'The seller released your reservation'
                           else 'The buyer cancelled the reservation' end,
            coalesce(item_title, 'A listing') || ' — ' || price || ' · it is for sale again',
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

-- either side ends a reservation
create or replace function public.lili_release_reservation(p_item uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare me uuid := auth.uid(); o public.lili_offers;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select o2.* into o from public.lili_items i join public.lili_offers o2 on o2.id = i.reserved_offer
   where i.id = p_item for update of i;
  if not found then raise exception 'That piece is not reserved' using errcode = '22023'; end if;
  if me = o.seller_uid then
    update public.lili_offers set state = 'declined', responded_at = now() where id = o.id;
  elsif me = o.buyer_uid then
    update public.lili_offers set state = 'withdrawn', responded_at = now() where id = o.id;
  else
    raise exception 'Not your reservation' using errcode = '42501';
  end if;
  update public.lili_items set reserved_offer = null where id = p_item;
  return jsonb_build_object('ok', true);
end; $$;
revoke all on function public.lili_release_reservation(uuid) from public, anon;
grant execute on function public.lili_release_reservation(uuid) to authenticated;

-- marking sold or relisting ends any reservation
create or replace function public.lili_mark_sold(p_item uuid, p_sold boolean default true)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare me uuid := auth.uid(); v_status text; v_verdict text; v_new text; n_declined int := 0;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select status, screening ->> 'verdict' into v_status, v_verdict
    from public.lili_items where id = p_item and owner_uid = me for update;
  if not found then raise exception 'That listing is not yours' using errcode = '42501'; end if;

  if p_sold then
    if v_status <> 'live' then
      raise exception 'Only a live listing can be marked sold' using errcode = '22023';
    end if;
    update public.lili_items set status = 'sold', reserved_offer = null where id = p_item;
    update public.lili_offers
       set state = case when expires_at < now() then 'expired' else 'declined' end,
           responded_at = now()
     where item_id = p_item and state = 'pending';
    get diagnostics n_declined = row_count;
    v_new := 'sold';
  else
    if v_status <> 'sold' then
      raise exception 'Only a sold listing can be relisted' using errcode = '22023';
    end if;
    v_new := case v_verdict when 'removed' then 'removed'
                            when 'in_review' then 'in_review' else 'live' end;
    update public.lili_items set status = v_new, reserved_offer = null where id = p_item;
  end if;

  return jsonb_build_object('ok', true, 'status', v_new, 'offers_declined', n_declined);
end; $$;
