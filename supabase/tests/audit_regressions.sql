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
  insert into lili_meets(conversation_id, item_id, proposed_by, place_key, meet_at, state)
    values (cv, i, b1, 'mall', now() - interval '1 day', 'confirmed') returning id into mt;
  begin insert into lili_meets(conversation_id, item_id, proposed_by, place_key, meet_at) values (cv, i, b1, 'mall', now() + interval '1 day');
    perform pg_temp.ok('one live meet plan per conversation', false);
  exception when unique_violation then perform pg_temp.ok('one live meet plan per conversation', true); end;

  -- ── reviews after a meet ────────────────────────────────────────────────
  perform pg_temp.act(b1);
  j := lili_leave_review(mt, 5, 'Lovely, on time.');
  perform pg_temp.ok('a review is hidden until both have reviewed', (j ->> 'visible')::boolean = false);
  begin j := lili_leave_review(mt, 4); perform pg_temp.ok('one review per person per meet', false);
  exception when others then perform pg_temp.ok('one review per person per meet', true); end;
  perform pg_temp.act(b2);
  begin j := lili_leave_review(mt, 1); perform pg_temp.ok('only the two who met can review', false);
  exception when others then perform pg_temp.ok('only the two who met can review', true); end;
  perform pg_temp.act(me);
  j := lili_leave_review(mt, 4, 'Easy buyer');
  perform pg_temp.act(null);
  perform pg_temp.ok('both reviewed: the shop review is public', (select count(*) from lili_shop_reviews(s)) = 1);
  perform pg_temp.ok('the reputation counts it', (select reviews from lili_reputations() where shop_id = s) = 1);
  perform pg_temp.ok('completed meets are a public count', lili_shop_meets_done(s) = 1);
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

  select count(*), string_agg(label, '; ') filter (where not ok) into total, bad from _r;
  if bad is null then
    raise exception 'ALL_PASSED %', total;
  else
    raise exception 'FAILED %', bad;
  end if;
end $$;
