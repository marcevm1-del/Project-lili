-- The funnel could not answer "do Arabic users drop off where English users
-- don't", and would not have been able to after launch week either. Every
-- number collected would have been an average across two materially different
-- experiences, one of which is broken.
--
-- A two-letter language tag and a direction are not personal data by any
-- reading, and the scrub in funnel.js already permits short enum-shaped
-- strings, so this needs no change to the privacy rules.

alter table public.lili_events
  add column if not exists lang text,
  add column if not exists dir  text;

alter table public.lili_events drop constraint if exists lili_events_lang_len;
alter table public.lili_events add constraint lili_events_lang_len
  check (lang is null or char_length(lang) <= 8);
alter table public.lili_events drop constraint if exists lili_events_dir_ok;
alter table public.lili_events add constraint lili_events_dir_ok
  check (dir is null or dir in ('ltr','rtl'));

create index if not exists lili_events_lang on public.lili_events (lang, name);

-- The client may set them, like every other column it writes.
grant insert (session_id, name, props, app_version, lang, dir)
  on public.lili_events to authenticated;

-- The funnel, split by language. This is the whole point of the two columns:
-- one view that answers whether the Arabic experience is the same product.
create or replace view public.lili_funnel_by_language as
with s as (
  select session_id,
         coalesce(max(lang), 'unknown') as lang,
         coalesce(max(dir), 'ltr')      as dir,
         bool_or(name = 'screen')       as browsed,
         bool_or(name = 'search')       as searched,
         bool_or(name = 'item_opened')  as opened_item,
         bool_or(name = 'sell_started') as started_selling,
         bool_or(name = 'listing_live') as listed,
         bool_or(name = 'message_sent') as messaged
    from public.lili_events
   group by session_id
)
select lang, dir,
       count(*)                                as sessions,
       count(*) filter (where browsed)         as browsed,
       count(*) filter (where searched)        as searched,
       count(*) filter (where opened_item)     as opened_a_listing,
       count(*) filter (where started_selling) as started_selling,
       count(*) filter (where listed)          as listed_something,
       count(*) filter (where messaged)        as messaged,
       round(100.0 * count(*) filter (where opened_item)
             / nullif(count(*), 0), 1)         as pct_opened_a_listing,
       round(100.0 * count(*) filter (where listed)
             / nullif(count(*) filter (where started_selling), 0), 1) as pct_finished_listing
  from s
 group by 1, 2
 order by sessions desc;

revoke all on public.lili_funnel_by_language from anon, authenticated;
