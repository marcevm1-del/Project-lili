// ─────────────────────────────────────────────────────────────────────────────
//  PREFLIGHT — what has to be true before anyone installs this
//
//  Run: npm run preflight
//
//  Every other suite in this repo tests the code. This one tests the *project*:
//  the things that are switched on or off in a dashboard, the rows that have to
//  exist, the claims that have to be on an account. None of it is in the source
//  tree, so none of it is caught by a build, and all of it fails silently.
//
//  Which is exactly how the two blockers below survived a full green verify:
//
//    · Anonymous sign-in was switched off on the Supabase project. `initBackend`
//      catches the failure, writes a console.info nobody reads, and runs
//      device-only. So the app worked perfectly on every phone and two phones
//      could not see each other. A marketplace that is a single-player game.
//
//    · No account carried the moderator claim. The queue reads real cases now
//      (v2.8), gated on lili_is_moderator() — which was false for everybody, so
//      the first report would have gone into a queue nobody could open.
//
//  This runs with the same publishable key the app ships, so what it can do is
//  what a real install can do. Set SUPABASE_SERVICE_KEY in the environment to
//  also check the things only the server can see; without it those are reported
//  as unchecked rather than assumed fine.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";

const cfg = (await import("./src/backend/config.js")).default;

let blockers = 0, warnings = 0, checked = 0, skipped = 0;
const B = "\x1b[1m", R = "\x1b[31m", Y = "\x1b[33m", G = "\x1b[32m", D = "\x1b[2m", X = "\x1b[0m";

function ok(name, detail)   { checked++; console.log(`  ${G}✓${X} ${name}${detail ? `  ${D}${detail}${X}` : ""}`); }
function block(name, why, fix) {
  checked++; blockers++;
  console.log(`  ${R}✗${X} ${B}${name}${X}`);
  console.log(`    ${why}`);
  if (fix) console.log(`    ${B}Fix:${X} ${fix}`);
}
function warn(name, why, fix) {
  checked++; warnings++;
  console.log(`  ${Y}!${X} ${name}`);
  console.log(`    ${why}`);
  if (fix) console.log(`    ${D}${fix}${X}`);
}
function skip(name, why) { skipped++; console.log(`  ${D}·${X} ${name}  ${D}${why}${X}`); }
const section = (t) => console.log(`\n${B}${t}${X}`);

const sb = createClient(cfg.url, cfg.publishableKey,
  { db: { schema: "public" }, auth: { persistSession: false } });
const svc = process.env.SUPABASE_SERVICE_KEY
  ? createClient(cfg.url, process.env.SUPABASE_SERVICE_KEY,
      { db: { schema: "public" }, auth: { persistSession: false } })
  : null;

console.log(`\n${B}lili preflight${X}  ${D}${cfg.url}${X}`);

// ── 1. can the app get a session at all ─────────────────────────────────────
section("1. Can the app become multi-user");

let session = null;
{
  // Reading first, because from v2.10.1 browsing no longer waits for a session.
  // If this works, the marketplace is visible to everybody with the app —
  // which is most of what "multi-user" means to a shopper.
  const cat = await sb.from("lili_items").select("id").limit(1);
  if (cat.error) block("the catalogue is readable without an account",
    `anon cannot read lili_items — ${cat.error.message}. Nobody can browse.`,
    "Check the select policy on lili_items and lili_shops.");
  else ok("the catalogue is readable without an account", "browsing is live for everyone");

  const { data, error } = await sb.auth.signInAnonymously();
  if (error) {
    session = null;
    // Not the blanket blocker it was. Browsing works; what needs a session is
    // listing, messaging, offers and saves. So the question becomes: is there
    // ANY way for a woman to get an account today?
    const settings = await fetch(`${cfg.url}/auth/v1/settings`, { headers: { apikey: cfg.publishableKey } })
      .then((r) => r.json()).catch(() => ({}));
    const email = !!(settings.external && settings.external.email) && settings.disable_signup === false;
    const instant = settings.mailer_autoconfirm === true;

    if (!email) {
      block("a woman can get an account",
        `Anonymous sign-in is refused — "${error.message}" — and email sign-up is off too. ` +
        `Nobody can list, message or save anything.`,
        "Supabase dashboard → Authentication → Sign In / Providers → enable Anonymous sign-ins " +
        "(or enable email sign-up).");
    } else if (!instant) {
      block("a woman can get an account without waiting on email",
        `Anonymous sign-in is refused — "${error.message}". Email sign-up IS on, so the app ` +
        `offers it and it works — but every new account must click a confirmation link first, ` +
        `and Supabase's built-in SMTP only sends a couple of messages an hour and often only ` +
        `to project members. For ten invitations that is a wall.`,
        "Either: Authentication → Providers → enable Anonymous sign-ins (thirty seconds, and " +
        "the app then needs no email at all), or Authentication → Emails → configure your own " +
        "SMTP, or turn off 'Confirm email' for the beta.");
    } else {
      warn("a woman can get an account",
        "Anonymous sign-in is refused, but email sign-up works and confirms instantly.",
        "The app asks her to sign in before listing or messaging. That is a real step, " +
        "not a blocker.");
    }
  } else {
    session = data.session;
    ok("anonymous sign-in", "a browsing session can be obtained");
  }
}

const asUser = session ? sb : null;

// ── 2. moderation ───────────────────────────────────────────────────────────
section("2. Somebody can answer a report");

if (svc) {
  const { data, error } = await svc.rpc("lili_count_moderators").then(
    r => r, () => ({ data: null, error: "no rpc" }));
  if (error || data == null) {
    // fall back to reading auth.users through the service role
    const { data: users } = await svc.auth.admin.listUsers();
    const mods = (users?.users || []).filter(u => u.app_metadata?.moderator === true);
    if (!mods.length) {
      block("a moderator exists",
        "No account carries app_metadata.moderator. lili_is_moderator() is false for " +
        "everybody, so the queue opens onto nothing and the first report is never read.",
        "SQL: update auth.users set raw_app_meta_data = raw_app_meta_data || '{\"moderator\":true}' where email = '…';");
    } else {
      ok("a moderator exists", `${mods.length}: ${mods.map(m => m.email).join(", ")}`);
    }
  }
} else {
  skip("a moderator exists", "needs SUPABASE_SERVICE_KEY — check by signing in and opening the queue");
}

{
  const { error } = await sb.from("lili_moderation_cases").select("id").limit(1);
  // anon must NOT be able to read the queue
  if (!error) {
    const { data } = await sb.from("lili_moderation_cases").select("id").limit(1);
    if ((data || []).length) block("the moderation queue is not public",
      "An anonymous client read a moderation case.", "Check the RLS policy on lili_moderation_cases.");
    else ok("the moderation queue is not public", "anon reads nothing");
  } else ok("the moderation queue is not public", error.code);
}

// ── 3. the private beta ─────────────────────────────────────────────────────
section("3. The private beta can actually let somebody in");

{
  const { data, error } = await sb.from("lili_settings").select("*").eq("key", "beta_gate").maybeSingle();
  if (error) skip("the beta gate", error.message);
  else if (!data) warn("the beta gate", "No beta_gate row — lili_is_beta_member() defaults to gated.",
    "insert into lili_settings (key, value) values ('beta_gate', '{\"enabled\":true}');");
  else ok("the beta gate", data.value?.enabled ? "on — invite required to sell" : "OFF — anyone can sell");
}

if (svc) {
  const { data } = await svc.from("lili_invites").select("code,redeemed_by,revoked");
  const free = (data || []).filter(i => !i.redeemed_by && !i.revoked).length;
  if (!free) block("unredeemed invitations exist",
    "The beta gate is on and there is no code to give anyone. Nobody can open a shop.",
    "select * from lili_mint_invites(30, 'launch cohort 1');");
  else ok("unredeemed invitations exist", `${free} unused of ${(data || []).length}`);
} else {
  skip("unredeemed invitations exist", "needs SUPABASE_SERVICE_KEY — or call lili_invite_roster() as the moderator");
}

{
  // The invite keyspace is a live fact and belongs here rather than in a source
  // grep. Four characters over 28 symbols is ~614k combinations; with thirty
  // codes live that was roughly 1 in 20,000, and at 100 requests a second a
  // valid code in three to five minutes.
  if (svc) {
    const { data } = await svc.from("lili_invites").select("code").limit(5);
    const len = (data || []).reduce((a, r) => Math.min(a, (r.code || "").length), 99);
    if (!data || !data.length) skip("invitation codes are not enumerable", "no codes to inspect");
    else if (len < 12) block("invitation codes are not enumerable",
      `Shortest code is ${len} characters. A short code over a 28-symbol alphabet is ` +
      `searchable in minutes, and redeeming one grants shop creation and messaging.`,
      "select * from lili_mint_invites(30, 'cohort'); -- reissues at the current length");
    else ok("invitation codes are not enumerable", `${len} characters`);
  } else {
    skip("invitation codes are not enumerable", "needs SUPABASE_SERVICE_KEY");
  }
}

// ── 4. the catalogue ────────────────────────────────────────────────────────
section("4. Is there anything to look at");

{
  const { data: items } = await sb.from("lili_items").select("id,status").eq("status", "live").limit(200);
  const { data: shops } = await sb.from("lili_shops").select("id").limit(200);
  const n = (items || []).length, s = (shops || []).length;
  if (n === 0) warn("live listings", "Zero. Every buyer's first screen is the empty state.",
    "Not a code problem — this is the thirty sellers. See SELLER-PLAYBOOK.md.");
  else ok("live listings", `${n} live across ${s} shops`);
  if (n > 0 && n < 20) warn("catalogue depth",
    `${n} listings. Search and categories will feel thin; most category tiles read "none yet".`,
    "Aim for 100+ before opening beyond the cohort.");
}

// ── 5. search ───────────────────────────────────────────────────────────────
section("5. Search answers");

{
  const { error } = await sb.rpc("lili_search", { p_query: "abaya", p_limit: 1 });
  if (error) block("the search RPC responds", `lili_search failed: ${error.message}`,
    "The client falls back to on-device matching, which cannot see other people's listings.");
  else ok("the search RPC responds");
}
{
  const { data, error } = await sb.from("lili_search_terms").select("english").limit(1);
  if (error || !(data || []).length)
    warn("the garment vocabulary is readable",
      "The client cannot hydrate it and falls back to the built-in seed list.",
      "Check RLS on lili_search_terms.");
  else ok("the garment vocabulary is readable");
}

// ── 6. what the client must not be able to do ───────────────────────────────
section("6. The controls that are not in the client");

for (const [table, why] of [
  ["lili_saves", "who wants what"],
  ["lili_carts", "what is in a basket"],
  ["lili_profiles", "who people are"],
  ["lili_events", "the funnel"],
  ["lili_blocks", "who blocked whom"],
]) {
  const { data, error } = await sb.from(table).select("*").limit(1);
  if (!error && (data || []).length)
    block(`anon cannot read ${table}`, `Returned rows. ${why} is readable by anybody with the key.`);
  else ok(`anon cannot read ${table}`, error ? error.code : "0 rows");
}

if (asUser) {
  const probe = await asUser.from("lili_items")
    .update({ created_at: new Date(0).toISOString() }).eq("id", "00000000-0000-0000-0000-000000000000");
  if (probe.error && /permission denied|column/i.test(probe.error.message))
    ok("server-owned columns are refused", "created_at is not writable by a client");
  else if (probe.error) ok("server-owned columns are refused", probe.error.code);
  else warn("server-owned columns are refused",
    "The update did not error. It matched no rows, so this is inconclusive.",
    "Confirmed separately by security.test.mjs against the live grants.");
}

// ── 6b. live delivery ───────────────────────────────────────────────────────
section("6b. The messages screen is live, or it is not");

// The bug this section exists for: `watchMessages` subscribes to
// postgres_changes on lili_messages, and a subscription reports SUBSCRIBED
// whether or not the table is in the supabase_realtime publication. It was
// not. Every thread in the app was subscribed to a channel that would never
// deliver anything, and nothing on either side could tell — the client cannot
// read pg_publication_rel, so the server answers the question through
// lili_realtime_tables().
{
  const { data, error } = await sb.rpc("lili_realtime_tables");
  const tables = Array.isArray(data) ? data : [];
  if (error) warn("live delivery is switched on",
    `Could not read the publication: ${error.message}`,
    "Run: select public.lili_realtime_tables();");
  else if (!tables.includes("lili_messages")) block("live delivery is switched on",
    "lili_messages is not in the supabase_realtime publication. watchMessages " +
    "will subscribe successfully and never receive a message.",
    "alter publication supabase_realtime add table public.lili_messages;");
  else ok("live delivery is switched on", tables.join(", "));
}

// ── 7. photo storage ────────────────────────────────────────────────────────
section("7. Photographs have somewhere to go");

// Probed the way the app uses it, not with listBuckets() — enumerating buckets
// needs a privilege the shipped key does not have, so that call returns an
// empty list whether the bucket is missing or merely invisible, and reported a
// blocker either way. Listing inside the bucket goes through the same read
// policy an installed app uses, so "Bucket not found" means what it says.
{
  const BUCKET = (/const BUCKET = "([^"]+)"/.exec(
    await import("node:fs").then(fs => fs.readFileSync("src/backend/remote.js", "utf8"))) || [])[1];
  if (!BUCKET) skip("the photo bucket exists", "could not read the bucket name from remote.js");
  else {
    const { error } = await sb.storage.from(BUCKET).list("", { limit: 1 });
    if (error && /not found/i.test(error.message)) block("the photo bucket exists",
      `Bucket "${BUCKET}" does not exist. The four lili_photos_* policies on ` +
      `storage.objects reference it, but the bucket they guard was never created, ` +
      `so uploadPhoto() throws on the first photograph anybody publishes.`,
      `insert into storage.buckets (id, name, public) values ('${BUCKET}', '${BUCKET}', true);`);
    else if (error) warn("the photo bucket exists",
      `Bucket "${BUCKET}" answered with ${error.message}`,
      "It exists; the read policy may be narrower than the app expects.");
    else ok("the photo bucket exists", BUCKET);
  }
}

// ── 7b. the payment seam ────────────────────────────────────────────────────
section("7b. Nothing claims money moves, because nothing can move it");

{
  const { paymentsUsable, blockers, READINESS, getProcessor } =
    await import("./src/payments/processor.js");
  const { COLLECTION_LIVE } = await import("./src/data/fees.js");

  if (COLLECTION_LIVE && !getProcessor()) {
    // The one combination that is actively dangerous: every screen switches to
    // escrow wording the moment the flag flips, so a flag on with nothing
    // behind it means the whole app is describing a payment system that cannot
    // take a payment.
    block("payments are honest",
      "COLLECTION_LIVE is true with no processor registered. Every screen now " +
      "describes an escrow that does not exist.",
      "Set COLLECTION_LIVE = false in src/data/fees.js until an adapter is registered.");
  } else if (!COLLECTION_LIVE) {
    ok("payments are honest", "no processor, and no screen says otherwise");
    skip(`${READINESS.length} things must be true before the flag flips`,
         "npm run payments — the list is in src/payments/processor.js");
  } else if (paymentsUsable()) {
    ok("payments are honest", `processor: ${getProcessor().name}`);
  } else {
    warn("payments are honest", blockers().join(" "), "See src/payments/processor.js");
  }
}

// ── 8. what is deliberately not built ───────────────────────────────────────
section("8. Known and marked, not forgotten");

const { PAYMENTS_LIVE } = await import("./src/compliance/sellerRules.js");
const { COLLECTION_LIVE } = await import("./src/data/fees.js");
if (PAYMENTS_LIVE || COLLECTION_LIVE)
  block("payments claim and payments reality agree",
    "A payments flag is on. Every screen that says lili does not hold your money is now wrong.",
    "Both flags flip together, and the copy follows HOW_MONEY_WORKS.");
else ok("payments claim and payments reality agree", "off, and every screen says so");

// ── summary ─────────────────────────────────────────────────────────────────
if (session) await sb.auth.signOut().catch(() => {});

console.log(`\n${B}${checked} checked${X}`
  + (blockers ? `, ${R}${blockers} blocking${X}` : "")
  + (warnings ? `, ${Y}${warnings} to look at${X}` : "")
  + (skipped ? `, ${D}${skipped} unchecked${X}` : ""));

if (blockers) {
  console.log(`\n${R}${B}Do not ship.${X} The failures above are not in the source tree, so`);
  console.log(`nothing else in this repo will catch them, and each one fails silently\n`);
  process.exit(1);
}
console.log(`\n${D}A clean preflight means the project is configured. It says nothing about`);
console.log(`whether anyone wants to sell on it — that is SELLER-PLAYBOOK.md.${X}\n`);
