-- The data export includes saved searches.
CREATE OR REPLACE FUNCTION public.lili_export_me()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    'saved_searches', (select coalesce(jsonb_agg(jsonb_build_object('query', ss.query, 'max_price', ss.max_price,
                            'category', ss.category, 'created_at', ss.created_at)), '[]'::jsonb)
                            from public.lili_saved_searches ss where ss.user_id = uid),
    'reviews_you_wrote', (select coalesce(jsonb_agg(jsonb_build_object('meet_id', r.meet_id, 'about', r.reviewee_role,
                            'stars', r.stars, 'body', r.body, 'created_at', r.created_at)), '[]'::jsonb)
                            from public.lili_reviews r where r.reviewer_uid = uid),
    'reviews_about_you', (select coalesce(jsonb_agg(jsonb_build_object('as', r.reviewee_role,
                            'stars', r.stars, 'body', r.body, 'created_at', r.created_at)), '[]'::jsonb)
                            from public.lili_reviews r where r.reviewee_uid = uid and lili.review_visible(r)),
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
    'devices_registered_for_notifications', (select coalesce(jsonb_agg(jsonb_build_object(
                            'platform', pt.platform, 'app_version', pt.app_version,
                            'registered_at', pt.created_at, 'last_seen', pt.last_seen,
                            'token', 'not included — see note')), '[]'::jsonb)
                        from public.lili_push_tokens pt where pt.user_id = uid),
    'note_about_device_tokens', 'The token itself is left out on purpose. It is the credential for sending a notification to your phone, and a copy of this file in an inbox would be a copy of that credential.',
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
$function$
;
