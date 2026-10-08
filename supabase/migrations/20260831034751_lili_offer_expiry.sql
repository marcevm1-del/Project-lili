-- Offers never expired.
--
-- `EXPIRY_HOURS = 48` in src/data/offers.js is a DISPLAY derivation and nothing
-- else. `displayState()` returns the string "expired" for rendering; no stored
-- state ever changes, on the device or on the server. Three things followed:
--
--   · it is computed from the handset clock, so two phones with skewed clocks
--     disagree about the same offer and neither is told;
--   · it fails OPEN — `new Date(offer.created_at || Date.now())` means a row
--     with no timestamp reads as "just created", and therefore never expires;
--   · nobody is ever notified, so a buyer whose offer lapsed simply never hears
--     anything again.
--
-- And the accept path had no guard at all: the UI hides the buttons past 48
-- hours, but `acceptOffer(id)` accepts an offer of any age, and the UI is not
-- the control.
--
-- The comment in OffersPage says expiry "is read from the clock, so nothing
-- stays open because a job failed to run". That is a good argument, and it is
-- an argument for deriving the DISPLAY from the clock — which stays. It is not
-- an argument for the stored state being a lie. Both now: the clock decides
-- what she sees, and the database refuses to act on a lapsed offer.

alter table public.lili_offers
  add column if not exists expires_at timestamptz;

-- Backfill and default from the same 48 hours the client shows.
update public.lili_offers
   set expires_at = created_at + interval '48 hours'
 where expires_at is null;

alter table public.lili_offers
  alter column expires_at set default (now() + interval '48 hours');

/**
 * A lapsed offer cannot be answered.
 *
 * This is the part the client could never enforce. The seller's screen hides
 * the buttons; anyone posting to PostgREST directly is not looking at her
 * screen.
 */
create or replace function public.lili_offer_not_lapsed()
returns trigger
language plpgsql
as $$
begin
  if new.state is distinct from old.state
     and new.state in ('accepted','declined','countered')
     and old.state = 'pending'
     and old.expires_at is not null
     and old.expires_at < now() then
    raise exception 'that offer expired on %', to_char(old.expires_at, 'DD Mon at HH24:MI')
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists lili_offers_not_lapsed on public.lili_offers;
create trigger lili_offers_not_lapsed before update on public.lili_offers
  for each row execute function public.lili_offer_not_lapsed();

-- expires_at is the server's, like every other column of its kind.
revoke update on public.lili_offers from authenticated, anon;
grant update (state, amount, message) on public.lili_offers to authenticated;

/**
 * Sweep lapsed offers and tell the buyer.
 *
 * Called on a schedule. Being told "nobody answered" is a worse experience than
 * being told "she declined" and a much better one than silence, which is what
 * shipped: the offer simply stopped appearing and no message was ever sent.
 *
 * Idempotent, and bounded per call so a backlog cannot produce one enormous
 * transaction.
 */
create or replace function public.lili_expire_offers(p_limit int default 500)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n int := 0;
begin
  with lapsed as (
    select id, buyer_uid, item_id
      from public.lili_offers
     where state = 'pending' and expires_at is not null and expires_at < now()
     order by expires_at
     limit p_limit
     for update skip locked
  ), moved as (
    update public.lili_offers o set state = 'expired'
      from lapsed l where o.id = l.id
    returning o.id, o.buyer_uid, o.item_id
  )
  insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
  select m.buyer_uid, 'offer',
         'Your offer expired',
         'She did not answer within 48 hours. The piece may still be there — make another if you still want it.',
         'item', m.item_id
    from moved m;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.lili_expire_offers(int) from public, anon, authenticated;

-- 'expired' has to be a value the state column accepts.
alter table public.lili_offers drop constraint if exists lili_offers_state_check;
alter table public.lili_offers add constraint lili_offers_state_check
  check (state in ('pending','accepted','declined','countered','withdrawn','expired'));
