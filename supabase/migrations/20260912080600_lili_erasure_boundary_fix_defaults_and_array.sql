-- Two corrections to the previous migration, both found by running it:
--
--  1. `elsewhere || 'text'` is ambiguous — Postgres resolved it to text[] ||
--     text[] and tried to parse the sentence as an array literal. array_append.
--  2. The "has a set-up profile elsewhere" test matched EVERY account, because
--     `profiles.journey` defaults to 'explorer' and `handle_new_user` creates
--     the row for every signup. Testing `is not null` therefore tested that the
--     trigger had run. The test now has to differ from the default to count —
--     otherwise no lili account is ever erasable, which is the same bug as
--     before wearing the opposite face.

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
  elsewhere text[] := '{}';
  account_removed boolean := false;
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

  -- ── what else is this sign-in used for ────────────────────────────────────
  if exists (select 1 from public.entries           where user_id = me)
    then elsewhere := array_append(elsewhere, 'journal entries'); end if;
  if exists (select 1 from public.forum_threads     where user_id = me)
  or exists (select 1 from public.forum_posts       where user_id = me)
    then elsewhere := array_append(elsewhere, 'forum posts'); end if;
  if exists (select 1 from public.annual_recaps     where user_id = me)
    then elsewhere := array_append(elsewhere, 'annual recaps'); end if;
  if exists (select 1 from public.climate_snapshots where user_id = me)
    then elsewhere := array_append(elsewhere, 'saved snapshots'); end if;
  if exists (select 1 from public.insight_history   where user_id = me)
    then elsewhere := array_append(elsewhere, 'insight history'); end if;
  if exists (select 1 from public.billing_consents  where user_id = me)
    then elsewhere := array_append(elsewhere, 'a billing consent record'); end if;
  -- Personalisation, not existence: `handle_new_user` writes a shell row for
  -- every signup, and `journey` defaults to 'explorer'. Only a departure from
  -- what the trigger leaves behind is evidence of a second account.
  if exists (select 1 from public.profiles p
              where p.id = me
                and (p.journey is distinct from 'explorer'
                     or coalesce(array_length(p.trackers,1),0) > 0
                     or p.handle is not null
                     or p.bio is not null
                     or p.avatar_url is not null
                     or p.is_public
                     or p.is_admin))
    then elsewhere := array_append(elsewhere, 'a set-up profile in the other app'); end if;

  -- ── lili's own data ───────────────────────────────────────────────────────
  delete from public.lili_saves         where user_id = me;
  delete from public.lili_carts         where user_id = me;
  delete from public.lili_follows       where user_id = me;
  delete from public.lili_notifications where user_id = me;
  delete from public.lili_push_tokens   where user_id = me;   get diagnostics n_push = row_count;
  delete from public.lili_events        where user_id = me;   get diagnostics n_events = row_count;
  delete from public.lili_beta_members  where lili_beta_members.uid = me;
  delete from public.lili_blocks        where user_id = me;
  update public.lili_invites set redeemed_by = null, redeemed_at = null where redeemed_by = me;

  delete from public.lili_offers where buyer_uid = me or seller_uid = me;

  update public.lili_moderation_cases set target_item_id = null
   where target_item_id in (select id from public.lili_items where owner_uid = me);
  update public.lili_moderation_cases set shop_id = null
   where shop_id in (select id from public.lili_shops where owner_uid = me);

  delete from public.lili_items where owner_uid = me;   get diagnostics n_items = row_count;
  delete from public.lili_shops where owner_uid = me;   get diagnostics n_shops = row_count;

  update public.lili_messages
     set body = '[This person deleted their account]'
   where sender_uid = me and body <> '[This person deleted their account]';
  get diagnostics n_msgs = row_count;

  update public.lili_meets set place_note = null
   where proposed_by = me and place_note is not null;
  get diagnostics n_meets = row_count;

  delete from public.lili_profiles where user_id = me;

  -- ── the sign-in ───────────────────────────────────────────────────────────
  if array_length(elsewhere, 1) is null then
    delete from auth.users where id = me;
    account_removed := true;
  end if;

  return jsonb_build_object(
    'erased', jsonb_build_object(
      'listings', n_items, 'shops', n_shops, 'analytics_events', n_events,
      'device_registrations', n_push,
      'saves_cart_follows_notifications', true, 'offers', true,
      'lili_profile', true,
      'account', account_removed),
    'redacted', jsonb_build_object(
      'messages', n_msgs,
      'meet_notes', n_meets,
      'why', 'A thread belongs to both people in it. Your messages now read "[This person deleted their account]" so the person you spoke to still has a conversation that makes sense.'),
    'sign_in', case when account_removed then
        jsonb_build_object(
          'removed', true,
          'why', 'This sign-in was used for lili and nothing else, so it has been deleted with everything on it.')
      else
        jsonb_build_object(
          'removed', false,
          'also_used_for', to_jsonb(elsewhere),
          'why', 'Everything lili held about you is gone. Your sign-in itself is shared with another service, which still holds the things listed above — deleting it here would quietly destroy those too, and that is not ours to do.',
          'how_to_finish', 'To close the sign-in itself, delete your account in that service, or write to the address in Privacy & Safety and ask us to pass the request on.')
      end,
    'kept', jsonb_build_object(
      'moderation_cases', n_cases,
      'why', 'A report is evidence in someone else''s complaint, or in one against you. Deleting it would erase their record, not just yours.',
      'basis', 'Retained for establishing, exercising or defending legal claims, and to meet our obligations as an online platform. Held for 24 months from the decision, then deleted.',
      'how_to_object', 'Write to the address in Privacy & Safety. A retention decision can be challenged.')
  );
end;
$function$;
