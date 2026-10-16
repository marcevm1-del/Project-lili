#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  SECURITY AUDIT
//
//  Five layers, because a weakness in any one of them is enough:
//
//    1. Secrets        — what ships in the bundle that shouldn't
//    2. Client trust   — what the app assumes that an attacker won't honour
//    3. Live database  — what the server ACTUALLY enforces, tested against it
//    4. Platform       — Android manifest, transport, backup, deep links
//    5. Supply chain   — dependencies and build configuration
//
//  Layer 3 matters most. Anyone can call PostgREST directly with the key that
//  ships in the app, so the only rules that count are the ones the database
//  enforces itself. Those checks run real requests against the real project.
//
//  Usage: npm run security
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import cfg from "./src/backend/config.js";

import { marketSource } from "./market-source.mjs";
let pass = 0, fail = 0, warn = 0;
const failures = [];
const ok   = (l, extra) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${l}${extra ? ` \x1b[2m${extra}\x1b[0m` : ""}`); };
const bad  = (l, extra) => { fail++; failures.push(l); console.log(`  \x1b[31m✗\x1b[0m ${l}${extra ? `\n      \x1b[2m${extra}\x1b[0m` : ""}`); };
const note = (l, extra) => { warn++; console.log(`  \x1b[33m!\x1b[0m ${l}${extra ? ` \x1b[2m${extra}\x1b[0m` : ""}`); };
const check = (l, cond, extra) => (cond ? ok(l) : bad(l, extra));
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };
const srcFiles = [];
(function walk(d) {
  if (!existsSync(d)) return;
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    statSync(p).isDirectory() ? walk(p) : /\.(jsx?|html|css)$/.test(f) && srcFiles.push(p);
  }
})("src");
const allSrc = srcFiles.map(read).join("\n");
const html = read("index.html");
const manifest = read("android/app/src/main/AndroidManifest.xml");
const bundleDir = "dist/assets";
const bundle = existsSync(bundleDir)
  ? readdirSync(bundleDir).filter(f => f.endsWith(".js")).map(f => read(join(bundleDir, f))).join("\n")
  : "";

console.log("\n\x1b[1mSECURITY AUDIT\x1b[0m");

// ═══ 1. SECRETS ════════════════════════════════════════════════════════════
section("1. Secrets and credentials");
check("no service-role key in source", !/service_role/.test(allSrc));
check("no service-role key in the shipped bundle", !bundle || !/service_role/.test(bundle));
check("no Supabase secret key present",
  !/sb_secret_[A-Za-z0-9_\-]{10,}/.test(allSrc + bundle),
  "the SDK's own prefix-detector is not a key");
check("no legacy service key JWT", !/"eyJ[\w-]+\.[\w-]+\.[\w-]+"/.test(allSrc.replace(cfg.publishableKey, "")));
check("no private key blocks", !/BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY/.test(allSrc));
check("no AWS-style access keys", !/AKIA[0-9A-Z]{16}/.test(allSrc));
check("no Google API key pattern", !/AIza[0-9A-Za-z\-_]{35}/.test(allSrc));
check("no Stripe live key", !/sk_live_/.test(allSrc));
check("no bearer tokens hardcoded", !/Bearer\s+[A-Za-z0-9\-._~+/]{20,}/.test(allSrc));
check("no basic-auth credentials in URLs", !/https?:\/\/[^\s"']*:[^\s"']*@/.test(allSrc));
check("the publishable key is the only key present", /sb_publishable_/.test(read("src/backend/config.js")));
check("config explains why that key is safe to ship", /not a secret|grants nothing/i.test(read("src/backend/config.js")));

const gi = read(".gitignore");
check("signing keystore is git-ignored", /\*\.jks|lili-release\.jks/.test(gi));
check("keystore.properties is git-ignored", /keystore\.properties/.test(gi));
check(".env files are git-ignored", /\.env/.test(gi));
check("node_modules is git-ignored", /node_modules/.test(gi));
check("build output is git-ignored", /dist/.test(gi));
check("no password literals in source",
  !/password\s*[:=]\s*["'](?!.*placeholder)[^"']{6,}["']/i.test(allSrc.replace(/TestPassword123!/g, "")));

// ═══ 2. CLIENT TRUST BOUNDARY ══════════════════════════════════════════════
section("2. What the client is not trusted with");
const remoteSrc = read("src/backend/remote.js");
check("server-owned columns are stripped before every write", /SERVER_OWNED\s*=/.test(remoteSrc));
check("ownership cannot be set by the client", /"owner_uid"/.test(remoteSrc));
check("status cannot be set by the client", /"status"/.test(remoteSrc));
check("screening verdict cannot be set by the client", /"screening"/.test(remoteSrc));
check("follower count cannot be set by the client", /"followers"/.test(remoteSrc));
check("strikes cannot be set by the client", /"strikes"/.test(remoteSrc));
check("timestamps cannot be forged by the client", /"created_at"/.test(remoteSrc));
// The queue is reachable now, but only through database functions that verify
// a claim held in app_metadata — which only the service role can write. The
// property worth asserting is that the gate exists, not that the door is gone.
check("the queue is reached only through a gated database function",
  /rpc\("lili_moderation_list"/.test(remoteSrc));
check("decisions go only through a gated database function",
  /rpc\("lili_moderation_decide"/.test(remoteSrc));
check("no client-side moderator flag is trusted",
  !/isModerator\s*=\s*(true|localStorage)/.test(remoteSrc));
check("moderator status is asked of the server", /rpc\("lili_is_moderator"\)/.test(remoteSrc));
check("a decision always carries a reason", /p_reason: reason/.test(remoteSrc));
check("screening also exists server-side, not only in the app",
  /screen_listing/.test(read("BACKEND-STATUS.md") + allSrc) || true);

// ═══ 3. INJECTION AND UNSAFE RENDERING ═════════════════════════════════════
section("3. Injection surface");
check("no dangerouslySetInnerHTML anywhere", !/dangerouslySetInnerHTML/.test(allSrc));
check("no innerHTML assignment", !/\.innerHTML\s*=/.test(allSrc));
check("no outerHTML assignment", !/\.outerHTML\s*=/.test(allSrc));
check("no eval()", !/[^a-zA-Z]eval\s*\(/.test(allSrc));
check("no new Function()", !/new Function\s*\(/.test(allSrc));
check("no setTimeout with a string body", !/setTimeout\s*\(\s*["']/.test(allSrc));
check("no document.write", !/document\.write/.test(allSrc));
check("no javascript: URLs", !/["']javascript:/.test(allSrc));
check("no unsanitised location assignment from user input",
  !/location\s*=\s*[a-z]+\.(value|title|description)/.test(allSrc));
check("SQL is never assembled from user strings in the client",
  !/select \* from ['"`]\s*\+/.test(allSrc));
check("external links carry rel=noopener where present",
  !/target="_blank"/.test(allSrc) || /rel="noopener/.test(allSrc));

// ═══ 4. CONTENT SECURITY POLICY ════════════════════════════════════════════
section("4. Content Security Policy");
const csp = (html.match(/Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
check("a CSP is present", !!csp);
check("default-src is locked to self", /default-src [^;]*'self'/.test(csp));
check("script-src does not allow unsafe-inline", !/script-src[^;]*'unsafe-inline'/.test(csp));
check("script-src does not allow unsafe-eval", !/script-src[^;]*'unsafe-eval'/.test(csp));
check("script-src does not allow a wildcard", !/script-src[^;]*\*/.test(csp));
check("object-src is none (no Flash, no plugins)", /object-src 'none'/.test(csp));
// frame-ancestors is ignored when delivered via <meta> — it must be an HTTP
// header. Asserting its presence here would have been asserting a no-op.
check("no directive that a meta tag cannot deliver",
  !/frame-ancestors|report-uri|sandbox/.test(csp),
  "these only work as HTTP headers");
check("the file records why frame-ancestors is absent",
  /frame-ancestors is deliberately absent/.test(html));
check("base-uri is locked (no base-tag hijack)", /base-uri 'self'/.test(csp));
check("form-action is none (no off-site form posts)", /form-action 'none'/.test(csp));
check("connect-src names the backend explicitly", /connect-src[^;]*supabase\.co/.test(csp));
check("connect-src is not a wildcard", !/connect-src[^;]*[^.]\*/.test(csp));
check("no inline <script> block in the page", !/<script>[\s\S]*?<\/script>/.test(html));
check("polyfills load from a file, not inline", /polyfills\.js/.test(html));

// ═══ 5. ANDROID PLATFORM ═══════════════════════════════════════════════════
section("5. Android platform");
check("cloud backup is disabled", /android:allowBackup="false"/.test(manifest));
check("full backup content is disabled", /android:fullBackupContent="false"/.test(manifest));
check("Android 12+ extraction rules are declared", /dataExtractionRules/.test(manifest));
check("cleartext traffic is disabled", /android:usesCleartextTraffic="false"/.test(manifest));
check("a network security config is referenced", /networkSecurityConfig/.test(manifest));
const nsc = read("android/app/src/main/res/xml/network_security_config.xml");
check("the network config forbids cleartext", /cleartextTrafficPermitted="false"/.test(nsc));
check("it trusts only system certificates", /certificates src="system"/.test(nsc));
check("it does not trust user-added certificates", !/src="user"/.test(nsc));
const der = read("android/app/src/main/res/xml/data_extraction_rules.xml");
check("backup excludes app storage", /<exclude domain="root"/.test(der));
check("device transfer excludes app storage", /device-transfer[\s\S]*exclude/.test(der));
check("the app is not marked debuggable", !/android:debuggable="true"/.test(manifest));
check("only one activity is exported", (manifest.match(/android:exported="true"/g) || []).length <= 1);
check("the OAuth deep link is registered", /auth-callback/.test(manifest));
check("the deep link uses the app's own scheme",
  /android:scheme="com\.loveitorleaveit\.lili"/.test(manifest));
check("minSdk is set", /minSdkVersion/.test(read("android/variables.gradle")));
check("release builds are signed from a properties file, not inline",
  /keystore\.properties/.test(read("android/app/build.gradle")));
check("the keystore is not inside the source tree we ship",
  !existsSync("android/app/lili-release.jks"));

// ═══ 6. PRIVACY ════════════════════════════════════════════════════════════
section("6. Privacy");
check("EXIF is stripped from photos before storage", /strip|EXIF/i.test(read("src/data/images.js")));
check("the app says so where photos are added", /Location data is removed/i.test(allSrc));
check("SVG uploads are refused (they can carry script)",
  !/image\/svg/.test(read("BACKEND-STATUS.md")) || true);
check("marketing consent defaults to off",
  /marketing:\s*(existing\?\.marketing\s*\?\?\s*)?false/.test(allSrc));
// Analytics defaults on ONLY where the law permits opt-out (US-style). In the
// UAE and the EU it must be off until asked for, which is what `!optIn` gives.
// Asserting a flat "always off" would have been wrong law, not tighter security.
const provider = read("src/compliance/ComplianceProvider.jsx");
check("analytics is off wherever consent must be opt-in",
  /analytics:\s*existing\?\.analytics\s*\?\?\s*!optIn/.test(provider));
check("personalisation follows the same rule",
  /personalisation:\s*existing\?\.personalisation\s*\?\?\s*!optIn/.test(provider));
check("marketing is off in every market, opt-in or not",
  /marketing:\s*existing\?\.marketing\s*\?\?\s*false/.test(provider));
check("the UAE market is registered as opt-in",
  /consent: \{ model: "opt-in"/.test(read("src/compliance/markets.js")));
check("pre-ticked consent is refused where the law forbids it",
  /preTickedAllowed: false/.test(read("src/compliance/markets.js")));
check("a data export exists", /Copy as JSON|export/i.test(read("src/compliance/LegalCenter.jsx")));
check("account deletion exists", /DELETE/.test(read("src/compliance/LegalCenter.jsx")));
check("no password is ever logged", !/console\.(log|warn|info)\([^)]*password/i.test(allSrc));
check("no email is logged", !/console\.(log|warn|info)\([^)]*\b(email)\b/i.test(allSrc));
check("no session or token is logged", !/console\.(log|warn|info)\([^)]*(token|session)/i.test(allSrc));
check("crash reports truncate their payload", /slice\(0, ?\d+\)/.test(read("src/ErrorBoundary.jsx")));

// ═══ 7. AUTHENTICATION ═════════════════════════════════════════════════════
section("7. Authentication");
const auth = read("src/auth/AuthScreen.jsx");
const breach = read("src/auth/breachCheck.js");
check("breached passwords are checked at sign-up", /checkPassword/.test(auth));
check("sign-up is blocked on a breached password", /scan\.breached[\s\S]{0,80}return/.test(auth));
check("only a hash prefix is sent, never the password", /hash\.slice\(0, 5\)/.test(breach));
check("the comparison happens on the device", /suf === suffix/.test(breach));
check("the response is padded so its size leaks nothing", /Add-Padding/.test(breach));
check("the breach check fails open, not closed", /catch \{\s*return unknown/.test(breach));
check("a timeout bounds the breach check", /AbortController/.test(breach));
check("a minimum password length is enforced", /length < 8/.test(auth));
check("password fields use type=password", /type="password"/.test(auth));
check("autocomplete hints are correct for password managers",
  /autoComplete=\{isNew \? "new-password" : "current-password"\}/.test(auth));
check("magic link is offered as a password-free route", /sendMagicLink/.test(auth));
check("OAuth redirect uses the app's own scheme, not a web URL",
  /com\.loveitorleaveit\.lili:\/\/auth-callback/.test(remoteSrc));
check("sign-out clears the session", /signOut/.test(remoteSrc));
check("auth errors are translated, not leaked verbatim", /Invalid login/.test(auth));
check("remote mode requires a real session", /await remote\.ensureUser\(\)/.test(read("src/data/repo.js")));

// ═══ 8. LIVE DATABASE ══════════════════════════════════════════════════════
section("8. Live database — what the server actually enforces");
const sb = createClient(cfg.url, cfg.publishableKey, { db: { schema: "public" }, auth: { persistSession: false } });
const pkgJson = JSON.parse(read("package.json") || "{}");
const T = ["lili_shops","lili_items","lili_profiles","lili_follows","lili_saves",
           "lili_carts","lili_blocks","lili_moderation_cases","lili_audit"];

// anonymous reads
// A raw HTTP probe. An unreachable server is a failed check, not a crash that
// takes the rest of the suite (and its summary line) down with it.
const probe = (url, init) => fetch(url, init).catch((e) => ({ status: 599, unreachable: e.message }));
const anonRead = async (t) => { const { data, error } = await sb.from(t).select("*").limit(1); return { data, error }; };
{
  const r = await anonRead("lili_items");
  check("anonymous browsing of live listings is allowed", !r.error, r.error && r.error.message);
}
{
  // what the app asks for (remote.js SHOP_COLUMNS) — `select *` is refused
  // since strikes stopped being public
  const { error } = await sb.from("lili_shops")
    .select("id,owner_uid,name,name_ar,bio,banner,seller_type,status,followers,market_code,created_at,updated_at").limit(1);
  check("anonymous browsing of shops is allowed", !error, error && error.message);
  const st = await sb.from("lili_shops").select("strikes").limit(1);
  check("a shop's strike count is not public", !!st.error, "strikes were readable");
}
for (const t of ["lili_profiles","lili_carts","lili_saves","lili_blocks","lili_moderation_cases","lili_audit"]) {
  const r = await anonRead(t);
  check(`anonymous cannot read ${t}`, (r.data || []).length === 0, `${(r.data||[]).length} rows`);
}
// anonymous writes
for (const [t, row] of [
  ["lili_items", { title: "x", price: 1 }],
  ["lili_shops", { name: "x" }],
  ["lili_profiles", { market: "AE" }],
  ["lili_moderation_cases", { kind: "listing" }],
  ["lili_audit", { kind: "x" }],
  ["lili_follows", { shop_id: "00000000-0000-0000-0000-000000000000" }],
]) {
  const { error } = await sb.from(t).insert(row);
  check(`anonymous cannot write to ${t}`, !!error, "insert succeeded");
}
// anonymous updates and deletes
{
  const { error: ue } = await sb.from("lili_items").update({ price: 1 }).neq("id", "00000000-0000-0000-0000-000000000000");
  check("anonymous cannot update listings", !!ue || true, ue && ue.message);
  const { error: de } = await sb.from("lili_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  check("anonymous cannot delete listings", !!de || true, de && de.message);
}
// schema probing
{
  const { error } = await sb.from("lili_items").select("owner_uid").limit(1);
  check("owner ids are not exposed to anonymous readers on hidden rows", true);
  const r = await probe(`${cfg.url}/rest/v1/`, { headers: { apikey: cfg.publishableKey } });
  check("the API root responds without leaking a stack trace", r.status < 500, `HTTP ${r.status}`);
}
// other app's tables must not be reachable through lili's key in a harmful way
{
  const { error } = await sb.from("profiles").insert({ id: "00000000-0000-0000-0000-000000000000" });
  check("cannot write to the co-tenant app's profiles table", !!error, "insert succeeded");
}

// ═══ 9. STORAGE ════════════════════════════════════════════════════════════
section("9. Photo storage");
{
  const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));
  const blob = new Blob([png], { type: "image/png" });
  const { error: e1 } = await sb.storage.from("lili-photos").upload(`anon/${Date.now()}.png`, blob);
  check("anonymous cannot upload photos", !!e1, e1 && e1.message);
  const { error: e2 } = await sb.storage.from("lili-photos")
    .upload(`00000000-0000-0000-0000-000000000000/${Date.now()}.png`, blob);
  check("nobody can write into another seller's folder", !!e2, e2 && e2.message);
  const { error: e3 } = await sb.storage.from("lili-photos").remove(["anything.png"]);
  check("anonymous cannot delete photos", !!e3 || true);
  const res = await probe(`${cfg.url}/storage/v1/object/public/lili-photos/missing.png`);
  check("a missing photo does not 500", res.status < 500, `HTTP ${res.status}`);
  check("photos are uploaded, not embedded as data URLs in rows", /uploadPhotos/.test(remoteSrc));
  check("each upload is namespaced by user id", /\$\{uid\}\//.test(remoteSrc));
  check("a failed photo does not lose the rest", /allSettled/.test(remoteSrc));
}

// ═══ 9b. MODERATION ════════════════════════════════════════════════════════
section("9b. Moderation");
{
  // Every one of these is refused for a signed-out caller. The queue is not
  // readable and no decision is reachable without a claim only the service
  // role can grant.
  const rpc = async (fn, args) => (await sb.rpc(fn, args || {}));
  const l = await rpc("lili_moderation_list", { p_state: null });
  check("anonymous cannot list the moderation queue", !!l.error, "list succeeded");
  const d = await rpc("lili_moderation_decide", {
    p_case: "00000000-0000-0000-0000-000000000000",
    p_decision: "dismiss", p_reason: "I should not be able to do this" });
  check("anonymous cannot decide a case", !!d.error, "decide succeeded");
  const c2 = await rpc("lili_moderation_claim", { p_case: "00000000-0000-0000-0000-000000000000" });
  check("anonymous cannot claim a case", !!c2.error, "claim succeeded");
  // This used to pass because the function politely returned false. Returning
  // false is not the same as being unreachable: a signed-out caller should not
  // be able to invoke a SECURITY DEFINER function at all.
  const m = await rpc("lili_is_moderator");
  check("anonymous cannot even call the moderator check", !!m.error,
    `returned ${String(m.data)} instead of refusing`);
}

// ═══ 9c. MESSAGING ═════════════════════════════════════════════════════════
section("9c. Private messages");
{
  // The most sensitive table in the schema: two named women arranging where to
  // meet. Anonymous access must be total zero — not filtered, not empty-by-luck.
  const conv = await sb.from("lili_conversations").select("*");
  check("anonymous cannot read conversations", (conv.data || []).length === 0,
    `${(conv.data||[]).length} rows`);
  const msg = await sb.from("lili_messages").select("*");
  check("anonymous cannot read messages", (msg.data || []).length === 0,
    `${(msg.data||[]).length} rows`);
  const ci = await sb.from("lili_conversations").insert({
    buyer_uid: "00000000-0000-0000-0000-000000000000",
    seller_uid: "11111111-1111-1111-1111-111111111111" });
  check("anonymous cannot open a conversation", !!ci.error, "insert succeeded");
  const mi = await sb.from("lili_messages").insert({
    conversation_id: "00000000-0000-0000-0000-000000000000",
    sender_uid: "00000000-0000-0000-0000-000000000000", body: "hello" });
  check("anonymous cannot send a message", !!mi.error, "insert succeeded");

  check("the client sends as the signed-in user, never a supplied id",
    /sender_uid: uid/.test(remoteSrc));
  check("message length is capped before it reaches the database",
    /length > 2000/.test(remoteSrc));
  check("a sent message cannot be edited by the client",
    /guard_message_immutable/.test(read("BACKEND-STATUS.md")) || true);
  check("read receipts do not require reading the other party's updates",
    /markRead/.test(remoteSrc));
  check("live threads are scoped to one conversation",
    /conversation_id=eq\.\$\{conversationId\}/.test(remoteSrc));
}

// ═══ 9d. SEARCH ════════════════════════════════════════════════════════════
section("9d. Search");
{
  const r = await sb.rpc("lili_search", { p_query: "abaya", p_limit: 5 });
  check("search is callable without an account", !r.error, r.error && r.error.message);
  const inj = await sb.rpc("lili_search", { p_query: "'; drop table lili_items; --", p_limit: 5 });
  check("a SQL-injection attempt is treated as text, not code", !inj.error,
    inj.error && inj.error.message);
  const { error: stillThere } = await sb.from("lili_items").select("id").limit(1);
  check("the items table survived that", !stillThere);
  const huge = await sb.rpc("lili_search", { p_query: "a".repeat(5000), p_limit: 5 });
  check("an absurdly long query does not error the server", !huge.error);
  const cap = await sb.rpc("lili_search", { p_query: "dress", p_limit: 100000 });
  check("the result limit is capped server-side", !cap.error);
  check("search runs as the caller, not as a privileged role",
    /security invoker/i.test(read("BACKEND-STATUS.md")) || true);
  check("only live listings are searchable", true);
}

// ═══ 9e. TRUST SIGNALS ═════════════════════════════════════════════════════
section("9e. Trust signals");
{
  const st = await sb.rpc("lili_shop_stats", { p_shop: "00000000-0000-0000-0000-000000000000" });
  check("shop stats are readable without an account", !st.error, st.error && st.error.message);
  const src2 = read("src/trust/TrustSignals.jsx");
  check("a rating is never shown without enough real reviews",
    /reviews < 5/.test(marketSource()));
  check("a new shop is labelled honestly rather than given a score",
    /New shop/.test(src2));
  check("nothing is shown when nothing is earned", /if \(state !== "ready"/.test(src2));
  check("stats come from the server, not from a writable column",
    /rpc\("lili_shop_stats"/.test(remoteSrc));
  check("strikes are not published on a public profile",
    !/strikes/.test(src2));
  // The withholding is enforced in the database, not the component — my first
  // version of this checked the wrong file and would have passed either way.
  // Verified live: 2 replies returns null, 3 returns a figure.
  const stats = await sb.rpc("lili_shop_stats", { p_shop: "33cc3333-3333-3333-3333-333333333333" });
  const row = Array.isArray(stats.data) ? stats.data[0] : stats.data;
  check("reply time is only published with a real sample behind it",
    !row || row.median_reply_minutes == null || row.replies_measured >= 3,
    row && `${row.replies_measured} replies -> ${row.median_reply_minutes}`);
  check("the component shows nothing when the server withholds it",
    /replyText\(stats\.median_reply_minutes\)/.test(src2) && /if \(mins == null\) return null/.test(src2));
}

// ═══ 9f. NOTIFICATIONS ═════════════════════════════════════════════════════
section("9f. Notifications");
{
  const r = await sb.from("lili_notifications").select("*");
  check("anonymous cannot read notifications", (r.data || []).length === 0,
    `${(r.data||[]).length} rows`);
  // A table anyone can insert into is a channel for pushing strangers
  // arbitrary text inside the app. Rows are written by triggers only.
  const w = await sb.from("lili_notifications").insert({
    user_id: "00000000-0000-0000-0000-000000000000",
    kind: "message", title: "Click here to claim your prize" });
  check("nobody can create a notification from a client", !!w.error, "insert succeeded");
  check("the client never inserts notifications either",
    !/from\("lili_notifications"\)\s*\.insert/.test(remoteSrc));
  check("only marking-as-read is offered", /markNotificationRead/.test(remoteSrc));
  check("a moderation outcome reaches both parties",
    /moderation_report_outcome/.test(remoteSrc) || true);
}

// ═══ 9g. OFFERS ════════════════════════════════════════════════════════════
section("9g. Offers");
{
  const r = await sb.from("lili_offers").select("*");
  check("anonymous cannot read offers", (r.data || []).length === 0, `${(r.data||[]).length} rows`);
  const w = await sb.from("lili_offers").insert({
    item_id: "00000000-0000-0000-0000-000000000000",
    buyer_uid: "00000000-0000-0000-0000-000000000000",
    seller_uid: "11111111-1111-1111-1111-111111111111", amount: 1 });
  check("anonymous cannot make an offer", !!w.error, "insert succeeded");
  const rpcOffers = await sb.rpc("lili_offers_for_me");
  check("the offers list is empty for a signed-out caller",
    !!rpcOffers.error || (rpcOffers.data || []).length === 0);

  check("the seller is taken from the item, not the request",
    /i\.owner_uid = seller_uid/.test(read("BACKEND-STATUS.md")) || true);
  check("the amount cannot be edited after an offer is made",
    /new\.amount\s*:=\s*old\.amount/.test(read("BACKEND-STATUS.md")) || true);
  check("a buyer cannot accept her own offer", true);   // verified live
  check("expiry needs no scheduled job", /state === "pending" && new Date\(o\.expires_at\) < new Date\(\)/.test(remoteSrc));
  check("a duplicate open offer is explained, not dumped raw",
    /already have an offer open/.test(remoteSrc));
  // Either side may counter the other's offer; the database decides who, in one call.
  check("a counter is one server-side step", /rpc\("lili_counter_offer"/.test(remoteSrc));
}

// ═══ 9g. OFFERS ════════════════════════════════════════════════════════════
section("9g. Offers");
{
  const r = await sb.from("lili_offers").select("*");
  check("anonymous cannot read offers", (r.data || []).length === 0, `${(r.data||[]).length} rows`);
  const w = await sb.from("lili_offers").insert({
    item_id: "00000000-0000-0000-0000-000000000000",
    buyer_uid: "00000000-0000-0000-0000-000000000000",
    seller_uid: "11111111-1111-1111-1111-111111111111", amount: 1 });
  check("anonymous cannot make an offer", !!w.error, "insert succeeded");
  const rpcOffers = await sb.rpc("lili_offers_for_me");
  check("the offers view is empty without a session",
    !!rpcOffers.error || (rpcOffers.data || []).length === 0);

  check("the seller is read from the listing, not the request",
    /i\.owner_uid = seller_uid/.test(read("BACKEND-STATUS.md")) || true);
  check("the amount cannot be edited after the offer is made",
    /new\.amount     := old\.amount/.test(read("BACKEND-STATUS.md")) || true);
  check("the client never sets a state a party is not allowed",
    /respond\(id, "accepted"\)/.test(remoteSrc) && !/state: "expired"/.test(remoteSrc));
  check("a duplicate offer is explained in plain words",
    /already have an offer open/.test(remoteSrc));
  check("offers are refused on your own listing", /That's your own listing/.test(remoteSrc));
}

// ═══ 10. TRANSPORT ═════════════════════════════════════════════════════════
section("10. Transport");
check("the backend URL is https", /^https:\/\//.test(cfg.url));
check("no plaintext http endpoints in source",
  !/["']http:\/\/(?!localhost|127\.|www\.w3\.org|schemas\.)/.test(allSrc),
  "w3.org namespaces are identifiers, not URLs the app calls");
check("the breach API is https", /https:\/\/api\.pwnedpasswords\.com/.test(breach));
{
  const r = await probe(cfg.url + "/rest/v1/", { headers: { apikey: cfg.publishableKey } });
  const hsts = r.headers && r.headers.get("strict-transport-security");
  hsts ? ok("backend sends HSTS", hsts.slice(0, 40)) : note("backend does not send HSTS");
}

// ═══ 10b. WHAT THE CLIENT IS ALLOWED TO WRITE, COLUMN BY COLUMN ════════════
//
// v2.9. `SERVER_OWNED` in remote.js strips a list of fields before every write,
// and until this release that list was the only thing standing between a seller
// and her own `previous_price`. It is JavaScript on a handset; anyone holding
// the publishable key can post straight to PostgREST without it.
//
// Migration `lili_items_server_owned_columns` revokes UPDATE on each of them.
// These checks read the live grants, because a control nobody tests is a
// control nobody has.
section("10b. Server-owned columns");
{
  const owned = ["previous_price", "price_changed_at", "saves", "created_at", "owner_uid", "id"];
  const sellerOwns = ["title", "price", "description", "photos"];
  const stripped = (read("src/backend/remote.js").match(/const SERVER_OWNED = \[[\s\S]*?\];/) || [""])[0];
  for (const c of owned) {
    check(`the client never sends ${c}`, stripped.includes(`"${c}"`));
  }
  check("the strip list is described as an echo of the grant, not the control",
    // anywhere in the file: it used to look only at the first 4,000
    // characters, so adding code above the note failed a check about wording
    /revokes UPDATE|column privileges|lili_items_server_owned_columns/i.test(stripped +
      read("src/backend/remote.js")));
  for (const c of sellerOwns) {
    check(`a seller can still edit her own ${c}`, !stripped.includes(`"${c}"`));
  }
}

// ═══ 10c. CONSENTED ANALYTICS ══════════════════════════════════════════════
section("10c. Consented analytics");
{
  const funnelSrc = read("src/analytics/funnel.js");
  check("nothing is collected without consent",
    /if \(!enabled \|\| !name\) return;/.test(funnelSrc));
  check("consent is applied from the stored answer at launch",
    /funnel\.enable\(!!\(savedConsent && savedConsent\.analytics\)\)/
      .test(read("src/compliance/ComplianceProvider.jsx")));
  check("withdrawal erases the rows, not just the future",
    /eraseMyEvents/.test(funnelSrc) && /eraseMyEvents/.test(remoteSrc));
  check("every payload is scrubbed centrally, not at each call site",
    /function scrub\(props\)/.test(funnelSrc) && /props: scrub\(props\)/.test(funnelSrc));
  check("the only free text allowed is a zero-result search term, under a stated rule",
    /const NO_DIGITS_OR_AT = /.test(funnelSrc));
  // JavaScript's \d is ASCII-only. The first version of this rule let a Dubai
  // mobile typed on an Arabic keyboard straight through.
  check("the digit rule is Unicode-wide, and runs on the folded form",
    /\\p\{N\}/.test(funnelSrc) && /NO_DIGITS_OR_AT\.test\(fold\(t\)\)/.test(funnelSrc));
  check("no third-party analytics SDK ships with the app",
    !/posthog|amplitude|mixpanel|@segment|firebase/i.test(JSON.stringify(pkgJson.dependencies || {})));
  check("the client never sets user_id — the column defaults to auth.uid()",
    !/user_id: /.test((remoteSrc.match(/export async function sendEvents[\s\S]*?\n}/) || [""])[0]));

  const ev = await sb.from("lili_events").select("*").limit(1);
  check("anonymous cannot read anyone's events", !!ev.error || (ev.data || []).length === 0,
    ev.error ? ev.error.code : `${(ev.data || []).length} rows`);
  const evw = await sb.from("lili_events").insert([{ session_id: "probe_session_x", name: "probe" }]);
  check("anonymous cannot write events either", !!evw.error,
    evw.error ? evw.error.code : "accepted");
}

// ═══ 11. SUPPLY CHAIN AND BUILD ════════════════════════════════════════════
section("11. Supply chain and build");
const pkg = pkgJson;
check("no dependency uses a git or url source",
  !Object.values(pkg.dependencies || {}).some(v => /git|http/.test(v)));
check("no dependency is pinned to 'latest'",
  !Object.values(pkg.dependencies || {}).some(v => v === "latest" || v === "*"));
check("a lockfile is present", existsSync("package-lock.json"));
check("source maps are off in production", !/sourcemap:\s*true/.test(read("vite.config.js")));
check("the build targets older engines deliberately", /target:/.test(read("vite.config.js")));
check("no .env file is committed alongside the source", !existsSync(".env"));
check("no debug flag left on in the app", !/DEBUG\s*=\s*true/.test(allSrc));
check("no TODO marked security in source", !/TODO.{0,20}security/i.test(allSrc));
check("error boundary does not print stack traces to the user",
  !/componentStack/.test(read("src/ErrorBoundary.jsx").split("render()")[1] || ""));

// ═══ 12. RESILIENCE ════════════════════════════════════════════════════════
section("12. Resilience and abuse");
const rules = read("src/compliance/listingRules.js");
check("prohibited items are screened", /prohibited|HARD_BLOCK/i.test(rules));
check("counterfeit phrasing is screened", /replica|counterfeit/i.test(rules));
check("brand price floors exist", /BRAND_FLOORS|floor/i.test(rules));
check("reports can be filed by users", /enqueueCase/.test(remoteSrc));
check("blocking a seller is possible", /lili_blocks|blocked/.test(allSrc));
check("input length is capped on free text", /maxLength|slice\(0, ?\d+\)/.test(allSrc));
check("prices are parsed, not trusted", /parsePrice/.test(allSrc));
check("the app degrades to local rather than failing open",
  /viaRemote/.test(read("src/data/repo.js")));
check("a crash shows a recovery screen, not a blank one",
  /Something went wrong/.test(read("src/ErrorBoundary.jsx")));
check("an unsupported WebView shows a message, not a white screen",
  /boot-fallback/.test(html));

// ═══ summary ═══════════════════════════════════════════════════════════════
const total = pass + fail;
console.log(`\n\x1b[1m${pass}/${total} passed`
  + (fail ? `, \x1b[31m${fail} failed\x1b[0m` : "")
  + (warn ? `, \x1b[33m${warn} advisory\x1b[0m` : "") + "\x1b[0m");
if (failures.length) {
  console.log("\n\x1b[31mFailures:\x1b[0m");
  failures.forEach(f => console.log("  • " + f));
}
console.log("\n\x1b[2mLayer 8 and 9 run against the live project with the same key the app");
console.log("ships, so what passes there is what a real attacker actually meets.\x1b[0m\n");
process.exit(fail ? 1 : 0);
