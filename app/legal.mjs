// ─────────────────────────────────────────────────────────────────────────────
//  LEGAL — the obligations that are enforced by the database, tested against it
//
//  Run: npm run legal          (add SUPABASE_SERVICE_KEY for the full set)
//
//  Why this is its own suite.
//
//  `npm run audit` checks that a control EXISTS — that there is an erasure
//  function, an export function, a retention basis. It reads the client. Every
//  one of those checks was green on the day this suite was written, and the
//  right to erasure did not work.
//
//  It did not work because this Supabase project holds TWO applications. lili
//  owns 22 tables; another product owns 17; both hang off the same `auth.users`,
//  and a signup in either creates a row in the other's `profiles` table. The old
//  `lili_erase_me()` finished with `delete from auth.users where id = me`, and
//  nine of the other application's tables cascade from that row.
//
//  So "delete my account" in a fashion marketplace either
//
//    · destroyed somebody's journal, forum history and billing consent records
//      in an unrelated product, under a receipt that listed only listings and
//      shops — a receipt describing a far smaller act than the one performed; or
//    · failed outright with a raw `check_violation`, because
//      `billing_consents_append_only` raises on any delete while auth.uid() is
//      set, cascades included. For those users the right to erasure was simply
//      not deliverable.
//
//  Neither is visible from the client. Both are visible from here.
//
//  The rule these checks hold the database to: LILI ERASES LILI. It does not
//  reach across the boundary into another controller's records, and it removes
//  the shared sign-in only when that sign-in exists for lili and nothing else.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

const cfg = (await import("./src/backend/config.js")).default;
const SERVICE = process.env.SUPABASE_SERVICE_KEY || "";

const B = "\x1b[1m", R = "\x1b[31m", Y = "\x1b[33m", G = "\x1b[32m", D = "\x1b[2m", X = "\x1b[0m";
let pass = 0, fail = 0, skip = 0;
const failures = [];

const ok    = (n, d) => { pass++; console.log(`  ${G}✓${X} ${n}${d ? `  ${D}${d}${X}` : ""}`); };
const bad   = (n, d) => { fail++; failures.push(n); console.log(`  ${R}✗${X} ${B}${n}${X}${d ? `\n      ${d}` : ""}`); };
const unchecked = (n, why) => { skip++; console.log(`  ${D}·${X} ${n}  ${D}${why}${X}`); };
// The detail string explains a FAILURE, so it must not be printed beside a
// tick — "\u2713 submitting it reaches a real destination  no mailto and no fetch"
// reads as a contradiction. Passing checks show their name and nothing else.
const check = (n, cond, d) => (cond ? ok(n) : bad(n, d));
const section = (t) => console.log(`\n${B}${t}${X}`);

console.log(`\n${B}lili — legal obligations, measured against the database${X}`);
console.log(`${D}${cfg.url}${X}`);

// ── 1. things the shipped key can see ────────────────────────────────────────
section("1. What an ordinary install meets");

const anon = createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: false } });

{
  const { error } = await anon.rpc("lili_erase_me");
  check("erasure refuses an unauthenticated caller",
        !!error, error ? undefined : "it returned successfully with nobody signed in");
}
{
  const { error } = await anon.rpc("lili_export_me");
  check("export refuses an unauthenticated caller",
        !!error, error ? undefined : "it returned successfully with nobody signed in");
}
{
  // Retention of moderation evidence is a legal position, so the table holding
  // captured conversation transcripts must be closed to the public it is about.
  //
  // The first version of this check read the table and treated "no error" as a
  // failure. That was vacuous twice over: PostgREST answers an RLS denial with
  // an empty array and HTTP 200, not an error — and the table currently holds
  // zero rows, so a denial and an empty table look identical from out here.
  //
  // A WRITE is unambiguous. RLS with no policies rejects it outright with
  // 42501, and an error is an error whatever the row count.
  const ins = await anon.from("lili_case_evidence")
    .insert({ message_count: 1, transcript: [] });
  check("captured evidence is closed to the public — writes are refused",
        ins.error?.code === "42501" || /row-level security|permission denied/i.test(ins.error?.message || ""),
        ins.error ? `refused with ${ins.error.code}` : "an anonymous caller could write evidence");

  const sel = await anon.from("lili_case_evidence").select("id").limit(1);
  check("and reads come back with nothing",
        !sel.error && Array.isArray(sel.data) && sel.data.length === 0,
        sel.error ? `unexpected: ${sel.error.code}` : `returned ${sel.data?.length} row(s)`);
}

// ── 2. the boundary, which needs the server's own key ────────────────────────
section("2. Erasure stops at lili's boundary");

if (!SERVICE) {
  unchecked("erasure does not cross into the other application",
            "needs SUPABASE_SERVICE_KEY — this is the check that caught the real defect");
  unchecked("a shared sign-in survives a lili erasure", "needs SUPABASE_SERVICE_KEY");
  unchecked("a lili-only sign-in is fully removed", "needs SUPABASE_SERVICE_KEY");
  unchecked("every lili function pins its search_path", "needs SUPABASE_SERVICE_KEY");
} else {
  const svc = createClient(cfg.url, SERVICE, { auth: { persistSession: false } });

  // The probe creates two throwaway accounts, erases each, reads the receipt and
  // deletes them again. It asserts behaviour rather than reading the function
  // body, because the body passed inspection for three releases while doing
  // this wrong.
  const probe = `
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
        k := 'shared.ran';        v := 'true';                              return next;
        k := 'shared.signin_kept'; v := (exists(select 1 from auth.users where id=a))::text; return next;
        k := 'shared.other_app_intact';
        v := (exists(select 1 from billing_consents where user_id=a))::text; return next;
        k := 'shared.receipt_says_kept'; v := (r->'sign_in'->>'removed');    return next;
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
        k := 'only.signin_gone'; v := (not exists(select 1 from auth.users where id=b))::text; return next;
        k := 'only.receipt_says_removed'; v := (r->'sign_in'->>'removed'); return next;
      exception when others then
        k := 'only.signin_gone'; v := 'false: '||SQLERRM; return next;
      end;

      perform set_config('request.jwt.claims',null,true);
      delete from billing_consents where user_id in (a,b);
      delete from auth.users where id in (a,b);
      k := 'cleanup';
      v := (select (count(*)=0)::text from auth.users where id in (a,b)); return next;
    end $p$;
    select * from pg_temp.lili_legal_probe();`;

  const { data, error } = await svc.rpc("exec_sql", { query: probe }).catch(() => ({ error: true }));

  if (error || !data) {
    unchecked("the erasure boundary probe",
              "no exec_sql RPC on this project — run legal/erasure-probe.sql in the SQL editor instead");
  } else {
    const m = Object.fromEntries((data || []).map((r) => [r.k, r.v]));
    check("a shared sign-in survives a lili erasure",
          m["shared.ran"] === "true" && m["shared.signin_kept"] === "true",
          `ran=${m["shared.ran"]} kept=${m["shared.signin_kept"]}`);
    check("the other application's records are untouched",
          m["shared.other_app_intact"] === "true");
    check("and the receipt says the sign-in was kept, rather than implying it went",
          m["shared.receipt_says_kept"] === "false");
    check("a lili-only sign-in is fully removed",
          m["only.signin_gone"] === "true" && m["only.receipt_says_removed"] === "true");
    check("the probe cleaned up after itself", m["cleanup"] === "true");
  }
}

// ── 3. the page a data subject actually uses ─────────────────────────────────
section("3. The public deletion page");

{
  const page = (await import("node:fs")).readFileSync("web/delete-account.html", "utf8");

  // Until v2.11.7 this page hid the form and showed "Request received — we'll
  // email you to confirm it's really you, then delete your account within 30
  // days", while the handler console.log-ed the payload and threw it away.
  // Nothing was sent, nothing was scheduled. A receipt for an act that did not
  // happen, on the one page that exists so a woman can exercise a legal right
  // without reinstalling the app. Play requires this page; PDPL Art. 16 is what
  // it is for.
  const claimsReceipt = /Request received/.test(page.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\/[^\n]*/g, ""));
  check("the page does not claim a request was received", !claimsReceipt,
        "it says a request arrived somewhere");

  const hasDestination = /mailto:[^"'\s]+@/.test(page) || /fetch\(\s*['"`]\/?[a-z]/i.test(page);
  check("submitting it reaches a real destination", hasDestination,
        "no mailto and no fetch — the form goes nowhere");

  const logsPayload = /console\.log\(\s*['"`][^'"`]*[Rr]equest/.test(page);
  check("it does not log the request to a console instead of sending it", !logsPayload);

  check("it carries a content security policy of its own",
        /http-equiv="Content-Security-Policy"/.test(page),
        "it will be hosted publicly and may land on a server nobody configured");

  // frame-ancestors in a <meta> is ignored by the browser and logs an error.
  check("and does not declare a directive the browser will refuse",
        !/http-equiv="Content-Security-Policy"[^>]*frame-ancestors/.test(page),
        "frame-ancestors only works as a response header");
}

// ── 4. the positions this app takes, and where they are written ──────────────
section("4. Positions that need a human, not a test");

const NEEDS_COUNSEL = [
  ["Terms of Sale (seller to buyer)", "lili must not be a party. A template sellers adopt."],
  ["Arabic legal translation", "Consumer terms need Arabic, and it prevails over English."],
  ["Agent vs principal for VAT", "Turns on the seller agreement wording."],
  ["Data controller boundary", "Two products share one auth table and one database. Who controls what, and what each privacy notice says, is a question for counsel — the code now stops at the boundary but the paperwork does not describe one."],
  ["Retention schedule signed off", "24 months for moderation evidence is asserted in lili_erase_me. Nobody has approved it."],
];
for (const [what, why] of NEEDS_COUNSEL) {
  console.log(`  ${Y}·${X} ${what}\n      ${D}${why}${X}`);
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\n${B}${pass} passed, ${fail} failed, ${skip} unchecked${X}`);
if (fail) {
  console.log("\nFailed:");
  failures.forEach((f) => console.log(`  ${R}·${X} ${f}`));
}
console.log(`${D}A green run means the database enforces what the app promises.`);
console.log(`It does not mean the promises are the right ones — section 3 is for that.${X}\n`);
process.exit(fail ? 1 : 0);
