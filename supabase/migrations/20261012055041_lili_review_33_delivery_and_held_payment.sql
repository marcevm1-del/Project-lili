-- 33 · Delivery and held payment (Yaga-style), for the UAE and the GCC.
--
-- A seller chooses which ways a piece can reach a buyer: meet in person, or a
-- courier (Aramex, Emirates Post, SMSA Express, Quiqup same-day, DHL Express),
-- plus the parcel size and whether she bundles. The buyer pays the delivery fee.
--
-- Paying in the app: the buyer pays through the payment provider (Stripe
-- Connect), the money is held there, and it is released to the seller only when
-- the buyer confirms "Item received" — or automatically 14 days after the
-- seller ships with no problem reported. lili never holds the money itself.
-- Everything is built; `lili_settings.payments.enabled` stays false until the
-- provider account and keys exist, and lili_create_order refuses until then.
--
-- Clients never touch lili_orders directly: every read and every state change
-- goes through the functions below, which enforce who may do what, and when.

-- ── carriers and fees ───────────────────────────────────────────────────────
create table if not exists public.lili_delivery_rates (
  carrier    text not null check (carrier in ('aramex','emirates_post','smsa','quiqup','dhl')),
  size       text not null check (size in ('XS','S','M','L','XL')),
  region     text not null check (region in ('UAE','GCC')),
  fee        numeric not null check (fee >= 0 and fee <= 2000),
  -- false = lili's estimate of the carrier's retail rate; true once lili has
  -- confirmed it with the carrier. The app labels unconfirmed fees "estimated".
  confirmed  boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (carrier, size, region)
);
alter table public.lili_delivery_rates enable row level security;
create policy rates_read on public.lili_delivery_rates for select using (true);
revoke all on public.lili_delivery_rates from anon, authenticated;
grant select on public.lili_delivery_rates to anon, authenticated;

insert into public.lili_delivery_rates (carrier, size, region, fee) values
  ('aramex','XS','UAE',20),('aramex','S','UAE',25),('aramex','M','UAE',30),('aramex','L','UAE',40),('aramex','XL','UAE',55),
  ('aramex','XS','GCC',60),('aramex','S','GCC',75),('aramex','M','GCC',95),('aramex','L','GCC',130),('aramex','XL','GCC',180),
  ('emirates_post','XS','UAE',15),('emirates_post','S','UAE',20),('emirates_post','M','UAE',28),('emirates_post','L','UAE',35),('emirates_post','XL','UAE',50),
  ('smsa','XS','UAE',20),('smsa','S','UAE',25),('smsa','M','UAE',32),('smsa','L','UAE',40),('smsa','XL','UAE',55),
  ('smsa','XS','GCC',55),('smsa','S','GCC',70),('smsa','M','GCC',90),('smsa','L','GCC',120),('smsa','XL','GCC',170),
  ('quiqup','XS','UAE',25),('quiqup','S','UAE',25),('quiqup','M','UAE',30),('quiqup','L','UAE',35),('quiqup','XL','UAE',45),
  ('dhl','XS','UAE',30),('dhl','S','UAE',35),('dhl','M','UAE',45),('dhl','L','UAE',60),('dhl','XL','UAE',85),
  ('dhl','XS','GCC',120),('dhl','S','GCC',150),('dhl','M','GCC',200),('dhl','L','GCC',260),('dhl','XL','GCC',350)
on conflict (carrier, size, region) do nothing;

-- ── the seller's delivery choices on each listing ───────────────────────────
alter table public.lili_items
  add column if not exists delivery    text[]  not null default '{meet}',
  add column if not exists parcel_size text    not null default 'S',
  add column if not exists bundling    boolean not null default false;
alter table public.lili_items add constraint lili_items_delivery_check
  check (cardinality(delivery) between 1 and 6
         and delivery <@ array['meet','aramex','emirates_post','smsa','quiqup','dhl']);
alter table public.lili_items add constraint lili_items_parcel_size_check
  check (parcel_size in ('XS','S','M','L','XL'));
grant select (delivery, parcel_size, bundling) on public.lili_items to anon, authenticated;
grant insert (delivery, parcel_size, bundling), update (delivery, parcel_size, bundling)
  on public.lili_items to authenticated;

-- ── payment switch ──────────────────────────────────────────────────────────
insert into public.lili_settings (key, value)
values ('payments', '{"enabled": false, "provider": "stripe", "commission": false}')
on conflict (key) do nothing;

create or replace function public.lili_payments_enabled()
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp'
as $$ select coalesce((select (value ->> 'enabled')::boolean from public.lili_settings where key = 'payments'), false) $$;

-- ── orders ──────────────────────────────────────────────────────────────────
create table if not exists public.lili_orders (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid references public.lili_shops(id) on delete set null,
  buyer_uid     uuid references auth.users(id) on delete set null,
  seller_uid    uuid references auth.users(id) on delete set null,
  method        text not null check (method in ('meet','aramex','emirates_post','smsa','quiqup','dhl')),
  region        text not null default 'UAE' check (region in ('UAE','GCC')),
  parcel_size   text not null default 'S' check (parcel_size in ('XS','S','M','L','XL')),
  items_total   numeric not null check (items_total > 0),
  delivery_fee  numeric not null default 0 check (delivery_fee >= 0),
  total         numeric generated always as (items_total + delivery_fee) stored,
  currency      text not null default 'AED',
  state         text not null default 'awaiting_payment' check (state in
                  ('awaiting_payment','paid','shipped','completed','cancelled','refunded','disputed')),
  ship_to       jsonb,
  tracking      text check (tracking is null or length(tracking) <= 60),
  ship_by       timestamptz,
  release_at    timestamptz,
  paid_at       timestamptz, shipped_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 300),
  issue         jsonb,
  -- the provider's references and the money's own state; never shown to clients
  payment_ref   text,
  payout_ref    text,
  money_state   text not null default 'none' check (money_state in
                  ('none','held','payout_due','paid_out','refund_due','refunded','failed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create table if not exists public.lili_order_items (
  id       bigint generated always as identity primary key,
  order_id uuid not null references public.lili_orders(id) on delete cascade,
  item_id  uuid references public.lili_items(id) on delete set null,
  title    text,
  price    numeric not null check (price > 0)
);
create index if not exists lili_order_items_order on public.lili_order_items(order_id);
create index if not exists lili_order_items_item on public.lili_order_items(item_id);
create index if not exists lili_orders_buyer on public.lili_orders(buyer_uid);
create index if not exists lili_orders_seller on public.lili_orders(seller_uid);
create index if not exists lili_orders_shop on public.lili_orders(shop_id);
create index if not exists lili_orders_state on public.lili_orders(state);

alter table public.lili_orders enable row level security;
alter table public.lili_order_items enable row level security;
revoke all on public.lili_orders, public.lili_order_items from anon, authenticated;

-- the seller's payout account at the provider (Stripe Connect); server only
create table if not exists public.lili_payout_accounts (
  uid         uuid primary key references auth.users(id) on delete cascade,
  provider    text not null default 'stripe',
  account_ref text not null,
  ready       boolean not null default false,
  updated_at  timestamptz not null default now()
);
alter table public.lili_payout_accounts enable row level security;
revoke all on public.lili_payout_accounts from anon, authenticated;

-- notifications for order events; swallowed until the pending SQL adds the kind
create or replace function lili.notify_order(p_uid uuid, p_title text, p_body text, p_order uuid)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
begin
  if p_uid is null then return; end if;
  begin
    insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
    values (p_uid, 'order', p_title, p_body, 'order', p_order);
  exception when check_violation then null;   -- 'order' kind arrives with the pending SQL
  end;
end; $$;
revoke all on function lili.notify_order(uuid, text, text, uuid) from public, anon, authenticated;

-- ── what a buyer can choose for these pieces, and what it costs ─────────────
create or replace function public.lili_delivery_quote(p_items uuid[], p_region text default 'UAE')
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$
declare v_methods text[]; v_size text; v_out jsonb := '[]'::jsonb; m text; r record;
begin
  if p_region not in ('UAE','GCC') then raise exception 'Unknown region' using errcode = '22023'; end if;
  -- methods every piece allows; the largest parcel among them
  select array(select unnest(i.delivery) from public.lili_items i where i.id = p_items[1])
    into v_methods;
  for r in select delivery from public.lili_items where id = any(p_items) loop
    v_methods := array(select x from unnest(v_methods) x where x = any(r.delivery));
  end loop;
  -- one parcel for the bundle: the largest size among the pieces
  select u.s into v_size from unnest(array['XL','L','M','S','XS']) with ordinality u(s, o)
   where exists (select 1 from public.lili_items where id = any(p_items) and parcel_size = u.s)
   order by u.o limit 1;
  v_size := coalesce(v_size, 'S');
  foreach m in array coalesce(v_methods, '{}'::text[]) loop
    if m = 'meet' then
      if p_region = 'UAE' then
        v_out := v_out || jsonb_build_object('method', 'meet', 'fee', 0, 'confirmed', true, 'size', v_size);
      end if;
    else
      select fee, confirmed into r from public.lili_delivery_rates
       where carrier = m and size = v_size and region = p_region;
      if found then
        v_out := v_out || jsonb_build_object('method', m, 'fee', r.fee, 'confirmed', r.confirmed, 'size', v_size);
      end if;
    end if;
  end loop;
  return v_out;
end; $$;

-- ── a buyer starts an order (one piece, or a bundle from one shop) ──────────
create or replace function public.lili_create_order(p_items uuid[], p_method text, p_region text, p_ship_to jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare
  me uuid := auth.uid(); v_shop uuid; v_seller uuid; v_total numeric := 0; v_fee numeric := 0; v_shops int;
  v_quote jsonb; v_opt jsonb; v_order uuid; it record; v_size text;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'sign_in_required'); end if;
  if not public.lili_payments_enabled() then
    return jsonb_build_object('ok', false, 'reason', 'payments_off');
  end if;
  if coalesce(array_length(p_items, 1), 0) = 0 or array_length(p_items, 1) > 10 then
    raise exception 'Choose between one and ten pieces' using errcode = '22023';
  end if;
  if not public.lili_rate_ok('order.create', 10, interval '1 hour') then
    raise exception 'You have started several orders in the last hour. Try again later.' using errcode = '54000';
  end if;

  -- lock the pieces so two buyers can't buy the same one at once
  perform 1 from public.lili_items where id = any(p_items) for update;
  select count(distinct shop_id), min(shop_id::text)::uuid into v_shops, v_shop
    from public.lili_items where id = any(p_items);
  if v_shops <> 1 then raise exception 'A bundle has to come from one shop' using errcode = '22023'; end if;
  select owner_uid into v_seller from public.lili_shops where id = v_shop and status = 'active';
  if v_seller is null then raise exception 'This shop is not taking orders' using errcode = '55000'; end if;
  if v_seller = me then raise exception 'That''s your own shop' using errcode = '22023'; end if;
  if array_length(p_items, 1) > 1 and exists (select 1 from public.lili_items where id = any(p_items) and not bundling) then
    raise exception 'This seller doesn''t bundle all of these pieces' using errcode = '22023';
  end if;

  for it in select i.*, o.buyer_uid as res_buyer, o.amount as res_amount
              from public.lili_items i left join public.lili_offers o on o.id = i.reserved_offer
             where i.id = any(p_items) loop
    if it.status <> 'live' then raise exception 'One of these pieces is no longer available' using errcode = '55000'; end if;
    if it.reserved_offer is not null and it.res_buyer is distinct from me then
      raise exception 'One of these pieces is reserved for another buyer' using errcode = '55000';
    end if;
    if exists (select 1 from public.lili_order_items oi join public.lili_orders o on o.id = oi.order_id
                where oi.item_id = it.id and o.state in ('awaiting_payment','paid','shipped','disputed')) then
      raise exception 'Someone is already buying one of these pieces' using errcode = '55000';
    end if;
    v_total := v_total + case when it.reserved_offer is not null then it.res_amount else it.price end;
  end loop;

  v_quote := public.lili_delivery_quote(p_items, p_region);
  select x into v_opt from jsonb_array_elements(v_quote) x where x ->> 'method' = p_method;
  if v_opt is null then raise exception 'That delivery option isn''t offered for these pieces' using errcode = '22023'; end if;
  v_fee := (v_opt ->> 'fee')::numeric;
  v_size := v_opt ->> 'size';

  if p_method <> 'meet' then
    if p_ship_to is null or coalesce(btrim(p_ship_to ->> 'name'), '') = '' or coalesce(btrim(p_ship_to ->> 'phone'), '') = ''
       or coalesce(btrim(p_ship_to ->> 'line1'), '') = '' or coalesce(btrim(p_ship_to ->> 'city'), '') = ''
       or coalesce(btrim(p_ship_to ->> 'country'), '') = '' then
      raise exception 'Add the delivery name, phone, address, city and country' using errcode = '22023';
    end if;
    if length(p_ship_to::text) > 1200 then raise exception 'That address is too long' using errcode = '22023'; end if;
  end if;

  insert into public.lili_orders (shop_id, buyer_uid, seller_uid, method, region, parcel_size,
                                  items_total, delivery_fee, ship_to)
  values (v_shop, me, v_seller, p_method, p_region, v_size, v_total, v_fee,
          case when p_method = 'meet' then null else
            jsonb_build_object('name', left(btrim(p_ship_to ->> 'name'), 80), 'phone', left(btrim(p_ship_to ->> 'phone'), 30),
                               'line1', left(btrim(p_ship_to ->> 'line1'), 160), 'line2', left(btrim(coalesce(p_ship_to ->> 'line2', '')), 160),
                               'city', left(btrim(p_ship_to ->> 'city'), 60), 'country', left(btrim(p_ship_to ->> 'country'), 2)) end)
  returning id into v_order;
  insert into public.lili_order_items (order_id, item_id, title, price)
  select v_order, i.id, coalesce(i.title, i.title_ar),
         case when i.reserved_offer is not null then (select amount from public.lili_offers where id = i.reserved_offer) else i.price end
    from public.lili_items i where i.id = any(p_items);

  return jsonb_build_object('ok', true, 'order_id', v_order, 'total', v_total + v_fee, 'currency', 'AED');
end; $$;

-- ── the provider confirmed payment (called by the lili-payments function) ───
create or replace function public.lili_order_paid(p_order uuid, p_ref text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare o public.lili_orders%rowtype;
begin
  select * into o from public.lili_orders where id = p_order for update;
  if not found then raise exception 'No such order' using errcode = 'P0002'; end if;
  if o.state <> 'awaiting_payment' then return jsonb_build_object('ok', true, 'state', o.state); end if;
  update public.lili_orders
     set state = 'paid', money_state = 'held', payment_ref = p_ref, paid_at = now(),
         ship_by = now() + interval '4 days', updated_at = now()
   where id = p_order;
  update public.lili_items set status = 'sold'
   where id in (select item_id from public.lili_order_items where order_id = p_order);
  perform lili.notify_order(o.seller_uid, 'New order: ship it within 4 days',
    case when o.method = 'meet' then 'Paid and held. Arrange the handover in Messages.'
         else 'Paid and held. Book the courier and add the tracking number.' end, p_order);
  return jsonb_build_object('ok', true, 'state', 'paid');
end; $$;

-- ── the seller sends it (or hands it over) ──────────────────────────────────
create or replace function public.lili_order_shipped(p_order uuid, p_tracking text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare o public.lili_orders%rowtype; me uuid := auth.uid();
begin
  select * into o from public.lili_orders where id = p_order for update;
  if not found or o.seller_uid is distinct from me then raise exception 'Not your order' using errcode = '42501'; end if;
  if o.state <> 'paid' then raise exception 'This order isn''t waiting to be sent' using errcode = '55000'; end if;
  if o.method <> 'meet' and coalesce(btrim(p_tracking), '') = '' then
    raise exception 'Add the courier''s tracking number' using errcode = '22023';
  end if;
  update public.lili_orders
     set state = 'shipped', shipped_at = now(), tracking = nullif(left(btrim(coalesce(p_tracking, '')), 60), ''),
         release_at = now() + interval '14 days', updated_at = now()
   where id = p_order;
  perform lili.notify_order(o.buyer_uid,
    case when o.method = 'meet' then 'Handed over' else 'Your order is on its way' end,
    'When you have it, tap Item received so the seller is paid. Something wrong? Report it before then.', p_order);
  return jsonb_build_object('ok', true, 'state', 'shipped');
end; $$;

-- ── the buyer has it: release the money ─────────────────────────────────────
create or replace function public.lili_order_received(p_order uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare o public.lili_orders%rowtype; me uuid := auth.uid();
begin
  select * into o from public.lili_orders where id = p_order for update;
  if not found or o.buyer_uid is distinct from me then raise exception 'Not your order' using errcode = '42501'; end if;
  if o.state <> 'shipped' then raise exception 'This order isn''t on its way' using errcode = '55000'; end if;
  update public.lili_orders set state = 'completed', completed_at = now(), money_state = 'payout_due', updated_at = now()
   where id = p_order;
  perform lili.notify_order(o.seller_uid, 'Item received: payment released', 'The buyer confirmed. Your payout is on its way.', p_order);
  return jsonb_build_object('ok', true, 'state', 'completed');
end; $$;

-- ── the buyer reports a problem: the money stays held ───────────────────────
create or replace function public.lili_order_issue(p_order uuid, p_reason text, p_detail text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare o public.lili_orders%rowtype; me uuid := auth.uid();
begin
  select * into o from public.lili_orders where id = p_order for update;
  if not found or o.buyer_uid is distinct from me then raise exception 'Not your order' using errcode = '42501'; end if;
  if o.state not in ('paid','shipped') then raise exception 'This order can''t be disputed now' using errcode = '55000'; end if;
  if p_reason not in ('not_received','not_as_described','damaged','counterfeit','other') then
    raise exception 'Choose what went wrong' using errcode = '22023';
  end if;
  if coalesce(length(btrim(p_detail)), 0) < 10 then
    raise exception 'Tell us in a sentence or two what happened' using errcode = '22023';
  end if;
  update public.lili_orders set state = 'disputed', updated_at = now(),
         issue = jsonb_build_object('reason', p_reason, 'detail', left(btrim(p_detail), 2000), 'at', now())
   where id = p_order;
  perform lili.notify_order(o.seller_uid, 'The buyer reported a problem',
    'The payment stays held while lili looks into it. Reply in Messages.', p_order);
  return jsonb_build_object('ok', true, 'state', 'disputed');
end; $$;

-- ── cancelling ──────────────────────────────────────────────────────────────
create or replace function public.lili_cancel_order(p_order uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare o public.lili_orders%rowtype; me uuid := auth.uid();
begin
  select * into o from public.lili_orders where id = p_order for update;
  if not found or (me is distinct from o.buyer_uid and me is distinct from o.seller_uid) then
    raise exception 'Not your order' using errcode = '42501';
  end if;
  if o.state = 'awaiting_payment' then
    update public.lili_orders set state = 'cancelled', cancelled_at = now(), cancel_reason = left(p_reason, 300), updated_at = now()
     where id = p_order;
  elsif o.state = 'paid' and me = o.seller_uid then
    -- the seller can't send it: the buyer gets everything back
    update public.lili_orders set state = 'refunded', cancelled_at = now(), cancel_reason = left(p_reason, 300),
           money_state = 'refund_due', updated_at = now() where id = p_order;
    update public.lili_items set status = 'live'
     where id in (select item_id from public.lili_order_items where order_id = p_order) and status = 'sold';
    perform lili.notify_order(o.buyer_uid, 'The seller cancelled your order', 'Your full payment is being refunded.', p_order);
  else
    raise exception 'This order can''t be cancelled now' using errcode = '55000';
  end if;
  return jsonb_build_object('ok', true);
end; $$;

-- ── a moderator settles a dispute ───────────────────────────────────────────
create or replace function public.lili_resolve_order(p_order uuid, p_outcome text, p_reason text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare o public.lili_orders%rowtype;
begin
  if not public.lili_is_moderator() then raise exception 'Moderator access required' using errcode = '42501'; end if;
  if coalesce(length(btrim(p_reason)), 0) < 10 then
    raise exception 'A reason of at least 10 characters is required — both sides receive it' using errcode = '22023';
  end if;
  select * into o from public.lili_orders where id = p_order for update;
  if not found or o.state <> 'disputed' then raise exception 'This order isn''t in dispute' using errcode = '55000'; end if;
  if p_outcome = 'refund' then
    update public.lili_orders set state = 'refunded', money_state = 'refund_due', updated_at = now(),
           issue = issue || jsonb_build_object('outcome', 'refund', 'reason', btrim(p_reason), 'by', auth.uid(), 'decided_at', now())
     where id = p_order;
  elsif p_outcome = 'release' then
    update public.lili_orders set state = 'completed', completed_at = now(), money_state = 'payout_due', updated_at = now(),
           issue = issue || jsonb_build_object('outcome', 'release', 'reason', btrim(p_reason), 'by', auth.uid(), 'decided_at', now())
     where id = p_order;
  else
    raise exception 'Choose refund or release' using errcode = '22023';
  end if;
  perform lili.notify_order(o.buyer_uid, 'Your order problem was decided', btrim(p_reason), p_order);
  perform lili.notify_order(o.seller_uid, 'The order problem was decided', btrim(p_reason), p_order);
  insert into public.lili_audit (kind, actor_uid, subject, meta)
  values ('order.resolved', auth.uid(), p_order::text, jsonb_build_object('outcome', p_outcome));
  return jsonb_build_object('ok', true, 'outcome', p_outcome);
end; $$;

-- ── what happens on its own: the hourly tick ────────────────────────────────
create or replace function lili.orders_tick()
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare n_unpaid int; n_unshipped int; n_released int; r record;
begin
  -- an order nobody paid for within 30 minutes lets the pieces go
  update public.lili_orders set state = 'cancelled', cancelled_at = now(), cancel_reason = 'Not paid within 30 minutes', updated_at = now()
   where state = 'awaiting_payment' and created_at < now() - interval '30 minutes';
  get diagnostics n_unpaid = row_count;
  -- not sent in time: the buyer gets her money back and the pieces go back up
  n_unshipped := 0;
  for r in select * from public.lili_orders where state = 'paid' and ship_by < now() loop
    update public.lili_orders set state = 'refunded', cancelled_at = now(), cancel_reason = 'Not sent within 4 days',
           money_state = 'refund_due', updated_at = now() where id = r.id;
    update public.lili_items set status = 'live'
     where id in (select item_id from public.lili_order_items where order_id = r.id) and status = 'sold';
    perform lili.notify_order(r.buyer_uid, 'Your order was cancelled', 'The seller didn''t send it within 4 days. Your full payment is being refunded.', r.id);
    perform lili.notify_order(r.seller_uid, 'Order cancelled: not sent in time', 'The buyer has been refunded and the piece is back on sale.', r.id);
    n_unshipped := n_unshipped + 1;
  end loop;
  -- 14 days after sending with no problem reported, the seller is paid
  update public.lili_orders set state = 'completed', completed_at = now(), money_state = 'payout_due', updated_at = now()
   where state = 'shipped' and release_at < now();
  get diagnostics n_released = row_count;
  return jsonb_build_object('unpaid_cancelled', n_unpaid, 'unshipped_refunded', n_unshipped, 'auto_released', n_released);
end; $$;
revoke all on function lili.orders_tick() from public, anon, authenticated;
select cron.schedule('lili-orders-tick', '*/10 * * * *', 'select lili.orders_tick()');

-- ── reading orders ──────────────────────────────────────────────────────────
-- The seller sees the delivery address only while she needs it (paid → sent,
-- or in dispute). Provider references never leave the database.
create or replace function public.lili_my_orders(p_as text default 'buyer')
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'shop_id', o.shop_id, 'shop_name', (select name from public.lili_shops where id = o.shop_id),
    'role', p_as, 'method', o.method, 'region', o.region, 'parcel_size', o.parcel_size,
    'items_total', o.items_total, 'delivery_fee', o.delivery_fee, 'total', o.total, 'currency', o.currency,
    'state', o.state, 'money_state', o.money_state, 'tracking', o.tracking,
    'ship_by', o.ship_by, 'release_at', o.release_at, 'created_at', o.created_at, 'paid_at', o.paid_at,
    'shipped_at', o.shipped_at, 'completed_at', o.completed_at, 'cancelled_at', o.cancelled_at,
    'cancel_reason', o.cancel_reason, 'issue', o.issue,
    'ship_to', case when p_as = 'buyer' or o.state in ('paid','shipped','disputed') then o.ship_to end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('item_id', oi.item_id, 'title', oi.title, 'price', oi.price)), '[]')
                from public.lili_order_items oi where oi.order_id = o.id)
  ) order by o.created_at desc), '[]'::jsonb)
  from public.lili_orders o
  where (p_as = 'buyer' and o.buyer_uid = auth.uid()) or (p_as = 'seller' and o.seller_uid = auth.uid());
$$;

-- what the seller is owed, and whether she can be paid out yet
create or replace function public.lili_my_wallet()
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'held',     coalesce(sum(items_total + delivery_fee) filter (where money_state = 'held'), 0),
    'releasing',coalesce(sum(items_total + delivery_fee) filter (where money_state = 'payout_due'), 0),
    'paid_out', coalesce(sum(items_total + delivery_fee) filter (where money_state = 'paid_out'), 0),
    'currency', 'AED',
    'payout_ready', coalesce((select ready from public.lili_payout_accounts where uid = auth.uid()), false),
    'payout_connected', exists (select 1 from public.lili_payout_accounts where uid = auth.uid()),
    'payments_enabled', public.lili_payments_enabled())
  from public.lili_orders where seller_uid = auth.uid();
$$;

-- moderators: orders in dispute
create or replace function public.lili_order_disputes()
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
as $$
begin
  if not public.lili_is_moderator() then raise exception 'Moderator access required' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'shop_id', shop_id, 'method', method, 'total', total,
          'issue', issue, 'tracking', tracking, 'shipped_at', shipped_at) order by updated_at), '[]'::jsonb)
          from public.lili_orders where state = 'disputed');
end; $$;

-- ── the payment function's own calls (service role only) ────────────────────
create or replace function public.lili_payment_set_ref(p_order uuid, p_ref text)
returns void language sql security definer set search_path to 'public', 'pg_temp'
as $$ update public.lili_orders set payment_ref = p_ref, updated_at = now() where id = p_order and state = 'awaiting_payment' $$;

create or replace function public.lili_money_done(p_order uuid, p_state text, p_ref text default null)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
begin
  if p_state not in ('paid_out','refunded','failed') then raise exception 'bad state'; end if;
  update public.lili_orders set money_state = p_state, payout_ref = coalesce(p_ref, payout_ref), updated_at = now()
   where id = p_order;
end; $$;

create or replace function public.lili_set_payout_account(p_uid uuid, p_ref text, p_ready boolean)
returns void language sql security definer set search_path to 'public', 'pg_temp'
as $$
  insert into public.lili_payout_accounts (uid, account_ref, ready) values (p_uid, p_ref, p_ready)
  on conflict (uid) do update set account_ref = excluded.account_ref, ready = excluded.ready, updated_at = now();
$$;

-- grants: client-facing functions to signed-in users; provider plumbing to the service role only
revoke all on function public.lili_delivery_quote(uuid[], text) from public;
grant execute on function public.lili_delivery_quote(uuid[], text) to anon, authenticated;
revoke all on function public.lili_payments_enabled() from public;
grant execute on function public.lili_payments_enabled() to anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'public.lili_create_order(uuid[], text, text, jsonb)', 'public.lili_order_shipped(uuid, text)',
    'public.lili_order_received(uuid)', 'public.lili_order_issue(uuid, text, text)',
    'public.lili_cancel_order(uuid, text)', 'public.lili_resolve_order(uuid, text, text)',
    'public.lili_my_orders(text)', 'public.lili_my_wallet()', 'public.lili_order_disputes()']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array[
    'public.lili_order_paid(uuid, text)', 'public.lili_payment_set_ref(uuid, text)',
    'public.lili_money_done(uuid, text, text)', 'public.lili_set_payout_account(uuid, text, boolean)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
