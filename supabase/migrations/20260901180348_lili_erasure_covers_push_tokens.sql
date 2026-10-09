-- A new table that is not named in lili_erase_me() is a table that survives
-- "delete my account". That is the exact bug v2.9 fixed for fifteen other
-- tables — erasure deleted one of them and told her it had cleared everything.
--
-- lili_push_tokens does cascade from auth.users, so the rows would go. But the
-- RECEIPT is what she reads, and a receipt that does not mention her device
-- registrations is the same silence that made the original bug invisible. It
-- is deleted explicitly, counted, and reported.
create or replace function public.lili_erase_me()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  me uuid := auth.uid();
  n_items int := 0; n_shops int := 0; n_msgs int := 0;
  n_events int := 0; n_meets int := 0; n_cases int := 0; n_push int := 0;
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'there is no account to erase on an anonymous session'
      using errcode = '22023';
  end if;

  select count(*) into n_cases from public.lili_moderation_cases mc
   where mc.reported_by = me
      or mc.target_item_id in (select id from public.lili_items where owner_uid = me)
      or mc.shop_id in (select id from public.lili_shops where owner_uid = me);

  delete from public.lili_saves         where user_id = me;
  delete from public.lili_carts         where user_id = me;
  delete from public.lili_follows       where user_id = me;
  delete from public.lili_notifications where user_id = me;
  delete from public.lili_push_tokens   where user_id = me;   get diagnostics n_push = row_count;
  delete from public.lili_events        where user_id = me;   get diagnostics n_events = row_count;
  delete from public.lili_beta_members  where lili_beta_members.uid = me;
  update public.lili_invites set redeemed_by = null, redeemed_at = null where redeemed_by = me;

  delete from public.lili_offers where buyer_uid = me or seller_uid = me;

  -- A case must outlive the listing it is about, so the pointer is cut first.
  update public.lili_moderation_cases set target_item_id = null
   where target_item_id in (select id from public.lili_items where owner_uid = me);
  update public.lili_moderation_cases set shop_id = null
   where shop_id in (select id from public.lili_shops where owner_uid = me);

  delete from public.lili_items where owner_uid = me;   get diagnostics n_items = row_count;
  delete from public.lili_shops where owner_uid = me;   get diagnostics n_shops = row_count;

  -- Messages: redacted, not deleted. The thread is also the other woman's, and
  -- removing half a conversation leaves her with a record she cannot read.
  update public.lili_messages
     set body = '[This person deleted their account]'
   where sender_uid = me and body <> '[This person deleted their account]';
  get diagnostics n_msgs = row_count;

  update public.lili_meets set place_note = null
   where proposed_by = me and place_note is not null;
  get diagnostics n_meets = row_count;

  delete from auth.users where id = me;

  return jsonb_build_object(
    'erased', jsonb_build_object(
      'listings', n_items, 'shops', n_shops, 'analytics_events', n_events,
      'device_registrations', n_push,
      'saves_cart_follows_notifications', true, 'offers', true, 'account', true),
    'redacted', jsonb_build_object(
      'messages', n_msgs,
      'meet_notes', n_meets,
      'why', 'A thread belongs to both people in it. Your messages now read "[This person deleted their account]" so the person you spoke to still has a conversation that makes sense.'),
    'kept', jsonb_build_object(
      'moderation_cases', n_cases,
      'why', 'A report is evidence in someone else''s complaint, or in one against you. Deleting it would erase their record, not just yours.',
      'basis', 'Retained for establishing, exercising or defending legal claims, and to meet our obligations as an online platform. Held for 24 months from the decision, then deleted.',
      'how_to_object', 'Write to the address in Privacy & Safety. A retention decision can be challenged.')
  );
end;
$function$;
