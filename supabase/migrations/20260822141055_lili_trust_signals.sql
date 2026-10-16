-- ═══════════════════════════════════════════════════════════════════════════
--  TRUST SIGNALS
--
--  What makes a stranger's AED 12,000 bag feel safe is evidence, not a number
--  someone typed. Every figure here is COMPUTED from what actually happened and
--  cannot be set by the seller — there is no column to write to.
--
--  Two deliberate omissions:
--
--    · Strikes are not public. A moderation record shown on a public profile is
--      close to publishing an accusation, and a dismissed report would still
--      have left a mark. Enforcement belongs to moderation, not to the crowd.
--    · Response time is computed from message TIMESTAMPS only. No content, no
--      counterparty, nothing that could identify who she was talking to.
-- ═══════════════════════════════════════════════════════════════════════════

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
  -- How quickly she answers, from timestamps alone. The median rather than the
  -- mean, so one holiday does not define her.
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
         replies.median_min,
         coalesce(replies.n, 0)::int,
         -- "new" is honest and useful; a fabricated rating is neither
         (coalesce(listed.sold, 0) = 0 and (select created_at from s) > now() - interval '30 days')
  from listed, replies;
$$;

revoke all on function public.lili_shop_stats(uuid) from public;
grant execute on function public.lili_shop_stats(uuid) to anon, authenticated;

-- Sold is a real state, so the screening check must allow it.
alter table public.lili_items drop constraint if exists lili_items_status_check;
alter table public.lili_items add constraint lili_items_status_check
  check (status in ('pending','live','in_review','removed','sold'));
