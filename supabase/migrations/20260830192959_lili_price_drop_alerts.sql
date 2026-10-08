-- ═══════════════════════════════════════════════════════════════════════════
--  PRICE DROP ALERTS
--
--  The one component worth copying from the competitor research. Poshmark and
--  Depop both do it, and it is the highest-value mechanic available to lili
--  right now for a specific reason: it is the only one where the plumbing is
--  ALREADY built. Saves reach the server, notifications are delivered and read,
--  and rows are written by trigger only. This is three joins and a trigger.
--
--  What it does: when a seller lowers the price of a piece, everyone who saved
--  it is told. Nobody else. It is not a broadcast and it is not marketing —
--  she asked to be reminded of this exact piece by saving it, which is as clean
--  a consent signal as a marketplace gets.
--
--  Three limits, deliberately:
--
--    · Only a REAL drop. A 1% wobble is not news, so the drop has to be at
--      least 5% and at least AED 20 to be worth a notification.
--    · Never on a rise. Nobody wants to be told a thing got dearer.
--    · Once per piece per day, so a seller experimenting with her pricing
--      cannot accidentally send the same woman six alerts in an evening.
--
--  The last one matters more than it looks: a notification channel that can be
--  made to fire repeatedly is a channel people turn off, and there is no way to
--  turn a notification back on once someone has stopped trusting it.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function lili.notify_price_drop()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_drop numeric; v_pct numeric; v_title text;
  MIN_PCT constant numeric := 0.05;
  MIN_ABS constant numeric := 20;
begin
  -- Only live listings, only a genuine reduction.
  if new.status is distinct from 'live' then return new; end if;
  if old.price is null or new.price is null then return new; end if;
  if new.price >= old.price then return new; end if;

  v_drop := old.price - new.price;
  v_pct  := v_drop / nullif(old.price, 0);
  if v_pct < MIN_PCT or v_drop < MIN_ABS then return new; end if;

  v_title := coalesce(nullif(btrim(new.title), ''), 'A piece you saved');

  insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
  select s.user_id,
         'price_drop',
         v_title || ' is now AED ' || to_char(round(new.price), 'FM999,999,999'),
         'Down from AED ' || to_char(round(old.price), 'FM999,999,999') ||
           ' — you saved this one.',
         'item',
         new.id
    from public.lili_saves s
   where s.item_id = new.id
     -- never tell the seller about her own price change
     and s.user_id <> new.owner_uid
     -- one alert per person per piece per day
     and not exists (
       select 1 from public.lili_notifications n
        where n.user_id = s.user_id
          and n.kind = 'price_drop'
          and n.link_id = new.id
          and n.created_at > now() - interval '24 hours');

  return new;
end; $$;

drop trigger if exists notify_price_drop on public.lili_items;
create trigger notify_price_drop
  after update of price on public.lili_items
  for each row execute function lili.notify_price_drop();

comment on function lili.notify_price_drop() is
  'Tells the people who saved a piece when its price genuinely falls (>=5% and >=AED 20), at most once per person per piece per day, never on a rise, never to the seller herself.';
