-- ─────────────────────────────────────────────────────────────────────────────
-- 36 · Reviews after a delivered order, and the order's personal data
--
-- Reviews were tied to an agreed meet (migration 16): no meet, no review. A
-- piece bought with Buy and sent by courier has no meet, so a buyer who waited
-- for a parcel could never say whether it came as described. Order reviews
-- follow the same rules — once per side, only the two people in the order,
-- double-blind until both have reviewed or 14 days have passed — and count in
-- the shop's rating alongside meet reviews.
--
-- Two gaps from migration 33, closed here:
--   · the data export left out orders, and the reviews written about them;
--   · erasing an account kept the buyer's delivery address on every order she
--     had placed, and every address was kept for good. An order is a financial
--     record and stays, de-identified; the address does not.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.lili_order_reviews (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.lili_orders(id) on delete cascade,
  reviewer_uid  uuid references auth.users(id) on delete set null,
  reviewee_uid  uuid references auth.users(id) on delete set null,
  shop_id       uuid references public.lili_shops(id) on delete set null,
  reviewee_role text not null check (reviewee_role in ('buyer', 'seller')),
  stars         smallint not null check (stars between 1 and 5),
  body          text check (body is null or char_length(body) <= 500),
  created_at    timestamptz not null default now(),
  unique (order_id, reviewer_uid)
);
create index if not exists lili_order_reviews_shop on public.lili_order_reviews (shop_id) where reviewee_role = 'seller';
create index if not exists lili_order_reviews_reviewer on public.lili_order_reviews (reviewer_uid);
create index if not exists lili_order_reviews_reviewee on public.lili_order_reviews (reviewee_uid);
alter table public.lili_order_reviews enable row level security;
-- read and written only through the functions below
revoke all on public.lili_order_reviews from anon, authenticated;

-- hidden until the other side has reviewed too, or the window has closed
create or replace function lili.order_review_visible(r public.lili_order_reviews)
returns boolean language sql stable set search_path to 'public', 'pg_temp'
as $$
  select exists (select 1 from public.lili_order_reviews o where o.order_id = r.order_id and o.id <> r.id)
      or coalesce((select o.completed_at + interval '14 days' < now() from public.lili_orders o where o.id = r.order_id), false);
$$;

create or replace function public.lili_leave_order_review(p_order uuid, p_stars integer, p_body text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare me uuid := auth.uid(); o public.lili_orders; other uuid; role text; shop uuid; body text;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into o from public.lili_orders where id = p_order;
  if not found or (me is distinct from o.buyer_uid and me is distinct from o.seller_uid) then
    raise exception 'only the buyer and the seller can review an order' using errcode = '42501';
  end if;
  if o.state <> 'completed' or o.completed_at is null then
    raise exception 'review once the order is complete' using errcode = '22023';
  end if;
  if now() > o.completed_at + interval '14 days' then
    raise exception 'reviews close 14 days after the order completes' using errcode = '22023';
  end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'choose one to five stars' using errcode = '22023';
  end if;
  if not public.lili_rate_ok('review', 20, interval '1 day') then
    raise exception 'too many reviews today' using errcode = '54000';
  end if;
  if me = o.buyer_uid then other := o.seller_uid; role := 'seller'; shop := o.shop_id;
  else other := o.buyer_uid; role := 'buyer'; shop := null; end if;
  body := nullif(btrim(coalesce(p_body, '')), '');
  begin
    insert into public.lili_order_reviews (order_id, reviewer_uid, reviewee_uid, shop_id, reviewee_role, stars, body)
    values (o.id, me, other, shop, role, p_stars, left(body, 500));
  exception when unique_violation then
    raise exception 'you have already reviewed this order' using errcode = '23505';
  end;
  return jsonb_build_object('ok', true,
    'visible', exists (select 1 from public.lili_order_reviews x where x.order_id = o.id and x.reviewer_uid is distinct from me));
end; $$;
revoke all on function public.lili_leave_order_review(uuid, integer, text) from public, anon;
grant execute on function public.lili_leave_order_review(uuid, integer, text) to authenticated, service_role;

-- the shop's rating and its reviews count both kinds; same shape as before
create or replace function public.lili_reputations()
returns table(shop_id uuid, rating numeric, reviews integer)
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  with all_reviews as (
    select r.shop_id, r.stars from public.lili_reviews r
     where r.reviewee_role = 'seller' and lili.review_visible(r)
    union all
    select q.shop_id, q.stars from public.lili_order_reviews q
     where q.reviewee_role = 'seller' and lili.order_review_visible(q)
  )
  select a.shop_id, round(avg(a.stars)::numeric, 1), count(*)::int
    from all_reviews a
    join public.lili_shops s on s.id = a.shop_id and s.status = 'active'
   group by a.shop_id;
$$;

create or replace function public.lili_shop_reviews(p_shop uuid, p_limit integer default 20)
returns table(stars smallint, body text, created_at timestamptz)
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select x.stars, x.body, x.created_at from (
    select r.stars, r.body, r.created_at from public.lili_reviews r
     where r.shop_id = p_shop and r.reviewee_role = 'seller' and lili.review_visible(r)
    union all
    select q.stars, q.body, q.created_at from public.lili_order_reviews q
     where q.shop_id = p_shop and q.reviewee_role = 'seller' and lili.order_review_visible(q)
  ) x
  order by x.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- each order says whether its review is open and whether she has written it
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
    'review_open', o.state = 'completed' and o.completed_at is not null and now() <= o.completed_at + interval '14 days',
    'reviewed', exists (select 1 from public.lili_order_reviews q where q.order_id = o.id and q.reviewer_uid = auth.uid()),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('item_id', oi.item_id, 'title', oi.title, 'price', oi.price)), '[]')
                from public.lili_order_items oi where oi.order_id = o.id)
  ) order by o.created_at desc), '[]'::jsonb)
  from public.lili_orders o
  where (p_as = 'buyer' and o.buyer_uid = auth.uid()) or (p_as = 'seller' and o.seller_uid = auth.uid());
$$;

-- ── the delivery address ────────────────────────────────────────────────────
-- Erasing the buyer's account sets buyer_uid to null (migration 33's foreign
-- key). The order stays, as the seller's and lili's record of a sale; the
-- name, phone and street go with her. The country stays: it decided the fee.
create or replace function lili.order_forget_address()
returns trigger language plpgsql set search_path to 'public', 'pg_temp'
as $$
begin
  if new.buyer_uid is null and old.buyer_uid is not null and new.ship_to is not null then
    new.ship_to := jsonb_build_object('country', new.ship_to ->> 'country');
  end if;
  return new;
end; $$;
revoke all on function lili.order_forget_address() from public, anon, authenticated;
create or replace trigger lili_order_forget_address before update of buyer_uid on public.lili_orders
  for each row execute function lili.order_forget_address();

-- …and nobody's address is kept for good: 120 days after an order ends (long
-- enough for a card dispute, which runs about four months) it is cut back to
-- the country, by the same job that runs the order clock.
create or replace function lili.orders_tick()
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare n_unpaid int; n_unshipped int; n_released int; n_forgotten int; r record;
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
  -- delivery addresses are kept 120 days after the order ends
  update public.lili_orders set ship_to = jsonb_build_object('country', ship_to ->> 'country')
   where ship_to is not null and ship_to ? 'line1'
     and state in ('completed', 'cancelled', 'refunded')
     and coalesce(completed_at, cancelled_at, updated_at) < now() - interval '120 days';
  get diagnostics n_forgotten = row_count;
  return jsonb_build_object('unpaid_cancelled', n_unpaid, 'unshipped_refunded', n_unshipped,
                            'auto_released', n_released, 'addresses_forgotten', n_forgotten);
end; $$;
revoke all on function lili.orders_tick() from public, anon, authenticated;

-- ── the data export ─────────────────────────────────────────────────────────
-- Adds her orders and the order reviews. As a buyer she gets her own delivery
-- address; as a seller she does not get the buyer's (that is the buyer's data,
-- not hers). Provider references stay in the database, as everywhere else.
create or replace function public.lili_export_me()
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare uid uuid := auth.uid(); out jsonb;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'generated_at', now(),
    'about', 'Everything lili holds about your account, from the database. Anything kept only on your phone is added to this file by the app.',
    'account', (select jsonb_build_object('id', u.id, 'email', u.email,
                        'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at)
                  from auth.users u where u.id = uid),
    'shop',    (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.lili_shops s where s.owner_uid = uid),
    'listings',(select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) from public.lili_items i where i.owner_uid = uid),
    'saved',   (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from public.lili_saves v where v.user_id = uid),
    'cart',    (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.lili_carts c where c.user_id = uid),
    'following',(select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from public.lili_follows f where f.user_id = uid),
    'saved_searches', (select coalesce(jsonb_agg(jsonb_build_object('query', ss.query, 'max_price', ss.max_price,
                            'category', ss.category, 'created_at', ss.created_at)), '[]'::jsonb)
                            from public.lili_saved_searches ss where ss.user_id = uid),
    'reviews_you_wrote', (select coalesce(jsonb_agg(jsonb_build_object('meet_id', r.meet_id, 'about', r.reviewee_role,
                            'stars', r.stars, 'body', r.body, 'created_at', r.created_at)), '[]'::jsonb)
                            from public.lili_reviews r where r.reviewer_uid = uid),
    'reviews_about_you', (select coalesce(jsonb_agg(jsonb_build_object('as', r.reviewee_role,
                            'stars', r.stars, 'body', r.body, 'created_at', r.created_at)), '[]'::jsonb)
                            from public.lili_reviews r where r.reviewee_uid = uid and lili.review_visible(r)),
    'orders', (select coalesce(jsonb_agg(jsonb_build_object(
                            'id', o.id, 'as', case when o.buyer_uid = uid then 'buyer' else 'seller' end,
                            'state', o.state, 'method', o.method, 'region', o.region,
                            'items_total', o.items_total, 'delivery_fee', o.delivery_fee, 'total', o.total,
                            'currency', o.currency, 'tracking', o.tracking,
                            'delivery_address', case when o.buyer_uid = uid then o.ship_to end,
                            'issue', o.issue, 'created_at', o.created_at, 'paid_at', o.paid_at,
                            'shipped_at', o.shipped_at, 'completed_at', o.completed_at,
                            'cancelled_at', o.cancelled_at, 'cancel_reason', o.cancel_reason,
                            'items', (select coalesce(jsonb_agg(jsonb_build_object('title', oi.title, 'price', oi.price)), '[]'::jsonb)
                                        from public.lili_order_items oi where oi.order_id = o.id))), '[]'::jsonb)
                        from public.lili_orders o where uid in (o.buyer_uid, o.seller_uid)),
    'order_reviews_you_wrote', (select coalesce(jsonb_agg(jsonb_build_object('order_id', q.order_id, 'about', q.reviewee_role,
                            'stars', q.stars, 'body', q.body, 'created_at', q.created_at)), '[]'::jsonb)
                            from public.lili_order_reviews q where q.reviewer_uid = uid),
    'order_reviews_about_you', (select coalesce(jsonb_agg(jsonb_build_object('as', q.reviewee_role,
                            'stars', q.stars, 'body', q.body, 'created_at', q.created_at)), '[]'::jsonb)
                            from public.lili_order_reviews q where q.reviewee_uid = uid and lili.order_review_visible(q)),
    'conversations', (select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
                        from public.lili_conversations k where uid in (k.buyer_uid, k.seller_uid)),
    'messages_you_sent', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
                        from public.lili_messages m where m.sender_uid = uid),
    'offers',  (select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
                        from public.lili_offers o where o.buyer_uid = uid or o.seller_uid = uid),
    'meets',   (select coalesce(jsonb_agg(to_jsonb(mt)), '[]'::jsonb)
                        from public.lili_meets mt
                       where mt.conversation_id in (select id from public.lili_conversations
                                                     where uid in (buyer_uid, seller_uid))),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb)
                        from public.lili_notifications n where n.user_id = uid),
    'devices_registered_for_notifications', (select coalesce(jsonb_agg(jsonb_build_object(
                            'platform', pt.platform, 'app_version', pt.app_version,
                            'registered_at', pt.created_at, 'last_seen', pt.last_seen,
                            'token', 'not included — see note')), '[]'::jsonb)
                        from public.lili_push_tokens pt where pt.user_id = uid),
    'note_about_device_tokens', 'The token itself is left out on purpose. It is the credential for sending a notification to your phone, and a copy of this file in an inbox would be a copy of that credential.',
    'analytics_events', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
                        from public.lili_events e where e.user_id = uid),
    'beta_invitation', (select coalesce(jsonb_agg(jsonb_build_object('code', iv.code, 'redeemed_at', iv.redeemed_at)), '[]'::jsonb)
                        from public.lili_invites iv where iv.redeemed_by = uid),
    'reports_you_filed', (select coalesce(jsonb_agg(jsonb_build_object(
                            'id', mc.id, 'kind', mc.kind, 'state', mc.state,
                            'reasons', mc.reasons, 'detail', mc.detail,
                            'decision', mc.decision, 'created_at', mc.created_at)), '[]'::jsonb)
                        from public.lili_moderation_cases mc where mc.reported_by = uid),
    'reports_about_your_listings', (select coalesce(jsonb_agg(jsonb_build_object(
                            'id', mc.id, 'kind', mc.kind, 'state', mc.state,
                            'reasons', mc.reasons, 'decision', mc.decision,
                            'created_at', mc.created_at)), '[]'::jsonb)
                        from public.lili_moderation_cases mc
                       where mc.reported_by is distinct from uid
                         and (mc.target_item_id in (select id from public.lili_items where owner_uid = uid)
                           or mc.shop_id in (select id from public.lili_shops where owner_uid = uid)))
  ) into out;
  return out;
end;
$function$;
