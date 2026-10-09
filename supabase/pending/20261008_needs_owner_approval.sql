-- lili: five changes from the 8 Oct 2026 review that are NOT applied yet.
--
-- It uses DROP CONSTRAINT / DROP NOT NULL, which the Supabase connector treats
-- as destructive, so it needs the project owner to run it. Paste this file into Supabase → SQL Editor for
-- project yjsmkjwvoolsszsedony and press Run. It is one transaction; nothing
-- here deletes any data: the DROPs only swap a foreign-key rule and relax a
-- NOT NULL, and one DROP POLICY removes a duplicate of another policy.

begin;

-- ── 1. Erasure works, and keeps the other person's half of a conversation ────
-- lili_erase_me redacts a deleted user's messages and promises the person she
-- spoke to keeps a thread that makes sense. But with ON DELETE CASCADE,
-- deleting the auth user deleted every conversation she was in, with both
-- sides' messages and any meet plans. SET NULL keeps them, attributed to no one.
alter table public.lili_conversations alter column buyer_uid  drop not null;
alter table public.lili_conversations alter column seller_uid drop not null;
alter table public.lili_messages      alter column sender_uid drop not null;
alter table public.lili_meets         alter column proposed_by drop not null;
-- Found by the functional test: lili_case_evidence links to the reporter and
-- the conversation with ON DELETE SET NULL, but both columns were NOT NULL, so
-- erasure failed outright for anyone who had ever attached a chat to a report.
alter table public.lili_case_evidence alter column disclosed_by    drop not null;
alter table public.lili_case_evidence alter column conversation_id drop not null;

alter table public.lili_conversations drop constraint lili_conversations_buyer_uid_fkey;
alter table public.lili_conversations add constraint lili_conversations_buyer_uid_fkey
  foreign key (buyer_uid) references auth.users(id) on delete set null;
alter table public.lili_conversations drop constraint lili_conversations_seller_uid_fkey;
alter table public.lili_conversations add constraint lili_conversations_seller_uid_fkey
  foreign key (seller_uid) references auth.users(id) on delete set null;
alter table public.lili_messages drop constraint lili_messages_sender_uid_fkey;
alter table public.lili_messages add constraint lili_messages_sender_uid_fkey
  foreign key (sender_uid) references auth.users(id) on delete set null;
alter table public.lili_meets drop constraint lili_meets_proposed_by_fkey;
alter table public.lili_meets add constraint lili_meets_proposed_by_fkey
  foreign key (proposed_by) references auth.users(id) on delete set null;

-- ── 2. Saved-search alerts can be delivered ─────────────────────────────────
-- Saved searches (migration lili_review_18) already count new matches in the
-- app. The notification itself needs its own kind, which this CHECK does not
-- list; until it does, the alert is skipped quietly.
alter table public.lili_notifications drop constraint lili_notifications_kind_check;
alter table public.lili_notifications add constraint lili_notifications_kind_check check (kind = any (array[
  'message', 'offer', 'price_drop', 'moderation_outcome', 'moderation_report_outcome',
  'listing_live', 'listing_blocked', 'shop_action', 'meet_proposed', 'meet_confirmed',
  'meet_declined', 'meet_cancelled', 'saved_search']));

-- ── 3. Retention ────────────────────────────────────────────────────────────
-- What the Privacy Notice and the Account Deletion & Data Retention Policy
-- promise (app/src/legal/facts.js RETENTION): analytics 13 months, read
-- notifications 90 days, crash reports 90 days, moderation decisions and their
-- evidence 24 months from the decision. A nightly job; nothing else deletes
-- these rows. Evidence goes with its case (lili_case_evidence cascades).
create or replace function lili.prune_retention()
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $$
declare n_events int; n_notes int; n_errors int; n_cases int;
begin
  delete from public.lili_events where created_at < now() - interval '13 months';
  get diagnostics n_events = row_count;
  delete from public.lili_notifications where read_at is not null and read_at < now() - interval '90 days';
  get diagnostics n_notes = row_count;
  delete from public.lili_client_errors where at < now() - interval '90 days';
  get diagnostics n_errors = row_count;
  delete from public.lili_moderation_cases
   where decided_at is not null and decided_at < now() - interval '24 months'
     and state <> 'appealed';
  get diagnostics n_cases = row_count;
  return jsonb_build_object('events', n_events, 'notifications', n_notes,
                            'crash_reports', n_errors, 'moderation_cases', n_cases);
end; $$;
revoke all on function lili.prune_retention() from public, anon, authenticated;
select cron.schedule('lili-retention', '41 3 * * *', 'select lili.prune_retention()');

-- ── 4. Erasure works outside the shared project ─────────────────────────────
-- lili_erase_me named the other product's tables (entries, forum_*, profiles…)
-- directly. In a project that holds only lili — the planned move — those
-- tables do not exist and every erasure failed. They are now looked up by name
-- and only if present; behaviour in the shared project is unchanged.
CREATE OR REPLACE FUNCTION public.lili_erase_me()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- The other product's tables are looked up by name and only if they exist,
  -- so this function also works in a project that holds lili alone (the
  -- planned move out of the shared project). A static reference failed with
  -- "relation does not exist" there, and erasure failed with it.
  declare
    t text; label text; found boolean;
  begin
    for t, label in select * from (values
        ('entries', 'journal entries'), ('forum_threads', 'forum posts'), ('forum_posts', 'forum posts'),
        ('annual_recaps', 'annual recaps'), ('climate_snapshots', 'saved snapshots'),
        ('insight_history', 'insight history'), ('billing_consents', 'a billing consent record')) v(t, label)
    loop
      if to_regclass('public.' || t) is not null and not (label = any(elsewhere)) then
        execute format('select exists (select 1 from public.%I where user_id = $1)', t) into found using me;
        if found then elsewhere := array_append(elsewhere, label); end if;
      end if;
    end loop;
    -- Personalisation, not existence: `handle_new_user` writes a shell row for
    -- every signup, and `journey` defaults to 'explorer'. Only a departure from
    -- what the trigger leaves behind is evidence of a second account.
    if to_regclass('public.profiles') is not null then
      execute $q$select exists (select 1 from public.profiles p
                 where p.id = $1
                   and (p.journey is distinct from 'explorer'
                        or coalesce(array_length(p.trackers,1),0) > 0
                        or p.handle is not null or p.bio is not null
                        or p.avatar_url is not null or p.is_public or p.is_admin))$q$
        into found using me;
      if found then elsewhere := array_append(elsewhere, 'a set-up profile in the other app'); end if;
    end if;
  end;

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

-- ── 5. One read policy on follows (L-3) ─────────────────────────────────────
-- follows_count_read has exactly the condition of follows_own, which already
-- covers SELECT; Postgres evaluates both on every read. Dropping it changes
-- nobody's access.
drop policy if exists follows_count_read on public.lili_follows;

commit;
