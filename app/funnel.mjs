// ─────────────────────────────────────────────────────────────────────────────
//  THE FUNNEL, READ BACK
//
//  Run: SUPABASE_SERVICE_KEY=… npm run funnel
//       SUPABASE_SERVICE_KEY=… npm run funnel -- --html   (writes funnel.html)
//
//  `lili_events` collects and no client can read it — no SELECT policy for any
//  role, deliberately. So the reading happens here, off the handset, with the
//  service key, which is why that key is passed in at the command line and is
//  not in the repository and must never be.
//
//  The questions are SQL views (migration lili_funnel_views), not queries typed
//  here, so "reached the first listing" means one thing rather than one thing
//  per person who asks.
//
//  ── the number to look at
//
//  Not sessions. Not screens. The drop between two adjacent rows of the funnel,
//  and the zero-result search terms — a shopping list written by the people who
//  wanted to buy and could not find it.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const cfg = (await import("./src/backend/config.js")).default;
const key = process.env.SUPABASE_SERVICE_KEY;
const wantHtml = process.argv.includes("--html");

const B = "\x1b[1m", D = "\x1b[2m", G = "\x1b[32m", Y = "\x1b[33m", R = "\x1b[31m", X = "\x1b[0m";

if (!key) {
  console.log(`\n${B}The funnel is not readable from a client, on purpose.${X}`);
  console.log(`\nlili_events has no SELECT policy for anon or authenticated — not for a`);
  console.log(`shopper, not for a shop owner, not for a moderator. Reading it needs the`);
  console.log(`service key, which is not in this repository and should never be.\n`);
  console.log(`  ${D}SUPABASE_SERVICE_KEY=… npm run funnel${X}`);
  console.log(`\nThe key is in your Supabase dashboard under Project Settings → API.`);
  console.log(`${D}Treat it like a password: it bypasses every row-level policy in the`);
  console.log(`database. Never put it in the app, a build, or a commit.${X}\n`);
  process.exit(2);
}

const sb = createClient(cfg.url, key, { db: { schema: "public" }, auth: { persistSession: false } });

const get = async (view, limit = 50) => {
  const { data, error } = await sb.from(view).select("*").limit(limit);
  if (error) { console.error(`  ${R}${view}: ${error.message}${X}`); return []; }
  return data || [];
};

const [funnel, dropoff, missing, health, controls, errors, totals] = await Promise.all([
  get("lili_funnel", 14), get("lili_sell_dropoff"), get("lili_missing_demand", 40),
  get("lili_search_health", 14), get("lili_control_use", 20), get("lili_errors", 20),
  sb.from("lili_events").select("session_id", { count: "exact", head: true }),
]);

const events = totals.count || 0;

// ── one honest paragraph before any numbers ─────────────────────────────────
console.log(`\n${B}lili — the funnel${X}   ${D}${cfg.url}${X}`);

if (events === 0) {
  console.log(`\n${Y}No events at all.${X}`);
  console.log(`\nThat is one of three things, in order of likelihood:`);
  console.log(`  1. Nobody has used the app yet.`);
  console.log(`  2. Analytics consent is off for everyone who has — it is opt-in in`);
  console.log(`     the UAE, and nothing is collected without it. That is correct`);
  console.log(`     behaviour, not a bug, and it means small numbers here are normal.`);
  console.log(`  3. Anonymous sign-in is still disabled, so the app has no session and`);
  console.log(`     cannot write anything. Run ${B}npm run preflight${X}.\n`);
  process.exit(0);
}

const total = funnel.reduce((a, r) => a + Number(r.sessions || 0), 0);
const sum = (k) => funnel.reduce((a, r) => a + Number(r[k] || 0), 0);

const STEPS = [
  ["sessions",         "opened the app"],
  ["browsed",          "reached a screen"],
  ["searched",         "searched"],
  ["opened_a_listing", "opened a listing"],
  ["saved_something",  "saved something"],
  ["started_selling",  "started to list"],
  ["listed_something", "published a listing"],
  ["messaged",         "sent a message"],
  ["made_an_offer",    "made an offer"],
];

console.log(`\n${B}Where people stop${X}  ${D}last ${funnel.length} days · ${events} events · counted by session${X}\n`);
let prev = null;
const rows = [];
for (const [key2, label] of STEPS) {
  const n = key2 === "sessions" ? total : sum(key2);
  const pctAll = total ? Math.round((100 * n) / total) : 0;
  const drop = prev !== null && prev > 0 ? Math.round((100 * (prev - n)) / prev) : null;
  rows.push({ label, n, pctAll, drop });
  const bar = "█".repeat(Math.round(pctAll / 4)).padEnd(25, "·");
  const dropTxt = drop === null ? "" : drop >= 50 ? `${R}−${drop}%${X}` : drop >= 25 ? `${Y}−${drop}%${X}` : `${D}−${drop}%${X}`;
  console.log(`  ${String(n).padStart(5)}  ${bar} ${String(pctAll).padStart(3)}%  ${label}  ${dropTxt}`);
  prev = n;
}

const worst = rows.slice(1).reduce((a, r) => (r.drop > (a?.drop ?? -1) ? r : a), null);
if (worst && worst.drop >= 25) {
  console.log(`\n  ${B}Biggest fall:${X} ${worst.drop}% of people who got that far did not "${worst.label}".`);
}

// ── the sell wizard ─────────────────────────────────────────────────────────
if (dropoff.length) {
  console.log(`\n${B}How far a seller gets${X}\n`);
  for (const d of dropoff) {
    console.log(`  step ${d.furthest_step}   ${String(d.attempts).padStart(4)} attempts   ` +
      `${String(d.published).padStart(4)} published   ${D}${d.pct_published ?? 0}%${X}` +
      (d.warnings_shown ? `   ${D}${d.warnings_shown} warnings shown${X}` : ""));
  }
}

// ── the shopping list ───────────────────────────────────────────────────────
console.log(`\n${B}Asked for, and not there${X}  ${D}zero-result searches — this is a shopping list${X}\n`);
if (!missing.length) console.log(`  ${D}nothing yet${X}`);
for (const m of missing.slice(0, 20)) {
  console.log(`  ${String(m.people).padStart(4)} ${m.people === 1 ? "person " : "people "} ${B}${m.term}${X}` +
    `   ${D}${m.times}×${X}`);
}

if (health.length) {
  const h = health[0];
  const tone = (h.pct_empty ?? 0) > 25 ? R : (h.pct_empty ?? 0) > 10 ? Y : G;
  console.log(`\n${B}Search${X}  ${D}most recent day${X}`);
  console.log(`  ${h.searches} searches · ${tone}${h.pct_empty ?? 0}% found nothing${X} · ` +
    `${h.took_a_suggestion} took a suggestion afterwards`);
}

// ── controls ────────────────────────────────────────────────────────────────
if (controls.length) {
  console.log(`\n${B}Controls people actually use${X}  ${D}sort and filters were decorative until v2.9${X}\n`);
  for (const c of controls.slice(0, 10)) {
    const what = c.sort_choice || (c.filters_active != null ? `${c.filters_active} filters` : "");
    console.log(`  ${String(c.uses).padStart(4)}×  ${c.name}${what ? `  ${D}${what}${X}` : ""}  ${D}${c.people} people${X}`);
  }
}

if (errors.length) {
  console.log(`\n${R}${B}Where it fell over${X}\n`);
  for (const e of errors) console.log(`  ${String(e.times).padStart(4)}×  ${e.place}  ${D}${e.app_version || ""}${X}`);
}

console.log(`\n${D}Consent is opt-in here, so this is what the people who agreed did — not`);
console.log(`everyone. Read it for shape and for the biggest fall, not for absolute`);
console.log(`counts, and never as a substitute for sitting next to a seller.${X}\n`);

// ── optional HTML ───────────────────────────────────────────────────────────
if (wantHtml) {
  const esc = (v) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const bar = (r) => `<tr><td>${esc(r.label)}</td><td class="n">${r.n}</td>
    <td class="bar"><span style="width:${r.pctAll}%"></span></td><td class="n">${r.pctAll}%</td>
    <td class="n ${r.drop >= 50 ? "bad" : r.drop >= 25 ? "warn" : ""}">${r.drop == null ? "" : "−" + r.drop + "%"}</td></tr>`;
  const html = `<title>lili funnel</title>
<style>
 :root{--ink:#1C1713;--lt:#8A7F76;--line:#E6DCD2;--terra:#C4856A;--bg:#FBF7F3}
 @media (prefers-color-scheme:dark){:root:not([data-theme=light]){--ink:#F2EAE2;--lt:#A79C93;--line:#3A322C;--bg:#171310}}
 :root[data-theme=dark]{--ink:#F2EAE2;--lt:#A79C93;--line:#3A322C;--bg:#171310}
 body{background:var(--bg);color:var(--ink);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:28px 20px;max-width:860px;margin-inline:auto}
 h1{font:italic 26px Georgia,serif;margin:0 0 4px} h2{font:italic 18px Georgia,serif;margin:32px 0 10px}
 p.sub{color:var(--lt);margin:0 0 24px;font-size:12.5px}
 table{width:100%;border-collapse:collapse;font-size:13px} td,th{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left}
 th{font-size:10.5px;letter-spacing:.6px;text-transform:uppercase;color:var(--lt);font-weight:700}
 td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
 td.bar{width:40%} td.bar span{display:block;height:9px;border-radius:5px;background:var(--terra)}
 .bad{color:#B4453A;font-weight:700} .warn{color:#A87A2E}
 .note{color:var(--lt);font-size:12px;margin-top:28px;border-top:1px solid var(--line);padding-top:14px}
 code{background:var(--line);padding:1px 5px;border-radius:4px;font-size:12px}
</style>
<h1>lili — the funnel</h1>
<p class="sub">${esc(new Date().toISOString().slice(0, 16).replace("T", " "))} · ${events} events · counted by session</p>
<h2>Where people stop</h2>
<table><tr><th>step</th><th class="n">n</th><th></th><th class="n">of all</th><th class="n">fall</th></tr>
${rows.map(bar).join("\n")}</table>
<h2>Asked for, and not there</h2>
<p class="sub">Zero-result searches. A shopping list written by people who wanted to buy.</p>
<table><tr><th>term</th><th class="n">people</th><th class="n">times</th></tr>
${missing.slice(0, 30).map((m) => `<tr><td>${esc(m.term)}</td><td class="n">${m.people}</td><td class="n">${m.times}</td></tr>`).join("\n") || '<tr><td colspan="3">nothing yet</td></tr>'}</table>
<h2>How far a seller gets</h2>
<table><tr><th>furthest step</th><th class="n">attempts</th><th class="n">published</th><th class="n">%</th></tr>
${dropoff.map((d) => `<tr><td>step ${d.furthest_step}</td><td class="n">${d.attempts}</td><td class="n">${d.published}</td><td class="n">${d.pct_published ?? 0}%</td></tr>`).join("\n") || '<tr><td colspan="4">nothing yet</td></tr>'}</table>
<p class="note">Analytics consent is opt-in in the UAE and nothing is collected without
it, so this is what the people who agreed did — not everyone. Read it for shape and for the
biggest fall, not for absolute counts. Generated by <code>npm run funnel -- --html</code>;
never commit this file, and never commit the key that produced it.</p>`;
  writeFileSync("funnel.html", html);
  console.log(`${D}Wrote funnel.html${X}\n`);
}
