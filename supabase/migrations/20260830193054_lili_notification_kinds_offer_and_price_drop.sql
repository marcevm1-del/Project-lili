-- The kind CHECK was written before offers existed and never extended, so
-- lili.notify_offer worked around it by filing every offer notification as
-- kind = 'message'.
--
-- The cost of that workaround: an offer arriving looked like a message. It took
-- the chat icon, it counted as a message, and anything that routed on kind sent
-- her to the wrong screen. A notification whose type is a lie is a notification
-- you cannot route, filter, or count.
--
-- Adding the two kinds that actually exist, and correcting the trigger to use
-- them. Also adding 'price_drop' for the new alert.

alter table public.lili_notifications drop constraint if exists lili_notifications_kind_check;
alter table public.lili_notifications add constraint lili_notifications_kind_check
  check (kind = any (array[
    'message', 'offer', 'price_drop',
    'moderation_outcome', 'moderation_report_outcome',
    'listing_live', 'listing_blocked', 'shop_action'
  ]));

create or replace function lili.notify_offer()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare item_title text;
begin
  select coalesce(title, title_ar) into item_title from public.lili_items where id = new.item_id;

  if tg_op = 'INSERT' then
    insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
    values (new.seller_uid, 'offer',
            'New offer: ' || new.currency || ' ' || trim(to_char(new.amount,'FM999,999,990')),
            coalesce(item_title,'Your listing') ||
            case when new.message is not null and new.message <> ''
                 then ' — "' || left(new.message, 90) || '"' else '' end,
            -- points at the offer screen, where she can actually answer it,
            -- rather than at the listing where she cannot
            'offer', new.id);
    return null;
  end if;

  if new.state <> old.state and new.state in ('accepted','declined','countered') then
    insert into public.lili_notifications (user_id, kind, title, body, link_kind, link_id)
    values (new.buyer_uid, 'offer',
            case new.state
              when 'accepted'  then 'Your offer was accepted'
              when 'declined'  then 'Your offer was declined'
              else 'The seller made a counter-offer' end,
            coalesce(item_title,'A listing') || ' — ' || new.currency || ' ' ||
            trim(to_char(new.amount,'FM999,999,990')),
            'offer', new.id);
  end if;
  return null;
end; $function$;
