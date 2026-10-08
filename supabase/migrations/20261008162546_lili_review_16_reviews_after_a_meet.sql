-- Reviews after a meet: the reputation every comparable marketplace has and
-- lili did not. Modelled on two-way reviews (Vinted) with a double-blind
-- reveal (Airbnb), so neither side can wait and retaliate.
--
-- * Either person in a conversation may rate the other once per meet, from the
--   agreed time until 14 days after it. A meet that was only proposed,
--   declined or cancelled cannot be reviewed: no meet, no review.
-- * A review is shown only when both have reviewed, or once the 14 days are
--   over. Until then not even the person reviewed can read it.
-- * The person who wrote it is never shown, only "a buyer" / "a seller".
-- * The table is not readable or writable directly; everything goes through
--   the functions below.

create table if not exists public.lili_reviews (
  id            uuid primary key default gen_random_uuid(),
  meet_id       uuid not null references public.lili_meets(id) on delete cascade,
  reviewer_uid  uuid references auth.users(id) on delete set null,
  reviewee_uid  uuid references auth.users(id) on delete set null,
  shop_id       uuid references public.lili_shops(id) on delete set null,
  reviewee_role text not null check (reviewee_role in ('buyer', 'seller')),
  stars         smallint not null check (stars between 1 and 5),
  body          text check (body is null or char_length(body) <= 500),
  created_at    timestamptz not null default now(),
  unique (meet_id, reviewer_uid)
);
create index if not exists lili_reviews_shop_idx on public.lili_reviews (shop_id) where reviewee_role = 'seller';
create index if not exists lili_reviews_reviewee_idx on public.lili_reviews (reviewee_uid);
create index if not exists lili_reviews_reviewer_idx on public.lili_reviews (reviewer_uid);
alter table public.lili_reviews enable row level security;
revoke all on public.lili_reviews from anon, authenticated;

-- Shown once both sides have spoken, or the window for the other has closed.
create or replace function lili.review_visible(r public.lili_reviews)
returns boolean language sql stable set search_path to 'public', 'pg_temp'
as $$
  select exists (select 1 from public.lili_reviews o
                  where o.meet_id = r.meet_id and o.id <> r.id)
      or (select m.meet_at + interval '14 days' < now() from public.lili_meets m where m.id = r.meet_id);
$$;
revoke all on function lili.review_visible(public.lili_reviews) from public, anon, authenticated;

create or replace function public.lili_leave_review(p_meet uuid, p_stars int, p_body text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare me uuid := auth.uid(); m public.lili_meets; c public.lili_conversations;
        other uuid; role text; shop uuid; body text;
begin
  if me is null then raise exception 'sign in first' using errcode = '42501'; end if;
  select * into m from public.lili_meets where id = p_meet;
  if not found then raise exception 'no such meet' using errcode = 'P0002'; end if;
  select * into c from public.lili_conversations where id = m.conversation_id;
  if me is distinct from c.buyer_uid and me is distinct from c.seller_uid then
    raise exception 'only the two people who met can review it' using errcode = '42501';
  end if;
  if m.state not in ('confirmed', 'done') then
    raise exception 'only a meet you both agreed can be reviewed' using errcode = '22023';
  end if;
  if m.meet_at > now() then
    raise exception 'review after you have met' using errcode = '22023';
  end if;
  if now() > m.meet_at + interval '14 days' then
    raise exception 'reviews close 14 days after the meet' using errcode = '22023';
  end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    raise exception 'choose one to five stars' using errcode = '22023';
  end if;
  if not public.lili_rate_ok('review', 20, interval '1 day') then
    raise exception 'too many reviews today' using errcode = '54000';
  end if;

  if me = c.buyer_uid then
    other := c.seller_uid; role := 'seller';
    shop := coalesce(c.shop_id, (select i.shop_id from public.lili_items i where i.id = coalesce(m.item_id, c.item_id)));
  else
    other := c.buyer_uid; role := 'buyer'; shop := null;
  end if;
  body := nullif(btrim(coalesce(p_body, '')), '');

  begin
    insert into public.lili_reviews (meet_id, reviewer_uid, reviewee_uid, shop_id, reviewee_role, stars, body)
    values (m.id, me, other, shop, role, p_stars, left(body, 500));
  exception when unique_violation then
    raise exception 'you have already reviewed this meet' using errcode = '23505';
  end;

  -- a review is the clearest sign the meet happened
  if m.state = 'confirmed' then
    update public.lili_meets set state = 'done' where id = m.id;
  end if;
  return jsonb_build_object('ok', true,
    'visible', exists (select 1 from public.lili_reviews o where o.meet_id = m.id and o.reviewer_uid is distinct from me));
end; $$;

-- Meets the caller can still review, newest first.
create or replace function public.lili_reviews_owed()
returns table (meet_id uuid, meet_at timestamptz, item_id uuid, item_title text,
               other_role text, closes_at timestamptz)
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select m.id, m.meet_at, coalesce(m.item_id, c.item_id), i.title,
         case when c.buyer_uid = auth.uid() then 'seller' else 'buyer' end,
         m.meet_at + interval '14 days'
    from public.lili_meets m
    join public.lili_conversations c on c.id = m.conversation_id
    left join public.lili_items i on i.id = coalesce(m.item_id, c.item_id)
   where auth.uid() in (c.buyer_uid, c.seller_uid)
     and m.state in ('confirmed', 'done')
     and m.meet_at <= now() and m.meet_at > now() - interval '14 days'
     and not exists (select 1 from public.lili_reviews r where r.meet_id = m.id and r.reviewer_uid = auth.uid())
   order by m.meet_at desc
   limit 20;
$$;

-- A shop's visible reviews, without who wrote them.
create or replace function public.lili_shop_reviews(p_shop uuid, p_limit int default 20)
returns table (stars smallint, body text, created_at timestamptz)
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select r.stars, r.body, r.created_at
    from public.lili_reviews r
   where r.shop_id = p_shop and r.reviewee_role = 'seller' and lili.review_visible(r)
   order by r.created_at desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

-- Every shop's reputation in one read, for the feed and the shop pages.
create or replace function public.lili_reputations()
returns table (shop_id uuid, rating numeric, reviews int)
language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select r.shop_id, round(avg(r.stars)::numeric, 1), count(*)::int
    from public.lili_reviews r
    join public.lili_shops s on s.id = r.shop_id and s.status = 'active'
   where r.reviewee_role = 'seller' and lili.review_visible(r)
   group by r.shop_id;
$$;

revoke all on function public.lili_leave_review(uuid, int, text) from public, anon;
revoke all on function public.lili_reviews_owed() from public, anon;
revoke all on function public.lili_shop_reviews(uuid, int) from public;
revoke all on function public.lili_reputations() from public;
grant execute on function public.lili_leave_review(uuid, int, text) to authenticated;
grant execute on function public.lili_reviews_owed() to authenticated;
grant execute on function public.lili_shop_reviews(uuid, int) to anon, authenticated;
grant execute on function public.lili_reputations() to anon, authenticated;
