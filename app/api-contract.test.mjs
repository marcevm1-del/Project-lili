// API contract test: talks to the live Supabase project exactly as the app does,
// with nothing but the publishable key in src/backend/config.js.
//
// SQL tests switch roles inside the database; they cannot prove that PostgREST
// exposes a function, or that a grant reaches the role a phone actually uses.
// This does. It runs in CI (GitHub's runners can reach Supabase; the
// development sandbox cannot).
//
// Signed-out checks always run. Signed-in checks run when LILI_TEST_EMAIL and
// LILI_TEST_PASSWORD are set (a throwaway account, stored as CI secrets).
import cfg from "./src/backend/config.js";

const URL = cfg.url, KEY = cfg.publishableKey;
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? " — " + detail : ""}`); }
};
const call = async (path, { method = "GET", body, token } = {}) => {
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${token || KEY}`,
               "Content-Type": "application/json", Prefer: "return=representation" },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
};
const rpc = (fn, args, token) => call(`/rest/v1/rpc/${fn}`, { method: "POST", body: args || {}, token });
const exists = (r) => !(r.json && r.json.code === "PGRST202");   // 404: function not exposed
const refused = (r) => r.status >= 400 && r.json && typeof r.json.code === "string";

// A test that cannot reach the server must not report green. A sandbox or proxy
// answering 403 for every host looks exactly like "access refused".
{
  let ok = false, why = "";
  try {
    const res = await fetch(`${URL}/rest/v1/lili_search_terms?select=english&limit=1`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
    ok = res.status === 200 && Array.isArray(await res.json().catch(() => null));
    why = `status ${res.status}`;
  } catch (e) { why = e.message; }
  if (!ok) {
    console.log(`\nCannot reach the Supabase API (${why}). No checks were run.`);
    process.exit(2);
  }
}

console.log("\nSigned out (anon key only)");
let r = await call("/rest/v1/lili_items?select=id,status&limit=5");
check("live listings are browsable", r.status === 200 && Array.isArray(r.json));
check("only live listings come back", (r.json || []).every((x) => x.status === "live"));
r = await rpc("lili_search", { p_query: "abaya", p_limit: 5 });
check("search answers", r.status === 200);
r = await call("/rest/v1/lili_follows?select=user_id&limit=5");
check("who-follows-whom is not readable", r.status === 200 && (r.json || []).length === 0, `status ${r.status}`);
r = await call("/rest/v1/lili_messages?select=id&limit=1");
check("messages are not readable", (r.status === 200 && (r.json || []).length === 0) || refused(r));
r = await call("/rest/v1/lili_moderation_cases?select=id&limit=1");
check("moderation cases are not readable", (r.status === 200 && (r.json || []).length === 0) || refused(r));
for (const [fn, args] of [
  ["lili_mark_sold", { p_item: "00000000-0000-0000-0000-000000000000", p_sold: true }],
  ["lili_withdraw_listing", { p_item: "00000000-0000-0000-0000-000000000000" }],
  ["lili_counter_offer", { p_offer: "00000000-0000-0000-0000-000000000000", p_amount: 1 }],
  ["lili_moderation_decide", { p_case: "00000000-0000-0000-0000-000000000000", p_decision: "dismiss", p_reason: "contract test" }],
  ["lili_leave_review", { p_meet: "00000000-0000-0000-0000-000000000000", p_stars: 5 }],
  ["lili_reviews_owed", {}],
  ["lili_save_search", { p_query: "contract test" }],
  ["lili_my_saved_searches", {}],
  ["lili_forget_search", { p_id: "00000000-0000-0000-0000-000000000000" }],
  ["lili_release_reservation", { p_item: "00000000-0000-0000-0000-000000000000" }],
]) {
  r = await rpc(fn, args);
  check(`${fn} exists but refuses a signed-out caller`, exists(r) && refused(r), `status ${r.status} ${r.json && r.json.code}`);
}
// Reputation is public; who wrote a review, and every saved search, are not.
r = await rpc("lili_reputations");
check("shop reputations are readable signed out", r.status === 200 && Array.isArray(r.json), `status ${r.status}`);
r = await rpc("lili_shop_reviews", { p_shop: "00000000-0000-0000-0000-000000000000" });
check("a shop's reviews are readable signed out", r.status === 200 && Array.isArray(r.json), `status ${r.status}`);
check("a review never says who wrote it", !(r.json || []).some((x) => "reviewer_uid" in x));
r = await rpc("lili_shop_meets_done", { p_shop: "00000000-0000-0000-0000-000000000000" });
check("a shop's completed meets are a public count", r.status === 200 && r.json === 0, `status ${r.status} ${JSON.stringify(r.json)}`);
r = await call("/rest/v1/lili_items?select=screening&limit=50");
check("a listing's screening shows a verdict, never the rules that fired",
  r.status === 200 && (r.json || []).every((x) => !x.screening || !("findings" in x.screening || "score" in x.screening)),
  `status ${r.status}`);
for (const table of ["lili_reviews", "lili_saved_searches", "lili_item_screening"]) {
  r = await call(`/rest/v1/${table}?select=*&limit=1`);
  check(`${table} is not readable directly`, refused(r) || (r.status === 200 && (r.json || []).length === 0), `status ${r.status}`);
}
for (const fn of ["lili_invite_code", "lili_rate_ok", "lili_meet_guard"]) {
  r = await rpc(fn, fn === "lili_rate_ok" ? { p_action: "x", p_limit: 1, p_window: "1 hour" } : {});
  check(`${fn} is not callable from outside`, refused(r), `status ${r.status}`);
}

if (process.env.LILI_TEST_EMAIL && process.env.LILI_TEST_PASSWORD) {
  console.log("\nSigned in (test account)");
  const auth = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.LILI_TEST_EMAIL, password: process.env.LILI_TEST_PASSWORD }),
  }).then((x) => x.json());
  const token = auth.access_token;
  check("test account signs in", !!token);
  if (token) {
    // A random id the caller does not own: the function must be reachable
    // (not 404, not "permission denied for function") and refuse on ownership.
    for (const [fn, args] of [
      ["lili_mark_sold", { p_item: "00000000-0000-0000-0000-000000000000", p_sold: true }],
      ["lili_withdraw_listing", { p_item: "00000000-0000-0000-0000-000000000000" }],
      ["lili_counter_offer", { p_offer: "00000000-0000-0000-0000-000000000000", p_amount: 1 }],
      ["lili_leave_review", { p_meet: "00000000-0000-0000-0000-000000000000", p_stars: 5 }],
      ["lili_reviews_owed", {}],
      ["lili_my_saved_searches", {}],
      ["lili_release_reservation", { p_item: "00000000-0000-0000-0000-000000000000" }],
    ]) {
      r = await rpc(fn, args, token);
      const msg = (r.json && r.json.message) || "";
      check(`${fn} is callable by a signed-in user`, exists(r) && !/permission denied for function/i.test(msg),
            `status ${r.status} ${msg}`);
    }
    r = await rpc("lili_export_me", {}, token);
    check("data export works for a signed-in user", r.status === 200 && r.json && r.json.generated_at);
  }
} else {
  console.log("\n(signed-in checks skipped: set LILI_TEST_EMAIL / LILI_TEST_PASSWORD)");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
