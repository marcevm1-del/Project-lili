-- The funnel, as questions rather than rows.
--
-- lili_events collects; nothing read it. These views are the reading, and they
-- live here rather than in a script so the definition of "reached the first
-- listing" is one thing rather than one per query.
--
-- All of them are service-role only. lili_events has no SELECT policy for any
-- client role and these inherit that: a view does not grant what the table
-- refuses. Analytics is for finding broken funnels, not for looking at a named
-- woman's evening, and nothing here can be reached from a handset.

-- ── the funnel itself ──────────────────────────────────────────────────────
--
-- Counted by SESSION, not by user. A funnel counted by user answers "how many
-- people ever listed", which rises forever and never tells you whether last
-- week's change helped. A session is one attempt at the thing.
create or replace view public.lili_funnel as
with s as (
  select session_id,
         min(created_at) as started,
         max(app_version) as app_version,
         bool_or(name = 'app_open')     as opened,
         bool_or(name = 'screen')       as browsed,
         bool_or(name = 'search')       as searched,
         bool_or(name = 'item_opened')  as opened_item,
         bool_or(name = 'item_saved')   as saved,
         bool_or(name = 'sell_started') as started_selling,
         bool_or(name = 'listing_live') as listed,
         bool_or(name = 'message_sent') as messaged,
         bool_or(name = 'offer_made')   as offered
    from public.lili_events
   group by session_id
)
select date_trunc('day', started)::date as day,
       app_version,
       count(*)                                             as sessions,
       count(*) filter (where browsed)                      as browsed,
       count(*) filter (where searched)                     as searched,
       count(*) filter (where opened_item)                  as opened_a_listing,
       count(*) filter (where saved)                        as saved_something,
       count(*) filter (where started_selling)              as started_selling,
       count(*) filter (where listed)                       as listed_something,
       count(*) filter (where messaged)                     as messaged,
       count(*) filter (where offered)                      as made_an_offer
  from s
 group by 1, 2
 order by 1 desc;

-- ── where a seller stops ───────────────────────────────────────────────────
--
-- The wizard reports the step she reached; this is how far each attempt got.
-- The drop between "reached step 3" and "listed" is the price screen, which is
-- where a seller finds out what she will be charged.
create or replace view public.lili_sell_dropoff as
with attempts as (
  select session_id,
         max((props->>'step')::int) filter (where name = 'sell_step') as furthest_step,
         bool_or(name = 'listing_live') as listed,
         count(*) filter (where name = 'sell_blocked') as warnings,
         min(created_at) as started
    from public.lili_events
   where name in ('sell_started','sell_step','sell_blocked','listing_live')
   group by session_id
  having bool_or(name = 'sell_started')
)
select coalesce(furthest_step, 1) as furthest_step,
       count(*)                      as attempts,
       count(*) filter (where listed) as published,
       round(100.0 * count(*) filter (where listed) / nullif(count(*), 0), 1) as pct_published,
       sum(warnings)                 as warnings_shown
  from attempts
 group by 1
 order by 1;

-- ── what people looked for and did not find ────────────────────────────────
--
-- The single most actionable thing a catalogue this small can collect: a
-- shopping list written by the people who wanted to buy. Only terms that passed
-- the client-side rule are here at all — no digits, no "@", 40 characters —
-- so this cannot become a log of what somebody typed about herself.
create or replace view public.lili_missing_demand as
select props->>'term'                     as term,
       count(*)                           as times,
       count(distinct session_id)         as people,
       max(created_at)                    as last_asked
  from public.lili_events
 where name = 'search_empty'
   and coalesce(props->>'term','') <> ''
 group by 1
 order by 3 desc, 2 desc;

-- ── did the recovery work ──────────────────────────────────────────────────
create or replace view public.lili_search_health as
select date_trunc('day', created_at)::date as day,
       count(*) filter (where name = 'search')          as searches,
       count(*) filter (where name = 'search_empty')    as found_nothing,
       count(*) filter (where name = 'search_recover')  as took_a_suggestion,
       round(100.0 * count(*) filter (where name = 'search_empty')
             / nullif(count(*) filter (where name = 'search'), 0), 1) as pct_empty
  from public.lili_events
 where name in ('search','search_empty','search_recover')
 group by 1
 order by 1 desc;

-- ── the controls people actually use ───────────────────────────────────────
--
-- Sort and the filter sheet were decorative until v2.9. This is how we find out
-- whether they were worth making real, rather than assuming it.
create or replace view public.lili_control_use as
select name,
       props->>'sort'                  as sort_choice,
       (props->>'active')::int         as filters_active,
       count(*)                        as uses,
       count(distinct session_id)      as people
  from public.lili_events
 where name in ('filter_applied','sort_applied','search_recover')
 group by 1, 2, 3
 order by 4 desc;

-- ── where the app fell over ────────────────────────────────────────────────
create or replace view public.lili_errors as
select props->>'where' as place, app_version,
       count(*) as times, count(distinct session_id) as sessions,
       max(created_at) as last_seen
  from public.lili_events
 where name = 'app_error'
 group by 1, 2
 order by 3 desc;

-- Views inherit the table's RLS; say it explicitly anyway so a future grant on
-- the schema cannot quietly open them.
revoke all on public.lili_funnel, public.lili_sell_dropoff, public.lili_missing_demand,
               public.lili_search_health, public.lili_control_use, public.lili_errors
  from anon, authenticated;
