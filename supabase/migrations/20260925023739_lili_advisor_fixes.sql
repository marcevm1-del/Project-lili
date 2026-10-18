-- lili: fixes for the Supabase security + performance advisors (lili objects only).
-- The other product sharing this project is deliberately left untouched.

-- 1 · Trigger functions were callable over /rest/v1/rpc by anon and signed-in
--     users. Triggers do not need EXECUTE at fire time, so nobody needs it.
revoke execute on function public.lili_bump_item_saves() from public, anon, authenticated;
revoke execute on function public.lili_limit_convos()    from public, anon, authenticated;
revoke execute on function public.lili_limit_items()     from public, anon, authenticated;
revoke execute on function public.lili_limit_messages()  from public, anon, authenticated;
revoke execute on function public.lili_limit_offers()    from public, anon, authenticated;
revoke execute on function public.lili_limit_reports()   from public, anon, authenticated;
revoke execute on function public.lili_notify_meet()     from public, anon, authenticated;

-- lili_in_conversation is only used by lili_meets policies, which apply to
-- `authenticated`. No reason for a signed-out caller to probe conversation ids.
revoke execute on function public.lili_in_conversation(uuid) from public, anon;

-- 2 · Duplicate index: both are gin (search_raw gin_trgm_ops).
drop index if exists public.lili_items_search_trgm_words;

-- 3 · Covering indexes for foreign keys (joins + ON DELETE cascades on erasure).
create index if not exists lili_blocks_shop_id_idx               on public.lili_blocks (shop_id);
create index if not exists lili_case_evidence_conversation_id_idx on public.lili_case_evidence (conversation_id);
create index if not exists lili_case_evidence_disclosed_by_idx    on public.lili_case_evidence (disclosed_by);
create index if not exists lili_conversations_item_id_idx         on public.lili_conversations (item_id);
create index if not exists lili_conversations_shop_id_idx         on public.lili_conversations (shop_id);
create index if not exists lili_events_user_id_idx                on public.lili_events (user_id);
create index if not exists lili_follows_shop_id_idx               on public.lili_follows (shop_id);
create index if not exists lili_invites_redeemed_by_idx           on public.lili_invites (redeemed_by);
create index if not exists lili_meets_cancelled_by_idx            on public.lili_meets (cancelled_by);
create index if not exists lili_meets_checkin_by_idx              on public.lili_meets (checkin_by);
create index if not exists lili_meets_item_id_idx                 on public.lili_meets (item_id);
create index if not exists lili_meets_proposed_by_idx             on public.lili_meets (proposed_by);
create index if not exists lili_messages_sender_uid_idx           on public.lili_messages (sender_uid);
create index if not exists lili_moderation_cases_reported_by_idx  on public.lili_moderation_cases (reported_by);
create index if not exists lili_moderation_cases_shop_id_idx      on public.lili_moderation_cases (shop_id);
create index if not exists lili_moderation_cases_target_item_id_idx on public.lili_moderation_cases (target_item_id);
create index if not exists lili_offers_counter_of_idx             on public.lili_offers (counter_of);
create index if not exists lili_offers_shop_id_idx                on public.lili_offers (shop_id);
create index if not exists lili_saves_item_id_idx                 on public.lili_saves (item_id);

-- 4 · RLS initplan: wrap auth.uid() in a scalar subquery so it is evaluated
--     once per statement instead of once per row. Same predicates, same roles.
alter policy beta_self_read on public.lili_beta_members
  using ((uid = (select auth.uid())));

alter policy blocks_own on public.lili_blocks
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy carts_own on public.lili_carts
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy conv_create on public.lili_conversations
  with check (((buyer_uid = (select auth.uid())) AND (seller_uid <> (select auth.uid())) AND (NOT (EXISTS ( SELECT 1
   FROM public.lili_blocks b
  WHERE ((b.user_id = lili_conversations.seller_uid) AND (b.shop_id IN ( SELECT lili_shops.id
           FROM public.lili_shops
          WHERE (lili_shops.owner_uid = (select auth.uid())))))))) AND public.lili_is_beta_member()));

alter policy conv_read on public.lili_conversations
  using (((buyer_uid = (select auth.uid())) OR (seller_uid = (select auth.uid()))));

alter policy lili_events_delete_own on public.lili_events
  using ((user_id = (select auth.uid())));

alter policy lili_events_insert_own on public.lili_events
  with check ((user_id = (select auth.uid())));

alter policy follows_own on public.lili_follows
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy items_create on public.lili_items
  with check (((owner_uid = (select auth.uid())) AND (status = 'pending'::text) AND (screening = '{}'::jsonb) AND (EXISTS ( SELECT 1
   FROM public.lili_shops s
  WHERE ((s.id = lili_items.shop_id) AND (s.owner_uid = (select auth.uid()))))) AND public.lili_is_beta_member()));

alter policy items_read on public.lili_items
  using (((status = 'live'::text) OR (owner_uid = (select auth.uid()))));

alter policy items_update on public.lili_items
  using ((owner_uid = (select auth.uid())))
  with check ((owner_uid = (select auth.uid())));

alter policy lili_meets_propose on public.lili_meets
  with check (((proposed_by = (select auth.uid())) AND public.lili_in_conversation(conversation_id)));

alter policy msg_create on public.lili_messages
  with check (((sender_uid = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.lili_conversations c
  WHERE ((c.id = lili_messages.conversation_id) AND ((c.buyer_uid = (select auth.uid())) OR (c.seller_uid = (select auth.uid()))))))));

alter policy msg_mark_read on public.lili_messages
  using ((EXISTS ( SELECT 1
   FROM public.lili_conversations c
  WHERE ((c.id = lili_messages.conversation_id) AND ((c.buyer_uid = (select auth.uid())) OR (c.seller_uid = (select auth.uid()))) AND (lili_messages.sender_uid <> (select auth.uid()))))))
  with check (true);

alter policy msg_read on public.lili_messages
  using ((EXISTS ( SELECT 1
   FROM public.lili_conversations c
  WHERE ((c.id = lili_messages.conversation_id) AND ((c.buyer_uid = (select auth.uid())) OR (c.seller_uid = (select auth.uid())))))));

alter policy cases_create on public.lili_moderation_cases
  with check (((reported_by = (select auth.uid())) AND (state = 'pending'::text) AND (decision IS NULL)));

alter policy notif_mark_read on public.lili_notifications
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy notif_read on public.lili_notifications
  using ((user_id = (select auth.uid())));

alter policy offers_create on public.lili_offers
  with check (((buyer_uid = (select auth.uid())) AND (state = 'pending'::text) AND (EXISTS ( SELECT 1
   FROM public.lili_items i
  WHERE ((i.id = lili_offers.item_id) AND (i.status = 'live'::text) AND (i.owner_uid = lili_offers.seller_uid) AND (i.owner_uid <> (select auth.uid())))))));

alter policy offers_read on public.lili_offers
  using (((buyer_uid = (select auth.uid())) OR (seller_uid = (select auth.uid()))));

alter policy offers_update on public.lili_offers
  using (((buyer_uid = (select auth.uid())) OR (seller_uid = (select auth.uid()))))
  with check (((buyer_uid = (select auth.uid())) OR (seller_uid = (select auth.uid()))));

alter policy profiles_own on public.lili_profiles
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy push_create on public.lili_push_tokens
  with check ((user_id = (select auth.uid())));

alter policy push_delete on public.lili_push_tokens
  using ((user_id = (select auth.uid())));

alter policy push_read on public.lili_push_tokens
  using ((user_id = (select auth.uid())));

alter policy push_touch on public.lili_push_tokens
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy saves_own on public.lili_saves
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy shops_create on public.lili_shops
  with check (((owner_uid = (select auth.uid())) AND (status = 'active'::text) AND (followers = 0) AND (strikes = 0) AND public.lili_is_beta_member()));

alter policy shops_read on public.lili_shops
  using (((status = 'active'::text) OR (owner_uid = (select auth.uid()))));

alter policy shops_update on public.lili_shops
  using ((owner_uid = (select auth.uid())))
  with check ((owner_uid = (select auth.uid())));
