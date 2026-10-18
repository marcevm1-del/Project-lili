-- ─────────────────────────────────────────────────────────────────────────────
-- 40 · A parcel sent and received in Messages, and the reviews that follow
--
-- With meeting in person removed (39) and paying in the app still switched off,
-- a sale is arranged in a conversation and goes by courier. Reviews came from
-- meets or from orders paid in the app, so none could be earned any more.
--
-- This restores the one record lili can vouch for without holding money: the
-- seller says she sent the piece, with the courier and the tracking number, and
-- the buyer says she has it. Then each can review the other once, within 14
-- days, double-blind, exactly like an order review (36).
--
--   lili_parcel_sent(conversation, carrier, tracking)   the seller in that thread
--   lili_parcel_received(parcel)                        the buyer, an hour or more later
--   lili_conversation_parcels(conversation)             either of them
--   lili_leave_parcel_review(parcel, stars, body)       either of them, once received
--
-- Nothing here is readable directly; every read and write goes through these.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.lili_parcels (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.lili_conversations(id) on delete cascade,
  item_id         uuid references public.lili_items(id) on delete set null,
  shop_id         uuid references public.lili_shops(id) on delete set null,
  seller_uid      uuid references auth.users(id) on delete set null,
  buyer_uid       uuid references auth.users(id) on delete set null,
  carrier         text not null check (carrier in ('aramex','emirates_post','smsa','quiqup','dhl')),
  tracking        text not null check (tracking ~ '^[A-Za-z0-9]{6,30}$'),
  sent_at         timestamptz not null default now(),
  received_at     timestamptz
);
-- one parcel on its way per conversation at a time
create unique index if not exists lili_parcels_one_open
  on public.lili_parcels (conversation_id) where received_at is null;
create index if not exists lili_parcels_conversation on public.lili_parcels (conversation_id);
create index if not exists lili_parcels_item on public.lili_parcels (item_id);
create index if not exists lili_parcels_shop on public.lili_parcels (shop_id);
create index if not exists lili_parcels_seller on public.lili_parcels (seller_uid);
create index if not exists lili_parcels_buyer on public.lili_parcels (buyer_uid);
alter table public.lili_parcels enable row level security;
revoke all on public.lili_parcels from public, anon, authenticated;

create table if not exists public.lili_parcel_reviews (
  id            uuid primary key default gen_random_uuid(),
  parcel_id     uuid references public.lili_parcels(id) on delete set null,
  reviewer_uid  uuid references auth.users(id) on delete set null,
  reviewee_uid  uuid references auth.users(id) on delete set null,
  shop_id       uuid references public.lili_shops(id) on delete set null,
  reviewee_role text not null check (reviewee_role in ('buyer','seller')),
  stars         smallint not null check (stars between 1 and 5),
  body          text check (body is null or char_length(body) <= 500),
  created_at    timestamptz not null default now(),
  unique (parcel_id, reviewer_uid)
);
create index if not exists lili_parcel_reviews_shop on public.lili_parcel_reviews (shop_id);
create index if not exists lili_parcel_reviews_reviewer on public.lili_parcel_reviews (reviewer_uid);
create index if not exists lili_parcel_reviews_reviewee on public.lili_parcel_reviews (reviewee_uid);
alter table public.lili_parcel_reviews enable row level security;
revoke all on public.lili_parcel_reviews from public, anon, authenticated;

-- shown once both have reviewed, or 14 days after the parcel arrived; a review
-- whose parcel record is gone (an erased conversation) stays as written
create or replace function lili.parcel_review_visible(r public.lili_parcel_reviews)
returns boolean language sql stable set search_path to 'public', 'pg_temp'
as $$
  select r.parcel_id is null
      or exists (select 1 from public.lili_parcel_reviews o where o.parcel_id = r.parcel_id and o.id <> r.id)
      or coalesce((select p.received_at + interval '14 days' < now() from public.lili_parcels p where p.id = r.parcel_id), false);
$$;

create or replace function public.lili_parcel_sent(p_conversation uuid, p_carrier text, p_tracking text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare me uuid := auth.uid(); c public.lili_conversations; v_id uuid; v_track text;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into c from public.lili_conversations where id = p_conversation;
  if not found or c.seller_uid is distinct from me then
    raise exception 'only the seller in this conversation can say she sent it' using errcode = '42501';
  end if;
  if c.buyer_uid is null then raise exception 'this conversation has ended' using errcode = '55000'; end if;
  v_track := upper(regexp_replace(coalesce(p_tracking, ''), '\s', '', 'g'));
  if v_track !~ '^[A-Z0-9]{6,30}$' then
    raise exception 'add the courier''s tracking number' using errcode = '22023';
  end if;
  if p_carrier is null or p_carrier not in ('aramex','emirates_post','smsa','quiqup','dhl') then
    raise exception 'choose the courier' using errcode = '22023';
  end if;
  if not public.lili_rate_ok('parcel', 30, interval '1 day') then
    raise exception 'too many parcels today' using errcode = '54000';
  end if;
  begin
    insert into public.lili_parcels (conversation_id, item_id, shop_id, seller_uid, buyer_uid, carrier, tracking)
    values (c.id, c.item_id, c.shop_id, c.seller_uid, c.buyer_uid, p_carrier, v_track)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'a parcel in this conversation is still on its way' using errcode = '23505';
  end;
  return jsonb_build_object('ok', true, 'parcel_id', v_id);
end; $$;

create or replace function public.lili_parcel_received(p_parcel uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare me uuid := auth.uid(); p public.lili_parcels;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into p from public.lili_parcels where id = p_parcel for update;
  if not found or p.buyer_uid is distinct from me then
    raise exception 'only the buyer can say it arrived' using errcode = '42501';
  end if;
  if p.received_at is not null then return jsonb_build_object('ok', true, 'already', true); end if;
  if now() < p.sent_at + interval '1 hour' then
    raise exception 'confirm once the parcel has reached you' using errcode = '55000';
  end if;
  update public.lili_parcels set received_at = now() where id = p.id;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.lili_conversation_parcels(p_conversation uuid)
returns table(id uuid, carrier text, tracking text, sent_at timestamptz, received_at timestamptz,
              you_are text, review_open boolean, reviewed boolean)
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select p.id, p.carrier, p.tracking, p.sent_at, p.received_at,
         case when p.seller_uid = auth.uid() then 'seller' else 'buyer' end,
         p.received_at is not null and now() <= p.received_at + interval '14 days',
         exists (select 1 from public.lili_parcel_reviews r where r.parcel_id = p.id and r.reviewer_uid = auth.uid())
    from public.lili_parcels p
   where p.conversation_id = p_conversation
     and auth.uid() is not null and auth.uid() in (p.seller_uid, p.buyer_uid)
   order by p.sent_at desc
   limit 10;
$$;

create or replace function public.lili_leave_parcel_review(p_parcel uuid, p_stars integer, p_body text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare me uuid := auth.uid(); p public.lili_parcels; other uuid; role text; shop uuid; body text;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into p from public.lili_parcels where id = p_parcel;
  if not found or (me is distinct from p.buyer_uid and me is distinct from p.seller_uid) then
    raise exception 'only the buyer and the seller can review this' using errcode = '42501';
  end if;
  if p.received_at is null then
    raise exception 'review once the buyer has it' using errcode = '22023';
  end if;
  if now() > p.received_at + interval '14 days' then
    raise exception 'reviews close 14 days after it arrived' using errcode = '22023';
  end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'choose one to five stars' using errcode = '22023';
  end if;
  if not public.lili_rate_ok('review', 20, interval '1 day') then
    raise exception 'too many reviews today' using errcode = '54000';
  end if;
  if me = p.buyer_uid then other := p.seller_uid; role := 'seller'; shop := p.shop_id;
  else other := p.buyer_uid; role := 'buyer'; shop := null; end if;
  body := nullif(btrim(coalesce(p_body, '')), '');
  begin
    insert into public.lili_parcel_reviews (parcel_id, reviewer_uid, reviewee_uid, shop_id, reviewee_role, stars, body)
    values (p.id, me, other, shop, role, p_stars, left(body, 500));
  exception when unique_violation then
    raise exception 'you have already reviewed this' using errcode = '23505';
  end;
  return jsonb_build_object('ok', true,
    'visible', exists (select 1 from public.lili_parcel_reviews x where x.parcel_id = p.id and x.reviewer_uid is distinct from me));
end; $$;

revoke all on function public.lili_parcel_sent(uuid, text, text) from public, anon;
revoke all on function public.lili_parcel_received(uuid) from public, anon;
revoke all on function public.lili_conversation_parcels(uuid) from public, anon;
revoke all on function public.lili_leave_parcel_review(uuid, integer, text) from public, anon;
grant execute on function public.lili_parcel_sent(uuid, text, text) to authenticated, service_role;
grant execute on function public.lili_parcel_received(uuid) to authenticated, service_role;
grant execute on function public.lili_conversation_parcels(uuid) to authenticated, service_role;
grant execute on function public.lili_leave_parcel_review(uuid, integer, text) to authenticated, service_role;
revoke all on function lili.parcel_review_visible(public.lili_parcel_reviews) from public, anon, authenticated;

-- a shop's rating and its reviews count parcel reviews too
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
    union all
    select pr.shop_id, pr.stars from public.lili_parcel_reviews pr
     where pr.reviewee_role = 'seller' and lili.parcel_review_visible(pr)
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
    union all
    select pr.stars, pr.body, pr.created_at from public.lili_parcel_reviews pr
     where pr.shop_id = p_shop and pr.reviewee_role = 'seller' and lili.parcel_review_visible(pr)
  ) x
  order by x.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- her data export carries the parcels she sent or received and the parcel reviews
create or replace function lili.export_parcels(uid uuid)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'parcels', (select coalesce(jsonb_agg(jsonb_build_object(
                  'as', case when p.seller_uid = uid then 'seller' else 'buyer' end,
                  'carrier', p.carrier, 'tracking', p.tracking,
                  'sent_at', p.sent_at, 'received_at', p.received_at)), '[]'::jsonb)
                  from public.lili_parcels p where uid in (p.seller_uid, p.buyer_uid)),
    'parcel_reviews_you_wrote', (select coalesce(jsonb_agg(jsonb_build_object('about', r.reviewee_role,
                  'stars', r.stars, 'body', r.body, 'created_at', r.created_at)), '[]'::jsonb)
                  from public.lili_parcel_reviews r where r.reviewer_uid = uid),
    'parcel_reviews_about_you', (select coalesce(jsonb_agg(jsonb_build_object('as', r.reviewee_role,
                  'stars', r.stars, 'body', r.body, 'created_at', r.created_at)), '[]'::jsonb)
                  from public.lili_parcel_reviews r where r.reviewee_uid = uid and lili.parcel_review_visible(r)));
$$;
revoke all on function lili.export_parcels(uuid) from public, anon, authenticated;

-- (migration 36's body, returning the parcel keys as well)
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
  return out || lili.export_parcels(uid);
end;
$function$;
