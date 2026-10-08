-- lili end-to-end functional test.
--
-- Paste into Supabase → SQL Editor and Run. It plays a seller (the founder
-- account, with the moderator claim), a buyer (the oldest other account) and a
-- signed-out visitor through every flow, then raises an exception carrying the
-- results. The exception rolls the whole transaction back: nothing is kept.
--
-- Expected (8 Oct 2026, before the pending owner-approval SQL is run):
--   every check as labelled below, except K1, which reports ERASE_FAILED until
--   supabase/pending/20261008_needs_owner_approval.sql has been applied.

do $$
declare
  me uuid; buyer uuid; s uuid; i1 uuid; i2 uuid; cv uuid; o1 uuid; o2 uuid; o3 uuid; mt uuid; cs uuid; cc uuid;
  code text; j jsonb; n int; b boolean; t text; r text := '';
begin
  create function pg_temp.act(u uuid, mod boolean default false) returns void language plpgsql as $f$
  begin
    execute 'reset role';
    if u is null then
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      execute 'set local role anon';
    else
      perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated','is_anonymous',false,
        'app_metadata', json_build_object('moderator',mod))::text, true);
      execute 'set local role authenticated';
    end if;
  end $f$;
  grant execute on function pg_temp.act(uuid, boolean) to public;

  select id into me from auth.users where email = 'marcevm1@gmail.com';
  select id into buyer from auth.users where id <> me order by created_at limit 1;

  -- A · invites and the beta gate            expect: true false unknown welcome true sign_in_required
  perform pg_temp.act(me, true);
  select c into code from lili_mint_invites(1, 'functional test') c;
  r := r || 'A1 mint=' || (code ~ '^LILI-[A-Z0-9]{4}-[A-Z0-9]{4}$');
  perform pg_temp.act(buyer);
  r := r || ' A2 member_before=' || lili_is_beta_member();
  r := r || ' A3 bad_code=' || (lili_redeem_invite('LILI-XXXX-XXXX')->>'reason');
  r := r || ' A4 redeem=' || (lili_redeem_invite(lower(code))->>'reason');
  r := r || ' A5 member_after=' || lili_is_beta_member();
  perform pg_temp.act(null);
  r := r || ' A6 anon_redeem=' || (lili_redeem_invite(code)->>'reason');

  -- B · listing, browse and search signed out   expect: live 2 1 1 1 1 2
  perform pg_temp.act(me, true);
  insert into lili_shops(owner_uid, name) values (me, 'Test shop') returning id into s;
  insert into lili_items(owner_uid, shop_id, title, brand, price, category, condition) values (me, s, 'Hermès silk scarf', 'Hermès', 600, 'Accessories', 'Excellent') returning id into i1;
  insert into lili_items(owner_uid, shop_id, title, price, category) values (me, s, 'Black abaya with embroidery', 400, 'Abayas') returning id into i2;
  select status into t from lili_items where id = i1; r := r || ' | B1 listing=' || t;
  perform pg_temp.act(null);
  select count(*) into n from lili_items where shop_id = s; r := r || ' B2 anon_sees=' || n;
  select count(*) into n from lili_search('silk scarf', 10); r := r || ' B3 search=' || n;
  select count(*) into n from lili_search('scraf', 10); r := r || ' B4 typo=' || n;
  select count(*) into n from lili_search('عباية', 10); r := r || ' B5 arabic=' || n;
  select count(*) into n from lili_search('hermes', 10); r := r || ' B6 accent=' || n;
  select live_listings into n from lili_shop_stats(s); r := r || ' B7 stats_live=' || n;

  -- C · saves, follows, price drop             expect: 1 1 1 true 0
  perform pg_temp.act(buyer);
  insert into lili_saves(user_id, item_id) values (buyer, i1);
  insert into lili_follows(user_id, shop_id) values (buyer, s);
  perform pg_temp.act(me, true);
  update lili_items set price = 450 where id = i1;
  perform pg_temp.act(buyer);
  select saves into n from lili_items where id = i1; r := r || ' | C1 saves=' || n;
  select followers into n from lili_shops where id = s; r := r || ' C2 followers=' || n;
  select count(*) into n from lili_notifications where kind = 'price_drop'; r := r || ' C3 price_drop_notif=' || n;
  select (previous_price = 600)::text into t from lili_items where id = i1; r := r || ' C4 prev_price=' || t;
  perform pg_temp.act(null);
  select count(*) into n from lili_follows where shop_id = s; r := r || ' C5 anon_sees_followers=' || n;

  -- D · conversation and messages              expect: >=1 true false 1 false
  perform pg_temp.act(buyer);
  insert into lili_conversations(buyer_uid, seller_uid, item_id) values (buyer, me, i1) returning id into cv;
  insert into lili_messages(conversation_id, sender_uid, body) values (cv, buyer, 'Is this still available?');
  perform pg_temp.act(me, true);
  select count(*) into n from lili_notifications where kind = 'message'; r := r || ' | D1 msg_notif=' || n;
  select last_message into t from lili_conversations where id = cv; r := r || ' D2 last=' || (t is not null);
  insert into lili_messages(conversation_id, sender_uid, body) values (cv, me, 'Yes it is');
  begin update lili_messages set body = 'edited!' where conversation_id = cv; b := true; exception when others then b := false; end;
  r := r || ' D3 can_edit_body=' || b;
  update lili_messages set read_at = now() where conversation_id = cv and sender_uid = buyer;
  get diagnostics n = row_count; r := r || ' D4 mark_read=' || n;
  perform pg_temp.act(null);
  begin select count(*) into n from lili_messages where conversation_id = cv; b := n > 0; exception when others then b := false; end;
  r := r || ' D5 anon_reads=' || b;

  -- E · offers                                 expect: 1 1 accepted/400 1 false false expired
  perform pg_temp.act(buyer);
  insert into lili_offers(item_id, buyer_uid, seller_uid, amount, message) values (i1, buyer, me, 400, 'Would you take 400?') returning id into o1;
  perform pg_temp.act(me, true);
  select count(*) into n from lili_notifications where kind = 'offer'; r := r || ' | E1 offer_notif=' || n;
  select count(*) into n from lili_offers_for_me() where role = 'seller'; r := r || ' E2 seller_sees=' || n;
  update lili_offers set state = 'accepted' where id = o1;
  select state || '/' || amount into t from lili_offers where id = o1; r := r || ' E3 accept=' || t;
  perform pg_temp.act(buyer);
  select count(*) into n from lili_notifications where kind = 'offer'; r := r || ' E4 buyer_notif=' || n;
  begin update lili_offers set state = 'withdrawn' where id = o1; b := true; exception when others then b := false; end;
  r := r || ' E5 withdraw_after_accept=' || b;
  insert into lili_offers(item_id, buyer_uid, seller_uid, amount) values (i2, buyer, me, 300) returning id into o2;
  begin update lili_offers set state = 'accepted' where id = o2; b := true; exception when others then b := false; end;
  r := r || ' E6 buyer_self_accept=' || b;
  update lili_offers set state = 'withdrawn' where id = o2;
  execute 'reset role';
  insert into lili_offers(item_id, buyer_uid, seller_uid, amount, expires_at) values (i2, buyer, me, 350, now() - interval '1 hour') returning id into o3;
  n := lili_expire_offers(10);
  select state into t from lili_offers where id = o3; r := r || ' E7 expired=' || t;

  -- F · meet                                   expect: false confirmed/fine 1
  perform pg_temp.act(buyer);
  insert into lili_meets(conversation_id, place_key, meet_at) values (cv, 'mall_of_the_emirates', now() + interval '1 day') returning id into mt;
  begin update lili_meets set state = 'confirmed' where id = mt; b := true; exception when others then b := false; end;
  r := r || ' | F1 self_confirm=' || b;
  perform pg_temp.act(me, true);
  update lili_meets set state = 'confirmed' where id = mt;
  perform pg_temp.act(buyer);
  update lili_meets set checkin_state = 'fine' where id = mt;
  select state || '/' || checkin_state into t from lili_meets where id = mt; r := r || ' F2 meet=' || t;
  select count(*) into n from lili_notifications where kind = 'meet_confirmed'; r := r || ' F3 notif=' || n;

  -- G · report and moderate a listing          expect: false true removed 1/active 1 1 1
  insert into lili_moderation_cases(kind, target_item_id, reasons, detail) values ('listing', i2, array['counterfeit'], 'Looks fake');
  begin insert into lili_moderation_cases(kind, target_item_id, reasons) values ('listing', i2, array['counterfeit']); b := true; exception when others then b := false; end;
  r := r || ' | G1 duplicate_report=' || b;
  perform pg_temp.act(me, true);
  select id into cs from lili_moderation_list('pending') where target_item_id = i2;
  r := r || ' G2 in_queue=' || (cs is not null);
  j := lili_moderation_claim(cs);
  j := lili_moderation_decide(cs, 'remove_listing', 'Photos match a known counterfeit listing.');
  select status into t from lili_items where id = i2; r := r || ' G3 item=' || t;
  select strikes || '/' || status into t from lili_shops where id = s; r := r || ' G4 shop=' || t;
  select count(*) into n from lili_notifications where kind = 'shop_action'; r := r || ' G5 seller_told=' || n;
  perform pg_temp.act(buyer);
  select count(*) into n from lili_notifications where kind = 'moderation_report_outcome'; r := r || ' G6 reporter_told=' || n;
  select count(*) into n from lili_my_cases(); r := r || ' G7 my_cases=' || n;

  -- H · conversation report with transcript    expect: true 2 false false
  j := lili_report_conversation(cv, array['harassment'], 'Rude messages', true);
  cc := (j->>'case_id')::uuid; r := r || ' | H1 reported=' || (j->>'ok');
  perform pg_temp.act(me, true);
  j := lili_case_transcript(cc); r := r || ' H2 transcript_msgs=' || coalesce(j->>'messages', j->>'note');
  perform pg_temp.act(buyer);
  begin j := lili_case_transcript(cc); b := true; exception when others then b := false; end;
  r := r || ' H3 non_mod_reads=' || b;
  execute 'reset role';
  begin update lili_case_evidence set transcript = '[]' where case_id = cc; b := true; exception when others then b := false; end;
  r := r || ' H4 evidence_editable=' || b;

  -- I · consented analytics, export            expect: ok false 19 keys
  perform pg_temp.act(buyer);
  insert into lili_events(session_id, name) values ('session-1234', 'item_view');
  r := r || ' | I1 event_logged=ok';
  begin select count(*) into n from lili_events; b := n > 0; exception when others then b := false; end;
  r := r || ' I2 events_readable=' || b;
  j := lili_export_me();
  r := r || ' I3 export_keys=' || (select count(*) from jsonb_object_keys(j)) || ' offers=' || jsonb_array_length(j->'offers')
         || ' msgs=' || jsonb_array_length(j->'messages_you_sent') || ' events=' || jsonb_array_length(j->'analytics_events');

  -- J · rate limit                             expect: truetruefalse
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', buyer)::text, true);
  r := r || ' | J1 rate=' || lili_rate_ok('t', 2, '1 hour') || lili_rate_ok('t', 2, '1 hour') || lili_rate_ok('t', 2, '1 hour');

  -- K · erasure                                expect: an erasure receipt; the seller keeps the thread
  perform pg_temp.act(buyer);
  begin
    j := lili_erase_me();
    r := r || ' | K1 signin_removed=' || (j->'sign_in'->>'removed') || ' also_used_for=' || coalesce(j->'sign_in'->>'also_used_for','-');
  exception when others then r := r || ' | K1 ERASE_FAILED=' || sqlerrm; end;
  execute 'reset role';
  select count(*) into n from lili_conversations where id = cv; r := r || ' K2 seller_keeps_thread=' || n;
  select count(*) into n from lili_messages where conversation_id = cv; r := r || ' K3 msgs_left=' || n;
  select count(*) into n from lili_case_evidence where case_id = cc; r := r || ' K4 evidence_kept=' || n;

  raise exception 'RESULTS %', r;
end $$;
