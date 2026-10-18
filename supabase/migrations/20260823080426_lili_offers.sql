-- ═══════════════════════════════════════════════════════════════════════════
--  OFFERS
--
--  Haggling is how this market actually buys. It was in the interface and
--  nowhere else: a buyer made an offer, and the seller never learned of it.
--
--  Everything that matters is decided here rather than trusted from a client —
--  who may offer, on what, for how much, and what an expired offer means.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.lili_offers (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.lili_items(id) on delete cascade,
  shop_id      uuid references public.lili_shops(id) on delete set null,
  buyer_uid    uuid not null references auth.users(id) on delete cascade,
  seller_uid   uuid not null references auth.users(id) on delete cascade,
  amount       numeric(12,2) not null check (amount > 0 and amount <= 10000000),
  currency     text not null default 'AED',
  message      text check (length(message) <= 500),
  state        text not null default 'pending'
               check (state in ('pending','accepted','declined','countered','withdrawn','expired')),
  counter_of   uuid references public.lili_offers(id) on delete set null,
  responded_at timestamptz,
  expires_at   timestamptz not null default now() + interval '48 hours',
  created_at   timestamptz not null default now(),
  constraint offer_parties_differ check (buyer_uid <> seller_uid)
);
create index if not exists lili_offers_item on public.lili_offers(item_id, state);
create index if not exists lili_offers_seller on public.lili_offers(seller_uid, state, created_at desc);
create index if not exists lili_offers_buyer on public.lili_offers(buyer_uid, created_at desc);

-- one live offer per buyer per item: haggling, not spamming
create unique index if not exists lili_offers_one_open
  on public.lili_offers (item_id, buyer_uid) where state = 'pending';

alter table public.lili_offers enable row level security;

-- Only the two parties. Not the shop's followers, not anyone browsing.
create policy offers_read on public.lili_offers for select
  using (buyer_uid = auth.uid() or seller_uid = auth.uid());

-- A buyer offers as herself, on a live listing that is not her own, and the
-- seller is taken from the ITEM — not from whatever the client sends.
create policy offers_create on public.lili_offers for insert
  with check (
    buyer_uid = auth.uid()
    and state = 'pending'
    and exists (
      select 1 from public.lili_items i
       where i.id = item_id
         and i.status = 'live'
         and i.owner_uid = seller_uid
         and i.owner_uid <> auth.uid())
  );

create policy offers_update on public.lili_offers for update
  using (buyer_uid = auth.uid() or seller_uid = auth.uid())
  with check (buyer_uid = auth.uid() or seller_uid = auth.uid());

-- ── what each party may actually change ────────────────────────────────────
create or replace function lili.guard_offer()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user in ('postgres','service_role') then return new; end if;

  -- money, parties and timing are fixed once made
  new.amount     := old.amount;
  new.item_id    := old.item_id;
  new.buyer_uid  := old.buyer_uid;
  new.seller_uid := old.seller_uid;
  new.created_at := old.created_at;
  new.expires_at := old.expires_at;

  if old.state <> 'pending' then
    raise exception 'That offer has already been %', old.state using errcode = '55000';
  end if;
  if now() > old.expires_at and new.state <> 'expired' then
    raise exception 'That offer has expired' using errcode = '55000';
  end if;

  -- the seller accepts or declines; the buyer may only withdraw
  if auth.uid() = old.seller_uid then
    if new.state not in ('accepted','declined','countered') then
      raise exception 'A seller can accept, decline or counter' using errcode = '22023';
    end if;
  elsif auth.uid() = old.buyer_uid then
    if new.state <> 'withdrawn' then
      raise exception 'A buyer can only withdraw her own offer' using errcode = '22023';
    end if;
  else
    raise exception 'Not your offer' using errcode = '42501';
  end if;

  new.responded_at := now();
  return new;
end; $$;

drop trigger if exists guard_offer on public.lili_offers;
create trigger guard_offer before update on public.lili_offers
  for each row execute function lili.guard_offer();

-- ── tell people ────────────────────────────────────────────────────────────
create or replace function lili.notify_offer()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare item_title text;
begin
  select coalesce(title, title_ar) into item_title from public.lili_items where id = new.item_id;

  if tg_op = 'INSERT' then
    insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
    values (new.seller_uid, 'message',
            'New offer: ' || new.currency || ' ' || trim(to_char(new.amount,'FM999,999,990')),
            coalesce(item_title,'Your listing') ||
            case when new.message is not null and new.message <> ''
                 then ' — "' || left(new.message, 90) || '"' else '' end,
            'item', new.item_id);
    return null;
  end if;

  if new.state <> old.state and new.state in ('accepted','declined','countered') then
    insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
    values (new.buyer_uid, 'message',
            case new.state
              when 'accepted'  then 'Your offer was accepted'
              when 'declined'  then 'Your offer was declined'
              else 'The seller made a counter-offer' end,
            coalesce(item_title,'A listing') || ' — ' || new.currency || ' ' ||
            trim(to_char(new.amount,'FM999,999,990')),
            'item', new.item_id);
  end if;
  return null;
end; $$;

drop trigger if exists notify_offer_ins on public.lili_offers;
create trigger notify_offer_ins after insert on public.lili_offers
  for each row execute function lili.notify_offer();
drop trigger if exists notify_offer_upd on public.lili_offers;
create trigger notify_offer_upd after update on public.lili_offers
  for each row execute function lili.notify_offer();

-- Expiry is a fact about time, not a job that must run. Anything past its date
-- reads as expired whether or not a cron ever fires.
create or replace function public.lili_offers_for_me()
returns table (
  id uuid, item_id uuid, shop_id uuid, buyer_uid uuid, seller_uid uuid,
  amount numeric, currency text, message text, state text,
  expires_at timestamptz, created_at timestamptz, role text)
language sql stable security invoker set search_path = public, pg_temp as $$
  select o.id, o.item_id, o.shop_id, o.buyer_uid, o.seller_uid, o.amount, o.currency,
         o.message,
         case when o.state = 'pending' and now() > o.expires_at then 'expired' else o.state end,
         o.expires_at, o.created_at,
         case when o.buyer_uid = auth.uid() then 'buyer' else 'seller' end
    from public.lili_offers o
   where o.buyer_uid = auth.uid() or o.seller_uid = auth.uid()
   order by o.created_at desc
   limit 200;
$$;

grant select, insert, update on public.lili_offers to authenticated;
revoke all on public.lili_offers from anon;
grant execute on function public.lili_offers_for_me() to authenticated;
