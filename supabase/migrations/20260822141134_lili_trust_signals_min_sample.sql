-- A "median" over one or two replies is not a statistic, it is the timing of a
-- specific private conversation, readable by anyone who knows roughly when they
-- messaged her. Below a sample of three, the figure is withheld entirely rather
-- than published as an average of one.
create or replace function public.lili_shop_stats(p_shop uuid)
returns table (
  shop_id uuid, live_listings int, sold_count int, member_since timestamptz,
  followers int, median_reply_minutes int, replies_measured int, is_new boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with s as (select * from public.lili_shops where id = p_shop),
  listed as (
    select count(*) filter (where status = 'live') as live,
           count(*) filter (where status = 'sold') as sold
      from public.lili_items where shop_id = p_shop
  ),
  replies as (
    select percentile_cont(0.5) within group (
             order by extract(epoch from (m.created_at - prev.created_at)) / 60
           )::int as median_min,
           count(*) as n
      from public.lili_messages m
      join public.lili_conversations c on c.id = m.conversation_id
      join lateral (
        select created_at from public.lili_messages p
         where p.conversation_id = m.conversation_id
           and p.created_at < m.created_at
           and p.sender_uid <> m.sender_uid
         order by p.created_at desc limit 1
      ) prev on true
     where c.shop_id = p_shop
       and m.sender_uid = (select owner_uid from s)
       and m.created_at - prev.created_at < interval '7 days'
  )
  select (select id from s),
         coalesce(listed.live, 0)::int,
         coalesce(listed.sold, 0)::int,
         (select created_at from s),
         (select followers from s),
         case when coalesce(replies.n,0) >= 3 then replies.median_min else null end,
         coalesce(replies.n, 0)::int,
         (coalesce(listed.sold, 0) = 0 and (select created_at from s) > now() - interval '30 days')
  from listed, replies;
$$;
revoke all on function public.lili_shop_stats(uuid) from public;
grant execute on function public.lili_shop_stats(uuid) to anon, authenticated;
