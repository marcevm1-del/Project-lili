-- lili: regression test for the 8 Oct 2026 audit fixes.
--
-- Runs in CI against a database rebuilt from supabase/migrations (see
-- supabase/tests/run.sh), and can be pasted into the SQL editor of any project
-- with at least three users. It asserts as it goes and ends by raising one
-- line: "ALL_PASSED <n>" or "FAILED <labels>". The exception rolls everything
-- back, so nothing it creates is kept.

do $$
declare
  me uuid; b1 uuid; b2 uuid; s uuid; i uuid; i2 uuid; cv uuid; mt uuid;
  o1 uuid; o2 uuid; ss uuid; j jsonb; n int; t text; bad text; total int;
  i3 uuid; cs uuid; k0 int; k1 int; d1 uuid; d2 uuid; d3 uuid; ord uuid; ord2 uuid; ho uuid; ao uuid; pid uuid;
begin
  create temp table _r (label text, ok boolean) on commit drop;
  grant all on _r to public;
  create function pg_temp.ok(label text, cond boolean) returns void language sql as
    $f$ insert into _r values (label, coalesce(cond, false)) $f$;
  grant execute on function pg_temp.ok(text, boolean) to public;
  create function pg_temp.act(u uuid) returns void language plpgsql as $f$
  begin
    execute 'reset role';
    if u is null then
      perform set_config('request.jwt.claims', '{"role":"anon"}', true); execute 'set local role anon';
    else
      perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
      execute 'set local role authenticated';
    end if;
  end $f$;
  grant execute on function pg_temp.act(uuid) to public;
  create function pg_temp.mod(u uuid) returns void language plpgsql as $f$
  begin
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated',
      'app_metadata', json_build_object('moderator',true))::text, true);
    execute 'set local role authenticated';
  end $f$;
  grant execute on function pg_temp.mod(uuid) to public;

  select id into me from auth.users order by created_at limit 1;
  select id into b1 from auth.users where id <> me order by created_at limit 1;
  select id into b2 from auth.users where id not in (me, b1) order by created_at limit 1;
  perform pg_temp.ok('three accounts to play with', me is not null and b1 is not null and b2 is not null);

  insert into lili_shops(owner_uid, name) values (me, 'Audit shop') returning id into s;
  insert into lili_items(owner_uid, shop_id, title, brand, price, category)
    values (me, s, 'One-of-a-kind silk dress', 'Zimmermann', 900, 'Dresses') returning id into i;

  -- ── one piece, one buyer ────────────────────────────────────────────────
  insert into lili_offers(item_id, buyer_uid, seller_uid, amount) values (i, b1, me, 800) returning id into o1;
  insert into lili_offers(item_id, buyer_uid, seller_uid, amount) values (i, b2, me, 850) returning id into o2;
  perform pg_temp.act(me);
  update lili_offers set state = 'accepted' where id = o1;
  execute 'reset role';
  perform pg_temp.ok('accepting declines the rival offer', (select state from lili_offers where id = o2) = 'declined');
  perform pg_temp.ok('accepting reserves the piece', (select reserved_offer from lili_items where id = i) = o1);
  perform pg_temp.act(me);
  begin update lili_offers set state = 'accepted' where id = o2; perform pg_temp.ok('a second acceptance is refused', false);
  exception when others then perform pg_temp.ok('a second acceptance is refused', true); end;
  perform pg_temp.act(b2);
  begin insert into lili_offers(item_id, buyer_uid, seller_uid, amount) values (i, b2, me, 870);
    perform pg_temp.ok('no new offers on a reserved piece', false);
  exception when others then perform pg_temp.ok('no new offers on a reserved piece', true); end;
  begin j := lili_release_reservation(i); perform pg_temp.ok('a stranger cannot release it', false);
  exception when others then perform pg_temp.ok('a stranger cannot release it', true); end;
  perform pg_temp.act(b1);
  j := lili_release_reservation(i);
  execute 'reset role';
  perform pg_temp.ok('the buyer can cancel the reservation',
    (select state from lili_offers where id = o1) = 'withdrawn' and (select reserved_offer from lili_items where id = i) is null);
  perform pg_temp.ok('the seller is told it was cancelled',
    exists (select 1 from lili_notifications where user_id = me and title = 'The buyer cancelled the reservation'));

  -- ── screening details are private ───────────────────────────────────────
  insert into lili_items(owner_uid, shop_id, title, brand, price, category, description)
    values (me, s, 'Chanel flap bag replica 1:1 mirror quality', 'Chanel', 400, 'Bags', 'AAA copy') returning id into i2;
  perform pg_temp.ok('the public row keeps only the verdict',
    not exists (select 1 from lili_items where id in (i, i2) and (screening ? 'findings' or screening ? 'score')));
  perform pg_temp.ok('the details are kept privately', (select count(*) from lili_item_screening where item_id in (i, i2)) = 2);
  perform pg_temp.act(null);
  begin select count(*) into n from lili_item_screening; perform pg_temp.ok('nobody signed out reads the details', false);
  exception when others then perform pg_temp.ok('nobody signed out reads the details', true); end;
  execute 'reset role';

  -- ── guards ──────────────────────────────────────────────────────────────
  perform pg_temp.act(me);
  begin update lili_items set price = 150 where id = i; perform pg_temp.ok('the AED 200 minimum is enforced', false);
  exception when others then perform pg_temp.ok('the AED 200 minimum is enforced', true); end;
  execute 'reset role';
  insert into lili_conversations(buyer_uid, seller_uid, item_id, shop_id) values (b1, me, i, s) returning id into cv;
  -- ── meeting in person is removed (migration 39) ─────────────────────────
  perform pg_temp.act(b1);
  begin insert into lili_meets(conversation_id, place_key, meet_at) values (cv, 'mall', now() + interval '1 day');
    perform pg_temp.ok('no meet plan can be proposed', false);
  exception when object_not_in_prerequisite_state then perform pg_temp.ok('no meet plan can be proposed', true); end;
  perform pg_temp.act(null);
  begin select count(*) into n from lili_reviews; perform pg_temp.ok('reviews are not readable directly', false);
  exception when others then perform pg_temp.ok('reviews are not readable directly', true); end;
  execute 'reset role';

  -- ── saved searches ──────────────────────────────────────────────────────
  perform pg_temp.act(b2);
  j := lili_save_search('silk scarf', 700, null); ss := (j ->> 'id')::uuid;
  perform pg_temp.ok('a search can be saved', ss is not null);
  begin j := lili_save_search('x'); perform pg_temp.ok('a one-letter search is refused', false);
  exception when others then perform pg_temp.ok('a one-letter search is refused', true); end;
  execute 'reset role';
  update lili_saved_searches set last_seen_at = now() - interval '1 hour' where id = ss;
  insert into lili_items(owner_uid, shop_id, title, brand, price, category) values (me, s, 'Hermès silk scarf', 'Hermès', 600, 'Accessories');
  insert into lili_items(owner_uid, shop_id, title, brand, price, category) values (me, s, 'Hermès silk scarf large', 'Hermès', 900, 'Accessories');
  perform pg_temp.act(b2);
  perform pg_temp.ok('new matches are counted, the over-budget one is not',
    (select new_count from lili_my_saved_searches() where id = ss) = 1);
  execute 'reset role';

  -- ── crash reports ───────────────────────────────────────────────────────
  perform pg_temp.act(null);
  perform lili_report_error('crash', 'audit test crash', null, 'test', '0.0.0', 'ci');
  perform lili_report_error('nonsense', 'ignored');
  begin select count(*) into n from lili_client_errors; perform pg_temp.ok('crash reports are not readable', false);
  exception when others then perform pg_temp.ok('crash reports are not readable', true); end;
  execute 'reset role';
  perform pg_temp.ok('a crash report is stored, an unknown kind is not',
    (select count(*) from lili_client_errors where message = 'audit test crash') = 1
    and not exists (select 1 from lili_client_errors where message = 'ignored'));

  -- ── data export covers the new data ─────────────────────────────────────
  perform pg_temp.act(b2);
  j := lili_export_me();
  perform pg_temp.ok('export includes saved searches and reviews',
    j ? 'saved_searches' and j ? 'reviews_you_wrote' and j ? 'reviews_about_you');
  execute 'reset role';

  -- ── strikes are private; one read policy on follows ─────────────────────
  perform pg_temp.ok('a shop''s strike count is not readable by clients',
    not has_column_privilege('anon', 'public.lili_shops', 'strikes', 'select')
    and not has_column_privilege('authenticated', 'public.lili_shops', 'strikes', 'select')
    and has_column_privilege('anon', 'public.lili_shops', 'name', 'select'));
  perform pg_temp.ok('follows has one read policy (pending SQL item 5)',
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'lili_follows'
       and cmd in ('SELECT', 'ALL')) = 1);

  -- ── appeals (migration 31) ───────────────────────────────────────────────
  insert into lili_items(owner_uid, shop_id, title, brand, price, category)
    values (me, s, 'Appealed linen shirt', 'Toteme', 600, 'Tops') returning id into i3;
  perform pg_temp.act(b2);
  insert into lili_moderation_cases(kind, target_item_id, reasons, detail)
    values ('listing', i3, array['counterfeit'], 'Looks fake to me');
  execute 'reset role';
  select id into cs from lili_moderation_cases where target_item_id = i3;
  select coalesce(strikes, 0) into k0 from lili_shops where id = s;
  perform pg_temp.mod(b1);
  j := lili_moderation_decide(cs, 'remove_listing', 'Logo stitching does not match the brand.');
  perform pg_temp.act(me);
  select count(*) into n from lili_decisions_about_me() d where d.id = cs and d.can_appeal;
  perform pg_temp.ok('the seller sees the decision about her and that she can appeal', n = 1);
  perform pg_temp.act(b2);
  select count(*) into n from lili_decisions_about_me() d where d.id = cs;
  perform pg_temp.ok('the reporter does not see it as a decision about her', n = 0);
  begin perform lili_moderation_appeal(cs, 'It is genuine, I have the receipt.');
        perform pg_temp.ok('only the person sanctioned can appeal', false);
  exception when others then perform pg_temp.ok('only the person sanctioned can appeal', true); end;
  perform pg_temp.act(me);
  j := lili_moderation_appeal(cs, 'It is genuine, I have the receipt and the card.');
  perform pg_temp.ok('the seller can appeal within 14 days', j ->> 'state' = 'appealed');
  perform pg_temp.mod(b1);
  begin perform lili_moderation_resolve_appeal(cs, true, 'Receipt checked and it matches.');
        perform pg_temp.ok('the moderator who decided cannot decide the appeal', false);
  exception when others then perform pg_temp.ok('the moderator who decided cannot decide the appeal', true); end;
  perform pg_temp.mod(b2);
  j := lili_moderation_resolve_appeal(cs, true, 'Receipt checked and it matches the piece.');
  execute 'reset role';
  select coalesce(strikes, 0) into k1 from lili_shops where id = s;
  perform pg_temp.ok('an overturned appeal removes the strike and restores the listing',
    k1 = k0 and (select status from lili_items where id = i3) = 'live'
    and (select state from lili_moderation_cases where id = cs) = 'overturned');
  perform pg_temp.ok('the seller is told the appeal succeeded',
    exists (select 1 from lili_notifications where user_id = me and title = 'Your appeal succeeded'));

  -- ── no client role holds TRUNCATE (it skips row-level security) ──────────
  perform pg_temp.ok('no client role can truncate a lili table',
    not exists (select 1 from information_schema.role_table_grants
                 where table_schema = 'public' and table_name like 'lili\_%'
                   and grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')));

  -- ── delivery and held payment (migration 33) ────────────────────────────
  insert into lili_items(owner_uid, shop_id, title, brand, price, category, delivery, parcel_size, bundling)
    values (me, s, 'Delivery test skirt', 'Ganni', 400, 'Skirts', array['meet','aramex','dhl'], 'S', true) returning id into d1;
  insert into lili_items(owner_uid, shop_id, title, brand, price, category, delivery, parcel_size, bundling)
    values (me, s, 'Delivery test coat', 'Toteme', 900, 'Jackets', array['aramex','dhl'], 'L', true) returning id into d2;
  perform pg_temp.act(b1);
  j := lili_delivery_quote(array[d1, d2], 'UAE');
  perform pg_temp.ok('a bundle is quoted only the couriers both pieces allow, at the larger parcel',
    jsonb_array_length(j) = 2 and not exists (select 1 from jsonb_array_elements(j) x where x->>'method' = 'meet')
    and (select (x->>'fee')::numeric from jsonb_array_elements(j) x where x->>'method' = 'aramex') = 40);
  perform pg_temp.ok('a listing cannot offer meeting in person: an old app sending it has it taken out',
    (select delivery from lili_items where id = d1) = array['aramex','dhl']);
  execute 'reset role';
  insert into lili_items(owner_uid, shop_id, title, brand, price, category, delivery)
    values (me, s, 'Courier default test', 'Ganni', 300, 'Skirts', array['meet']) returning id into d3;
  perform pg_temp.ok('a listing left with no courier gets the default pair',
    (select delivery from lili_items where id = d3) = array['aramex','emirates_post']);
  perform pg_temp.ok('a new listing defaults to couriers, not a meet',
    (select column_default from information_schema.columns where table_schema = 'public'
       and table_name = 'lili_items' and column_name = 'delivery') like '%aramex,emirates_post%');
  perform pg_temp.act(b1);
  j := lili_create_order(array[d1], 'aramex', 'UAE', '{"name":"Test Buyer","phone":"0500000000","line1":"Street 1","city":"Dubai","country":"AE"}');
  perform pg_temp.ok('no order while payments are switched off', j->>'reason' = 'payments_off');
  execute 'reset role';
  update lili_settings set value = jsonb_set(value, '{enabled}', 'true') where key = 'payments';
  perform pg_temp.act(b1);
  begin j := lili_create_order(array[d1], 'aramex', 'UAE', '{"name":"Test Buyer"}');
        perform pg_temp.ok('a courier order needs a full address', false);
  exception when others then perform pg_temp.ok('a courier order needs a full address', true); end;
  j := lili_create_order(array[d1, d2], 'aramex', 'UAE',
         '{"name":"Test Buyer","phone":"0500000000","line1":"Street 1","city":"Dubai","country":"AE"}');
  ord := (j->>'order_id')::uuid;
  perform pg_temp.ok('a bundle order totals the pieces and one delivery fee', (j->>'total')::numeric = 1340);
  perform pg_temp.act(b2);
  begin j := lili_create_order(array[d1], 'aramex', 'UAE',
         '{"name":"Other","phone":"0500000001","line1":"Street 2","city":"Dubai","country":"AE"}');
        perform pg_temp.ok('two buyers cannot buy the same piece', false);
  exception when others then perform pg_temp.ok('two buyers cannot buy the same piece', true); end;
  begin perform lili_order_paid(ord, 'pi_test');
        perform pg_temp.ok('only the payment provider can mark an order paid', false);
  exception when others then perform pg_temp.ok('only the payment provider can mark an order paid', true); end;
  perform pg_temp.act(me);
  perform pg_temp.ok('the seller does not see the address before payment',
    (select x->'ship_to' from jsonb_array_elements(lili_my_orders('seller')) x where (x->>'id')::uuid = ord) = 'null'::jsonb);
  execute 'reset role';
  perform lili_order_paid(ord, 'pi_test');
  perform pg_temp.ok('paid: the money is held and the pieces are sold',
    (select state || '/' || money_state from lili_orders where id = ord) = 'paid/held'
    and (select count(*) from lili_items where id in (d1, d2) and status = 'sold') = 2);
  perform pg_temp.act(me);
  perform pg_temp.ok('the seller sees the address once it is paid',
    (select x->'ship_to'->>'city' from jsonb_array_elements(lili_my_orders('seller')) x where (x->>'id')::uuid = ord) = 'Dubai');
  perform pg_temp.ok('provider references never reach the app',
    not (lili_my_orders('seller')::text like '%pi_test%'));
  begin perform lili_order_shipped(ord, null); perform pg_temp.ok('a courier order needs a tracking number', false);
  exception when others then perform pg_temp.ok('a courier order needs a tracking number', true); end;
  perform pg_temp.act(b2);
  begin perform lili_order_shipped(ord, 'TRK1'); perform pg_temp.ok('only the seller can mark it sent', false);
  exception when others then perform pg_temp.ok('only the seller can mark it sent', true); end;
  perform pg_temp.act(me);
  j := lili_order_shipped(ord, 'AWB123456');
  perform pg_temp.act(b1);
  begin j := lili_leave_order_review(ord, 5, 'Too early');
        perform pg_temp.ok('no review before the order completes', false);
  exception when others then perform pg_temp.ok('no review before the order completes', true); end;
  j := lili_order_received(ord);
  execute 'reset role';
  perform pg_temp.ok('item received releases the payment to the seller',
    (select state || '/' || money_state from lili_orders where id = ord) = 'completed/payout_due');
  perform pg_temp.act(me);
  perform pg_temp.ok('the wallet shows it releasing', (lili_my_wallet()->>'releasing')::numeric = 1340);

  -- ── order reviews and the order's personal data (migration 36) ──────────
  perform pg_temp.act(b2);
  begin j := lili_leave_order_review(ord, 5, 'Not my order');
        perform pg_temp.ok('only the buyer and the seller can review an order', false);
  exception when others then perform pg_temp.ok('only the buyer and the seller can review an order', true); end;
  perform pg_temp.act(b1);
  j := lili_leave_order_review(ord, 5, 'Arrived as described');
  perform pg_temp.ok('the first review of an order stays hidden until the other side reviews', (j->>'visible')::boolean = false);
  perform pg_temp.ok('a hidden order review is not on the shop',
    not exists (select 1 from lili_shop_reviews(s, 50) x where x.body = 'Arrived as described'));
  begin j := lili_leave_order_review(ord, 4, 'Again');
        perform pg_temp.ok('an order is reviewed once per side', false);
  exception when others then perform pg_temp.ok('an order is reviewed once per side', true); end;
  perform pg_temp.ok('my orders says I have reviewed it',
    (select (x->>'reviewed')::boolean and (x->>'review_open')::boolean
       from jsonb_array_elements(lili_my_orders('buyer')) x where (x->>'id')::uuid = ord));
  perform pg_temp.act(me);
  j := lili_leave_order_review(ord, 4, 'Paid quickly');
  perform pg_temp.ok('once both have reviewed, both reviews show', (j->>'visible')::boolean = true);
  perform pg_temp.act(null);
  perform pg_temp.ok('a visible order review counts on the shop and in its rating',
    exists (select 1 from lili_shop_reviews(s, 50) x where x.body = 'Arrived as described')
    and exists (select 1 from lili_reputations() r where r.shop_id = s and r.reviews >= 1));
  begin perform lili_leave_order_review(ord, 5, 'anon');
        perform pg_temp.ok('a signed-out visitor cannot review an order', false);
  exception when others then perform pg_temp.ok('a signed-out visitor cannot review an order', true); end;
  perform pg_temp.ok('order reviews are not readable directly',
    not has_table_privilege('authenticated', 'public.lili_order_reviews', 'select')
    and not has_table_privilege('anon', 'public.lili_order_reviews', 'select'));
  perform pg_temp.act(b1);
  perform pg_temp.ok('the buyer''s export has the order and her own delivery address',
    (select x->'delivery_address'->>'city' from jsonb_array_elements(lili_export_me()->'orders') x where (x->>'id')::uuid = ord) = 'Dubai');
  perform pg_temp.act(me);
  perform pg_temp.ok('the seller''s export has the order but not the buyer''s address',
    exists (select 1 from jsonb_array_elements(lili_export_me()->'orders') x where (x->>'id')::uuid = ord)
    and (select x->'delivery_address' from jsonb_array_elements(lili_export_me()->'orders') x where (x->>'id')::uuid = ord) = 'null'::jsonb);
  execute 'reset role';
  update lili_orders set completed_at = now() - interval '121 days' where id = ord;
  perform lili.orders_tick();
  perform pg_temp.ok('an address is cut back to the country 120 days after the order ends',
    (select ship_to from lili_orders where id = ord) = '{"country":"AE"}'::jsonb);
  update lili_orders set ship_to = '{"name":"Test Buyer","phone":"0500000000","line1":"Street 1","city":"Dubai","country":"AE"}'
   where id = ord;
  update lili_orders set buyer_uid = null where id = ord;   -- what erasing her account does
  perform pg_temp.ok('erasing the buyer removes her address from the order and keeps the record',
    (select ship_to from lili_orders where id = ord) = '{"country":"AE"}'::jsonb);

  -- not sent in time: refunded and back on sale
  execute 'reset role';
  update lili_items set status = 'live' where id = d1;
  perform pg_temp.act(b1);
  begin j := lili_create_order(array[d1], 'meet', 'UAE', null);
    perform pg_temp.ok('no order can be created for a meet', coalesce((j->>'ok')::boolean, false) = false);
  exception when others then perform pg_temp.ok('no order can be created for a meet', true); end;
  j := lili_create_order(array[d1], 'aramex', 'UAE', '{"name":"Test Buyer","phone":"0500000000","line1":"Street 1","city":"Dubai","country":"AE"}');
  ord2 := (j->>'order_id')::uuid;
  execute 'reset role';
  perform lili_order_paid(ord2, 'pi_test2');
  update lili_orders set ship_by = now() - interval '1 minute' where id = ord2;
  perform lili.orders_tick();
  perform pg_temp.ok('an order not sent within 4 days is refunded and the piece goes back on sale',
    (select state || '/' || money_state from lili_orders where id = ord2) = 'refunded/refund_due'
    and (select status from lili_items where id = d1) = 'live');

  -- a problem keeps the money held
  perform pg_temp.act(b1);
  j := lili_create_order(array[d1], 'aramex', 'UAE', '{"name":"Test Buyer","phone":"0500000000","line1":"Street 1","city":"Dubai","country":"AE"}');
  ord2 := (j->>'order_id')::uuid;
  execute 'reset role';
  perform lili_order_paid(ord2, 'pi_test3');
  perform pg_temp.act(b1);
  j := lili_order_issue(ord2, 'not_as_described', 'The colour is different from the photos.');
  execute 'reset role';
  update lili_orders set release_at = now() - interval '1 minute' where id = ord2;
  perform lili.orders_tick();
  perform pg_temp.ok('a reported problem keeps the money held past the release date',
    (select state || '/' || money_state from lili_orders where id = ord2) = 'disputed/held');
  perform pg_temp.ok('clients cannot read orders directly',
    not has_table_privilege('authenticated', 'public.lili_orders', 'select')
    and not has_table_privilege('anon', 'public.lili_orders', 'select'));

  -- ── holiday mode (migration 37) ─────────────────────────────────────────
  execute 'reset role';
  insert into lili_items(owner_uid, shop_id, title, brand, price, category)
    values (me, s, 'Away test silk scarf', 'Hermès', 600, 'Accessories') returning id into ho;
  insert into lili_offers(item_id, buyer_uid, seller_uid, amount) values (ho, b1, me, 500) returning id into ao;
  perform pg_temp.act(me);
  begin update lili_shops set away_until = now() + interval '120 days' where id = s;
        perform pg_temp.ok('away is capped at 90 days', false);
  exception when others then perform pg_temp.ok('away is capped at 90 days', true); end;
  update lili_shops set away_until = now() + interval '10 days', away_note = '  Back after Eid  ' where id = s;
  perform pg_temp.act(null);
  perform pg_temp.ok('anyone can see she is away, and her note',
    (select away_until > now() and away_note = 'Back after Eid' from lili_shops where id = s));
  perform pg_temp.ok('an away shop is left out of search',
    not exists (select 1 from lili_search('away test silk scarf', 20) x where x.id = ho));
  perform pg_temp.act(b1);
  begin insert into lili_offers(item_id, buyer_uid, seller_uid, amount) values (ho, b1, me, 450);
        perform pg_temp.ok('a buyer cannot make a new offer while she is away', false);
  exception when others then perform pg_temp.ok('a buyer cannot make a new offer while she is away', true); end;
  perform pg_temp.act(me);
  j := lili_counter_offer(ao, 550, 'Back soon, this is my best');
  perform pg_temp.ok('she can still counter an offer made before she left', (j->>'ok')::boolean is not false);
  perform pg_temp.act(b1);
  update lili_shops set away_until = null where id = s;
  perform pg_temp.act(null);
  perform pg_temp.ok('nobody else can change her away date', (select away_until > now() from lili_shops where id = s));
  perform pg_temp.act(me);
  update lili_shops set away_until = now() - interval '1 minute' where id = s;
  perform pg_temp.ok('a date already past means she is back, and the note goes',
    (select away_until is null and away_note is null from lili_shops where id = s));
  perform pg_temp.act(null);
  perform pg_temp.ok('back: her piece is in search again',
    exists (select 1 from lili_search('away test silk scarf', 20) x where x.id = ho));
  execute 'reset role';

  -- ── app health, for moderators (migration 38) ───────────────────────────
  perform pg_temp.act(b1);
  begin j := lili_app_health(); perform pg_temp.ok('app health is for moderators only', false);
  exception when others then perform pg_temp.ok('app health is for moderators only', true); end;
  perform pg_temp.mod(b1);
  j := lili_app_health();
  perform pg_temp.ok('a moderator sees crashes, every lili job, the waiting work and the orders',
    j ? 'crashes_24h' and jsonb_array_length(j->'jobs') >= 3 and j->'waiting' ? 'appeals' and j->'orders' ? 'payout_due');
  execute 'reset role';

  -- ── a parcel sent and received in Messages (migration 40) ───────────────
  perform pg_temp.act(b1);
  begin perform lili_parcel_sent(cv, 'aramex', '34567890123'); perform pg_temp.ok('only the seller can say a parcel was sent', false);
  exception when insufficient_privilege then perform pg_temp.ok('only the seller can say a parcel was sent', true); end;
  perform pg_temp.act(me);
  begin perform lili_parcel_sent(cv, 'aramex', 'x'); perform pg_temp.ok('a parcel needs a real tracking number', false);
  exception when invalid_parameter_value then perform pg_temp.ok('a parcel needs a real tracking number', true); end;
  j := lili_parcel_sent(cv, 'aramex', '3456 7890 123'); pid := (j->>'parcel_id')::uuid;
  begin perform lili_parcel_sent(cv, 'dhl', '1234567890'); perform pg_temp.ok('one parcel on its way per conversation', false);
  exception when unique_violation then perform pg_temp.ok('one parcel on its way per conversation', true); end;
  perform pg_temp.act(b2);
  perform pg_temp.ok('nobody outside the conversation sees its parcels', (select count(*) from lili_conversation_parcels(cv)) = 0);
  begin perform lili_parcel_received(pid); perform pg_temp.ok('only the buyer can say it arrived', false);
  exception when insufficient_privilege then perform pg_temp.ok('only the buyer can say it arrived', true); end;
  perform pg_temp.act(b1);
  begin perform lili_parcel_received(pid); perform pg_temp.ok('a parcel cannot arrive the minute it is sent', false);
  exception when object_not_in_prerequisite_state then perform pg_temp.ok('a parcel cannot arrive the minute it is sent', true); end;
  begin perform lili_leave_parcel_review(pid, 5); perform pg_temp.ok('no review before the buyer has it', false);
  exception when invalid_parameter_value then perform pg_temp.ok('no review before the buyer has it', true); end;
  execute 'reset role';
  update lili_parcels set sent_at = now() - interval '2 hours' where id = pid;
  perform pg_temp.act(b1);
  j := lili_parcel_received(pid);
  perform pg_temp.ok('the buyer sees the parcel, normalised, with its review open',
    (select tracking || '/' || you_are || '/' || review_open from lili_conversation_parcels(cv) limit 1) = '34567890123/buyer/true');
  j := lili_leave_parcel_review(pid, 5, 'Parcel arrived as described');
  perform pg_temp.ok('a parcel review is hidden until both have reviewed', (j->>'visible')::boolean = false);
  begin perform lili_leave_parcel_review(pid, 4); perform pg_temp.ok('one parcel review per person', false);
  exception when unique_violation then perform pg_temp.ok('one parcel review per person', true); end;
  perform pg_temp.act(null);
  perform pg_temp.ok('a one-sided parcel review is not public',
    not exists (select 1 from lili_shop_reviews(s, 50) x where x.body = 'Parcel arrived as described'));
  begin perform lili_parcel_sent(cv, 'aramex', '34567890123'); perform pg_temp.ok('signed out, the parcel functions refuse', false);
  exception when insufficient_privilege then perform pg_temp.ok('signed out, the parcel functions refuse', true); end;
  perform pg_temp.act(me);
  j := lili_leave_parcel_review(pid, 5, 'Quick to pay');
  perform pg_temp.act(null);
  perform pg_temp.ok('a shop''s delivered parcels are a public count', lili_shop_parcels_done(s) = 1);
  perform pg_temp.ok('both reviewed: the parcel review is public and counts in the rating',
    exists (select 1 from lili_shop_reviews(s, 50) x where x.body = 'Parcel arrived as described')
    and exists (select 1 from lili_reputations() r where r.shop_id = s and r.reviews >= 1));
  perform pg_temp.ok('clients cannot read parcels or parcel reviews directly',
    not has_table_privilege('anon', 'public.lili_parcels', 'select')
    and not has_table_privilege('authenticated', 'public.lili_parcels', 'select')
    and not has_table_privilege('authenticated', 'public.lili_parcel_reviews', 'select'));
  perform pg_temp.act(b1);
  j := lili_export_me();
  perform pg_temp.ok('her data export carries her parcels and the parcel reviews she wrote',
    jsonb_array_length(j->'parcels') = 1 and jsonb_array_length(j->'parcel_reviews_you_wrote') = 1);
  execute 'reset role';

  select count(*), string_agg(label, '; ') filter (where not ok) into total, bad from _r;
  if bad is null then
    raise exception 'ALL_PASSED %', total;
  else
    raise exception 'FAILED %', bad;
  end if;
end $$;
