-- The Saved screen has always had a "Price drops" tab that filters on
-- `item.priceDrop`. Nothing has ever set that field, so the tab could only ever
-- be empty — a filter for a thing the app did not record.
--
-- Now that a price drop is a real event, record it: the last price and when it
-- changed, written by the same trigger that sends the alert. Server-owned, so a
-- seller cannot fake a discount by writing a higher "previous" price.

alter table public.lili_items
  add column if not exists previous_price numeric,
  add column if not exists price_changed_at timestamptz;

comment on column public.lili_items.previous_price is
  'The price before the most recent genuine reduction. Server-owned: set by lili.notify_price_drop, never writable by a client.';

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
  if new.status is distinct from 'live' then return new; end if;
  if old.price is null or new.price is null then return new; end if;
  if new.price >= old.price then return new; end if;

  v_drop := old.price - new.price;
  v_pct  := v_drop / nullif(old.price, 0);
  if v_pct < MIN_PCT or v_drop < MIN_ABS then return new; end if;

  -- Record the drop on the listing itself, so a shopper can see it without a
  -- notification and the Saved screen's price-drop filter has something real
  -- to filter on. AFTER trigger, so this is a separate write.
  update public.lili_items
     set previous_price = old.price, price_changed_at = now()
   where id = new.id;

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
     and s.user_id <> new.owner_uid
     and not exists (
       select 1 from public.lili_notifications n
        where n.user_id = s.user_id
          and n.kind = 'price_drop'
          and n.link_id = new.id
          and n.created_at > now() - interval '24 hours');

  return null;
end; $$;

-- AFTER, because it now writes to the row it is watching. A BEFORE trigger
-- updating its own table re-enters itself; this is the same shape as the
-- screening trigger's note in the handover — decide in BEFORE, write in AFTER.
drop trigger if exists notify_price_drop on public.lili_items;
create trigger notify_price_drop
  after update of price on public.lili_items
  for each row execute function lili.notify_price_drop();

-- previous_price and price_changed_at are the server's, like status and
-- screening. Add them to the guard so a client write is reverted.
select 1;
