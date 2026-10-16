-- "My reports" called the moderation queue with no filter.
--
-- For a moderator `serverQueue` is true, so `listQueue()` returned EVERY case
-- in the marketplace — other people's reports, other people's report text —
-- rendered under a heading that says "My reports".
--
-- And for everyone else it read the device queue, so a report filed on another
-- phone never appeared at all. The screen was wrong in both directions.
--
-- lili_moderation_list is the moderator's queue and deliberately does not
-- return reported_by; this is the other screen. Any signed-in person may call
-- it, and it can only ever return cases she filed herself.

create or replace function public.lili_my_cases()
returns table (id uuid, kind text, source text, target_item_id uuid, shop_id uuid,
               reasons text[], detail text, state text, sla_hours int,
               created_at timestamptz, decided_at timestamptz, decision jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.kind, c.source, c.target_item_id, c.shop_id,
         c.reasons, c.detail, c.state, c.sla_hours,
         c.created_at, c.decided_at, c.decision
    from public.lili_moderation_cases c
   where c.reported_by = auth.uid()
   order by c.created_at desc
   limit 200;
$$;

revoke all on function public.lili_my_cases() from public, anon;
grant execute on function public.lili_my_cases() to authenticated;
