-- The rest of the surfaces. None of these had any volume control at all.
--
-- The numbers are set where a real person never meets them and a script always
-- does. Every one of them should be read as "what would a busy woman do on her
-- most active evening", plus room.

/** Messages: 60 an hour. A lively negotiation is a dozen. */
create or replace function public.lili_limit_messages()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not public.lili_rate_ok('message.send', 60, interval '1 hour') then
    raise exception 'You have sent a lot of messages in a short time. Try again shortly.'
      using errcode = '53400';
  end if;
  return new;
end; $$;

drop trigger if exists lili_messages_limit on public.lili_messages;
create trigger lili_messages_limit before insert on public.lili_messages
  for each row execute function public.lili_limit_messages();

/**
 * Listings: 40 a day.
 *
 * Deliberately generous, because "Several at once" exists precisely so a woman
 * can clear a wardrobe in one sitting, and a limit that punishes the flow we
 * built would be the worst of both. Forty is more than anyone photographs in an
 * evening and far less than a scraper reposting a catalogue.
 */
create or replace function public.lili_limit_items()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not public.lili_rate_ok('item.create', 40, interval '24 hours') then
    raise exception 'That is a lot of listings in one day. Get in touch and we will lift it for you.'
      using errcode = '53400';
  end if;
  return new;
end; $$;

drop trigger if exists lili_items_limit on public.lili_items;
create trigger lili_items_limit before insert on public.lili_items
  for each row execute function public.lili_limit_items();

/**
 * Reports: 20 a day, and never the same target twice.
 *
 * The dedupe matters more than the count. Unlimited reports against one seller,
 * with automatic strike accumulation behind them, is a working denial-of-service
 * against a competitor — and it needed no volume at all, just persistence.
 *
 * Only user reports are counted. `source = 'auto_screen'` is filed by
 * lili.file_screening_case on the seller's own insert, and counting the
 * platform's own screening against the person it screened would throttle
 * honest listing.
 */
create or replace function public.lili_limit_reports()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if new.source is distinct from 'user_report' or new.reported_by is null then
    return new;
  end if;

  if exists (
    select 1 from public.lili_moderation_cases c
     where c.reported_by = new.reported_by
       and c.state in ('pending','reviewing')
       and ((new.target_item_id is not null and c.target_item_id = new.target_item_id)
         or (new.target_item_id is null and new.shop_id is not null and c.shop_id = new.shop_id))
  ) then
    raise exception 'You have already reported this and it is still being looked at. Reporting again does not make it faster.'
      using errcode = '23505';
  end if;

  if not public.lili_rate_ok('report.file', 20, interval '24 hours') then
    raise exception 'That is a lot of reports today. If something serious is happening, write to us directly.'
      using errcode = '53400';
  end if;
  return new;
end; $$;

drop trigger if exists lili_reports_limit on public.lili_moderation_cases;
create trigger lili_reports_limit before insert on public.lili_moderation_cases
  for each row execute function public.lili_limit_reports();

/** Conversations: 30 new threads an hour. Opening one is meeting somebody. */
create or replace function public.lili_limit_convos()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not public.lili_rate_ok('convo.open', 30, interval '1 hour') then
    raise exception 'You have started a lot of conversations in a short time. Try again shortly.'
      using errcode = '53400';
  end if;
  return new;
end; $$;

drop trigger if exists lili_convos_limit on public.lili_conversations;
create trigger lili_convos_limit before insert on public.lili_conversations
  for each row execute function public.lili_limit_convos();

/** Offers: 60 a day. */
create or replace function public.lili_limit_offers()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not public.lili_rate_ok('offer.make', 60, interval '24 hours') then
    raise exception 'That is a lot of offers today. Try again tomorrow.'
      using errcode = '53400';
  end if;
  return new;
end; $$;

drop trigger if exists lili_offers_limit on public.lili_offers;
create trigger lili_offers_limit before insert on public.lili_offers
  for each row execute function public.lili_limit_offers();
