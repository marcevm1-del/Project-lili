-- ─────────────────────────────────────────────────────────────────────────────
--  ERASURE BOUNDARY PROBE
--
--  Paste into the Supabase SQL editor (service role). Creates two throwaway
--  accounts, erases each through lili_erase_me(), reports what happened, and
--  deletes them again. Nothing real is touched.
--
--  What it is for. This database holds two applications on one auth.users.
--  Before v2.11.6, lili_erase_me() ended with `delete from auth.users`, and
--  nine of the other application's tables cascade from that row — so account
--  deletion in lili either destroyed an unrelated product's data or, where a
--  billing consent record existed, aborted with check_violation and made the
--  right to erasure undeliverable. Both passed every client-side check.
--
--  Expected, after the fix:
--    shared.ran               = true
--    shared.signin_kept       = true      (the sign-in is not ours to delete)
--    shared.other_app_intact  = true
--    shared.receipt_says_kept = false     (sign_in.removed is false, and said so)
--    only.signin_gone         = true      (lili-only account fully removed)
--    cleanup                  = true
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function pg_temp.lili_legal_probe()
returns table(k text, v text) language plpgsql as $p$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); r jsonb;
begin
  insert into auth.users (id,instance_id,aud,role,email,encrypted_password,
                          email_confirmed_at,created_at,updated_at)
  values (a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          'legal-probe-'||left(a::text,8)||'@lili-probe.invalid','',now(),now(),now());
  insert into billing_consents (user_id,tier,interval,price_cents,disclosure_version,disclosure_text)
  values (a,'odyssey','monthly',900,'probe','probe row written only to test account deletion');
  perform set_config('request.jwt.claims',
    json_build_object('sub',a::text,'role','authenticated','is_anonymous',false)::text,true);
  begin
    r := public.lili_erase_me();
    k := 'shared.ran';               v := 'true'; return next;
    k := 'shared.signin_kept';       v := (exists(select 1 from auth.users where id=a))::text; return next;
    k := 'shared.other_app_intact';  v := (exists(select 1 from billing_consents where user_id=a))::text; return next;
    k := 'shared.receipt_says_kept'; v := (r->'sign_in'->>'removed'); return next;
  exception when others then
    k := 'shared.ran'; v := 'false: '||SQLERRM; return next;
  end;

  perform set_config('request.jwt.claims',null,true);
  insert into auth.users (id,instance_id,aud,role,email,encrypted_password,
                          email_confirmed_at,created_at,updated_at)
  values (b,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          'legal-probe-'||left(b::text,8)||'@lili-probe.invalid','',now(),now(),now());
  perform set_config('request.jwt.claims',
    json_build_object('sub',b::text,'role','authenticated','is_anonymous',false)::text,true);
  begin
    r := public.lili_erase_me();
    k := 'only.signin_gone';          v := (not exists(select 1 from auth.users where id=b))::text; return next;
    k := 'only.receipt_says_removed'; v := (r->'sign_in'->>'removed'); return next;
  exception when others then
    k := 'only.signin_gone'; v := 'false: '||SQLERRM; return next;
  end;

  perform set_config('request.jwt.claims',null,true);
  delete from billing_consents where user_id in (a,b);
  delete from auth.users where id in (a,b);
  k := 'cleanup'; v := (select (count(*)=0)::text from auth.users where id in (a,b)); return next;
end $p$;

select * from pg_temp.lili_legal_probe();
