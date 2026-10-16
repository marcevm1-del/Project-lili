-- The first cut of these named columns that do not exist — plpgsql does not
-- validate a function body at creation time, so `apply_migration` reported
-- success and the function threw on its first call. The real column on
-- lili_moderation_cases is `reported_by`, and there is no `target_uid` at all;
-- a case points at an item and a shop, and the person it is about is reached
-- through those. lili_case_evidence has `disclosed_by`.

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
    'about', 'Everything lili holds about your account, from the database. Anything kept only on your phone is added to this file by the app.',
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
                            'reasons', mc.reasons, 'detail', mc.detail,
                            'decision', mc.decision, 'created_at', mc.created_at)), '[]'::jsonb)
                        from public.lili_moderation_cases mc where mc.reported_by = uid),
    'reports_about_your_listings', (select coalesce(jsonb_agg(jsonb_build_object(
                            'id', mc.id, 'kind', mc.kind, 'state', mc.state,
                            'reasons', mc.reasons, 'decision', mc.decision,
                            'created_at', mc.created_at)), '[]'::jsonb)
                        from public.lili_moderation_cases mc
                       where mc.reported_by is distinct from uid
                         and (mc.target_item_id in (select id from public.lili_items where owner_uid = uid)
                           or mc.shop_id in (select id from public.lili_shops where owner_uid = uid)))
  ) into out;
  return out;
end;
$$;

create or replace function public.lili_erase_me()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  n_items int := 0; n_shops int := 0; n_msgs int := 0;
  n_events int := 0; n_meets int := 0; n_cases int := 0;
begin
  if uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'there is no account to erase on an anonymous session'
      using errcode = '22023';
  end if;

  select count(*) into n_cases from public.lili_moderation_cases mc
   where mc.reported_by = uid
      or mc.target_item_id in (select id from public.lili_items where owner_uid = uid)
      or mc.shop_id in (select id from public.lili_shops where owner_uid = uid);

  -- Hers alone: gone.
  delete from public.lili_saves         where user_id = uid;
  delete from public.lili_carts         where user_id = uid;
  delete from public.lili_follows       where user_id = uid;
  delete from public.lili_notifications where user_id = uid;
  delete from public.lili_events        where user_id = uid;   get diagnostics n_events = row_count;
  delete from public.lili_beta_members  where uid = lili_erase_me.uid;
  update public.lili_invites set redeemed_by = null, redeemed_at = null where redeemed_by = uid;

  delete from public.lili_offers where buyer_uid = uid or seller_uid = uid;

  -- A case must outlive the listing it is about, so the pointer is cut first.
  update public.lili_moderation_cases set target_item_id = null
   where target_item_id in (select id from public.lili_items where owner_uid = uid);
  update public.lili_moderation_cases set shop_id = null
   where shop_id in (select id from public.lili_shops where owner_uid = uid);

  delete from public.lili_items where owner_uid = uid;   get diagnostics n_items = row_count;
  delete from public.lili_shops where owner_uid = uid;   get diagnostics n_shops = row_count;

  -- Messages: redacted, not deleted. The thread is also the other woman's, and
  -- removing half a conversation leaves her with a record she cannot read.
  update public.lili_messages
     set body = '[This person deleted their account]'
   where sender_uid = uid and body <> '[This person deleted their account]';
  get diagnostics n_msgs = row_count;

  update public.lili_meets set place_note = null
   where proposed_by = uid and place_note is not null;
  get diagnostics n_meets = row_count;

  delete from auth.users where id = uid;

  return jsonb_build_object(
    'erased', jsonb_build_object(
      'listings', n_items, 'shops', n_shops, 'analytics_events', n_events,
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
$$;

revoke all on function public.lili_export_me() from public, anon;
revoke all on function public.lili_erase_me()  from public, anon;
grant execute on function public.lili_export_me() to authenticated;
grant execute on function public.lili_erase_me()  to authenticated;
