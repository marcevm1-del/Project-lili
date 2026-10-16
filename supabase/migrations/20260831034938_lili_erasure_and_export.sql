-- "Delete my account" deleted nothing, and told her it had.
--
-- What it actually did: appended a line to a device-local audit log, cleared
-- three local keys, and rendered "Your deletion request is recorded. Local data
-- on this device has been cleared." Both halves were false — no request reached
-- anyone, and repo.reset() exists and was never called.
--
-- One of sixteen tables was touched, and only because that one is never written
-- server-side anyway. Her shop, her listings, her messages, offers, saves,
-- cart, follows, events and meet plans all survived. "Get a copy of my data"
-- returned five local keys and omitted everything on the server.
--
-- UAE PDPL (Federal Decree-Law 45 of 2021) art. 15 is access and art. 16 is
-- erasure. This is both, done where the data actually is.
--
-- ── the two things erasure must NOT do
--
-- 1. It must not delete somebody else's record of what happened to them. Her
--    messages in a thread are also the other woman's thread. So a message is
--    redacted, not removed: the row stays, the body becomes a tombstone, and
--    the person she spoke to still has a coherent conversation.
-- 2. It must not destroy a moderation case that is the evidence in somebody
--    else's complaint. Those are kept, under a stated legal basis and a stated
--    period, and the stating is the part that was missing.

/**
 * Everything held about this account, as one document.
 *
 * Runs as the caller's own identity for the row-level reads it can do, and as
 * definer for the two tables that have no SELECT policy for anybody
 * (lili_events, and her own moderation cases). Returning a person their own
 * data is precisely what art. 15 requires, and it is the only read path that
 * exists for lili_events — the analytics table is otherwise unreadable by
 * every client role, including hers.
 */
create or replace function public.lili_export_me()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid(); out jsonb;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'generated_at', now(),
    'about', 'Everything lili holds about your account, from the database. Anything kept only on your phone is in the section this screen adds locally.',
    'account', (select jsonb_build_object('id', u.id, 'email', u.email,
                        'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at)
                  from auth.users u where u.id = uid),
    'shop',    (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from public.lili_shops s where s.owner_uid = uid),
    'listings',(select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) from public.lili_items i where i.owner_uid = uid),
    'saved',   (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from public.lili_saves v where v.user_id = uid),
    'cart',    (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from public.lili_carts c where c.user_id = uid),
    'following',(select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from public.lili_follows f where f.user_id = uid),
    'conversations', (select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb)
                        from public.lili_conversations k where uid in (k.buyer_uid, k.seller_uid)),
    'messages_you_sent', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
                        from public.lili_messages m where m.sender_uid = uid),
    'offers',  (select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
                        from public.lili_offers o where o.buyer_uid = uid or o.seller_uid = uid),
    'meets',   (select coalesce(jsonb_agg(to_jsonb(mt)), '[]'::jsonb)
                        from public.lili_meets mt
                       where mt.conversation_id in (select id from public.lili_conversations
                                                     where uid in (buyer_uid, seller_uid))),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb)
                        from public.lili_notifications n where n.user_id = uid),
    'analytics_events', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb)
                        from public.lili_events e where e.user_id = uid),
    'beta_invitation', (select coalesce(jsonb_agg(jsonb_build_object('code', iv.code, 'redeemed_at', iv.redeemed_at)), '[]'::jsonb)
                        from public.lili_invites iv where iv.redeemed_by = uid),
    'reports_you_filed', (select coalesce(jsonb_agg(jsonb_build_object(
                            'id', mc.id, 'kind', mc.kind, 'state', mc.state,
                            'reasons', mc.reasons, 'created_at', mc.created_at)), '[]'::jsonb)
                        from public.lili_moderation_cases mc where mc.reporter_uid = uid)
  ) into out;
  return out;
end;
$$;

/**
 * Erase this account.
 *
 * Ordered so nothing is orphaned, and honest about the three things it does not
 * delete — each of which is returned to her in the receipt, because an erasure
 * that quietly keeps things is the same lie as one that quietly keeps
 * everything.
 */
create or replace function public.lili_erase_me()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  n_items int; n_shops int; n_msgs int; n_events int; n_meets int; n_cases int;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'there is no account to erase on an anonymous session'
      using errcode = '22023';
  end if;

  -- Hers alone: gone.
  delete from public.lili_saves        where user_id = uid;
  delete from public.lili_carts        where user_id = uid;
  delete from public.lili_follows      where user_id = uid;
  delete from public.lili_notifications where user_id = uid;
  delete from public.lili_events       where user_id = uid;              get diagnostics n_events = row_count;
  delete from public.lili_beta_members where uid = lili_erase_me.uid;
  update public.lili_invites set redeemed_by = null where redeemed_by = uid;

  -- Listings and shops: removed, not hidden. A withdrawn listing is not
  -- somebody else's record of anything.
  delete from public.lili_offers where buyer_uid = uid or seller_uid = uid;
  delete from public.lili_items  where owner_uid = uid;                  get diagnostics n_items = row_count;
  delete from public.lili_shops  where owner_uid = uid;                  get diagnostics n_shops = row_count;

  -- Messages: redacted, not deleted. The thread is also the other woman's,
  -- and removing half a conversation leaves her with a record she cannot read.
  update public.lili_messages
     set body = '[This person deleted their account]'
   where sender_uid = uid and body <> '[This person deleted their account]';
  get diagnostics n_msgs = row_count;

  -- Meet plans she agreed with somebody else: the place and time were an
  -- agreement between two people, so the row survives with her side blanked.
  update public.lili_meets set place_note = null
   where proposed_by = uid and place_note is not null;
  get diagnostics n_meets = row_count;

  select count(*) into n_cases from public.lili_moderation_cases
   where reporter_uid = uid or target_uid = uid;

  -- The account itself. Everything with an ON DELETE CASCADE to auth.users
  -- goes with it; the two updates above ran first precisely so they would not.
  delete from auth.users where id = uid;

  return jsonb_build_object(
    'erased', jsonb_build_object(
      'listings', coalesce(n_items,0), 'shops', coalesce(n_shops,0),
      'analytics_events', coalesce(n_events,0),
      'saves_cart_follows_notifications', true, 'account', true),
    'redacted', jsonb_build_object(
      'messages', coalesce(n_msgs,0),
      'why', 'A thread belongs to both people in it. Your messages now read "[This person deleted their account]" so the person you spoke to still has a conversation that makes sense.',
      'meet_notes', coalesce(n_meets,0)),
    'kept', jsonb_build_object(
      'moderation_cases', coalesce(n_cases,0),
      'why', 'A report is evidence in someone else''s complaint, or in one against you. Deleting it would erase their record, not just yours.',
      'basis', 'Retained on the basis of establishing, exercising or defending legal claims, and to meet our obligations as an online platform. Held for 24 months from the decision, then deleted.',
      'how_to_object', 'Write to the address in Privacy & Safety. A retention decision can be challenged.')
  );
end;
$$;

revoke all on function public.lili_export_me() from public, anon;
revoke all on function public.lili_erase_me()  from public, anon;
grant execute on function public.lili_export_me() to authenticated;
grant execute on function public.lili_erase_me()  to authenticated;
