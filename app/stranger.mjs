// ─────────────────────────────────────────────────────────────────────────────
//  THE STRANGER
//
//  Run: npm run stranger
//
//  Every other suite here is written by someone who knows what the app does.
//  That is exactly the wrong person to find out whether a woman who has never
//  sold anything can put a dress up for sale.
//
//  So this one is deliberately stupid. It reads only what is on the screen. It
//  taps the most obvious thing. It never uses a selector that depends on
//  knowing the code, and it never fills in a field the screen did not ask it
//  to. When it gets stuck it says what it could see at the moment it got
//  stuck, because "she couldn't find it" is the finding — not a stack trace.
//
//  What it is checking for, in order of how badly it hurts:
//
//    1. A DEAD END — a screen with nothing tappable that moves her forward.
//       She closes the app here and does not come back.
//    2. A SILENT REFUSAL — she taps the thing and nothing happens, with no
//       reason given. Reads as broken rather than unfinished.
//    3. AN UNEXPLAINED REQUIREMENT — a field she must fill in with no clue
//       what belongs in it, or a rule she can only discover by breaking it.
//    4. A LIE — anything on screen that this project's own claims register
//       says is not true.
//
//  It is not an assertion suite. It reports what happened to her.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from "playwright";
import { offline } from "./testnet.mjs";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = "dist", PORT = 4197;
if (!existsSync(DIST)) { console.error("Run `npm run build` first."); process.exit(1); }
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = createServer((req, res) => {
  let p = join(DIST, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(p) || p.endsWith("/")) p = join(DIST, "index.html");
  res.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true });
await offline(ctx);   // suites do not talk to the live project — see testnet.mjs
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 140)));

const findings = [];
const note = (severity, what, saw) => {
  findings.push({ severity, what, saw });
  const colour = { deadend: "\x1b[31m", silent: "\x1b[31m", unexplained: "\x1b[33m", lie: "\x1b[31m" }[severity] || "";
  console.log(`  ${colour}▲\x1b[0m ${what}`);
  if (saw) console.log(`      \x1b[2m${String(saw).replace(/\n/g, " · ").slice(0, 160)}\x1b[0m`);
};
const good = (what) => console.log(`  \x1b[32m·\x1b[0m ${what}`);
const step = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

const text = () => page.evaluate(() => document.body.innerText);

/** Everything she could actually tap, as she would see it. */
const affordances = () => page.evaluate(() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 8 && r.height > 8 && s.visibility !== "hidden" && s.opacity !== "0";
  };
  const out = [];
  for (const el of document.querySelectorAll("button, [role=button], a, input, select, textarea")) {
    if (!vis(el)) continue;
    // The tab bar is always there and always tappable. A screen that offers
    // her nothing but the tab bar has offered her nothing.
    let nav = false;
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.position === "fixed" && n.getBoundingClientRect().top > innerHeight * 0.7) { nav = true; break; }
    }
    out.push({
      nav,
      tag: el.tagName.toLowerCase(),
      label: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 60),
      disabled: !!el.disabled || el.getAttribute("aria-disabled") === "true",
      type: el.getAttribute("type") || "",
    });
  }
  return out;
});

/** A button label can contain quotes and newlines, so it is never spliced into
 *  a selector string — Playwright's own text filter takes it as data. */
const tap = async (label) => {
  const clean = String(label).split("\n")[0].trim().slice(0, 45);
  if (!clean) return false;
  const el = page.locator("button").filter({ hasText: clean }).first();
  if (!(await el.count())) return false;
  try {
    await el.scrollIntoViewIfNeeded({ timeout: 1200 }).catch(() => {});
    await el.click({ timeout: 2500 });
    await page.waitForTimeout(320);
    return true;
  } catch { return false; }
};

/** Tap it, and say so if the screen did not change. That is a silent refusal. */
const tapAndWatch = async (label, why) => {
  const before = await text();
  const did = await tap(label);
  if (!did) { note("deadend", `Couldn't find "${label}" — ${why}`, (await affordances()).map((a) => a.label).join(" | ")); return false; }
  await page.waitForTimeout(400);
  const after = await text();
  if (before === after) { note("silent", `"${label}" did nothing and said nothing — ${why}`, after.slice(0, 140)); return false; }
  return true;
};

/**
 * Fill in whatever this screen is asking for, using only what it says.
 *
 * A field with no label, no aria-label and no placeholder is itself a finding:
 * she cannot know what belongs in it, so it is reported before it is filled.
 */
const fillWhatItAsksFor = async () => {
  const boxes = page.locator("input:not([type=file]):not([type=checkbox]), textarea");
  const n = await boxes.count();
  for (let i = 0; i < n; i++) {
    const b = boxes.nth(i);
    if (!(await b.isVisible().catch(() => false))) continue;
    if (await b.inputValue().catch(() => "")) continue;
    const said = await b.evaluate((el) =>
      ((el.getAttribute("aria-label") || "") + " " +
       (el.labels && el.labels[0] ? el.labels[0].innerText : "") + " " +
       (el.getAttribute("placeholder") || "")).trim()).catch(() => "");
    if (!said) note("unexplained", "A field with nothing at all saying what goes in it");
    const value =
      /year|birth|سنة/i.test(said) ? "1994"
      : /price|aed|amount/i.test(said) ? "450"
      : /shop|name|title/i.test(said) ? "Test Shop"
      : /brand/i.test(said) ? "Zara"
      : "Something";
    await b.fill(value, { timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(180);
  }
};

console.log("\n\x1b[1mTHE STRANGER — can a woman who has never sold anything list a dress?\x1b[0m");
console.log("\x1b[2mReads only what is on screen. Taps the obvious thing. Reports where she stops.\x1b[0m");

// ── getting in ───────────────────────────────────────────────────────────────
step("1. Opening the app for the first time");
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);

// She does what the screen asks: fills in what it asks for, ticks what it
// says to tick, then presses the one obvious button. Nothing is tapped twice —
// a tick that is toggled back off is how a script fools itself into believing
// it is making progress.
const tapped = new Set();
let guard = 0;
while (guard++ < 20) {
  // 1. Fill in whatever this screen asks for.
  await fillWhatItAsksFor();

  // 2. Tick anything that says to tick it — once each.
  const ticks = (await affordances()).filter((a) => a.tag === "button" && !a.disabled &&
    /^I agree|^I accept|^I confirm/i.test(a.label));
  let ticked = false;
  for (const tk of ticks) {
    if (tapped.has(tk.label)) continue;
    tapped.add(tk.label);
    if (await tap(tk.label)) { ticked = true; break; }
  }
  if (ticked) continue;

  // 3. The one obvious way forward.
  const acts = await affordances();
  const cta = acts.find((a) => a.tag === "button" && !a.disabled &&
    /continue|save choices|shop now|skip|get started|look around|start/i.test(a.label));
  const stuck = acts.find((a) => a.tag === "button" && a.disabled &&
    /continue|tick|add your/i.test(a.label));
  if (!cta && stuck) {
    note("deadend", `The way in stops at a button she cannot press: "${stuck.label}"`,
         (await text()).slice(0, 160));
    break;
  }
  if (!cta) break;
  if (!(await tap(cta.label))) break;
}

const home = await text();
if (/AED/.test(home)) good("She gets to a feed with pieces in it");
else note("deadend", "The way in does not end at anything she can shop", home.slice(0, 200));

// ── finding how to sell ──────────────────────────────────────────────────────
step("2. Finding how to sell something");
const nav = await page.evaluate(() =>
  [...document.querySelectorAll("button[aria-label]")].map((b) => b.getAttribute("aria-label")));
const sellish = nav.filter((n) => /sell|list|\+|add/i.test(n || ""));
if (!sellish.length) note("deadend", "Nothing in the navigation says anything about selling", nav.join(" | "));
else good(`The navigation offers: ${sellish.join(", ")}`);

const sellBtn = page.locator(`button[aria-label="${sellish[0] || "Sell"}"]`).first();
if (await sellBtn.count()) { await sellBtn.click(); await page.waitForTimeout(600); }

const sellScreen = await text();
step("3. The first sell screen");
console.log(`\x1b[2m  ${sellScreen.split("\n").filter(Boolean).slice(0, 6).join(" · ").slice(0, 190)}\x1b[0m`);

// Does it tell her the two things she will want to know before she starts?
if (/9\s*%|commission|fee|receive/i.test(sellScreen)) good("It says what selling costs before she starts");
else note("unexplained", "Nothing on the first sell screen says what selling costs", sellScreen.slice(0, 160));

if (/pay(s)? (you|her) (directly|in person)|in person|meet/i.test(sellScreen)) good("It says how she gets paid");
else note("unexplained", "Nothing says how she actually gets the money", sellScreen.slice(0, 160));

// ── the flow ─────────────────────────────────────────────────────────────────
step("4. Walking the listing flow");
const acts0 = (await affordances()).filter((a) => !a.nav);
const starters = acts0.filter((a) => a.tag === "button" && !a.disabled &&
  /quick|guided|several|start|list an|create/i.test(a.label));
// Being asked to open a shop before listing anything is a real requirement,
// not a dead end — but it has to be obvious that that is what is happening.
const shopFirst = /open your shop|how are you selling/i.test(await text());
if (!starters.length && shopFirst) {
  good("She is asked to open a shop first, and the screen says so");
} else if (!starters.length) {
  note("deadend", "No obvious way to begin a listing", acts0.map((a) => a.label).filter(Boolean).join(" | "));
} else {
  good(`She can begin with: ${starters.map((s) => s.label.split("\n")[0]).join(" / ")}`);
  await tap(starters[0].label);
  await page.waitForTimeout(500);
}

// Walk forward as far as "Next"/"Continue" will take her, describing each step
// and noting anything required that is not explained.
const seen = [];
let reached = null;
for (let i = 0; i < 8; i++) {
  const t = await text();
  const acts = await affordances();
  const head = t.split("\n").filter(Boolean).slice(0, 3).join(" · ").slice(0, 90);
  seen.push(head);

  await fillWhatItAsksFor();
  const acts2 = await affordances();

  // Only what is on the screen itself. A "Save" in the tab bar is not a way
  // forward through a listing, and following it is how a script convinces
  // itself the flow works while the woman is still stuck.
  const onScreen = acts2.filter((a) => !a.nav);
  const forward = onScreen.find((a) => a.tag === "button" && !a.disabled &&
    /next|continue|publish|list it|done|agree and open/i.test(a.label));
  // Any disabled button on the screen itself. Matching on wording missed
  // "5 left to confirm", which is exactly the kind of label a good screen uses
  // and a regex written from the code never predicts.
  const blocked = onScreen.find((a) => a.tag === "button" && a.disabled && a.label);

  // Nothing obviously forward. Before calling it a wall, she would try the
  // things on the screen — a seller type, a condition, a clause to confirm.
  // One tap each, then look again.
  if (!forward) {
    if (/is live|now listed|added to your shop|view your shop|your piece is up/i.test(t)) {
      reached = "a published listing"; good(`Reached the end: ${head}`); break;
    }
    const choices = onScreen.filter((a) => a.tag === "button" && !a.disabled && a.label &&
      !/cancel|back|skip|report|close/i.test(a.label) && !tapped.has(a.label));
    if (choices.length) {
      tapped.add(choices[0].label);
      if (await tap(choices[0].label)) { i--; continue; }
    }
    // A screen she cannot leave is only fair if it says what is missing — and
    // the blocked button's own label is where she will look first.
    const saysWhy = /need|required|add a|add your|choose|pick|enter a|give your|tell us|left to|no .* yet/i;
    if (blocked && (saysWhy.test(blocked.label) || saysWhy.test(t)))
      good(`"${head}" blocks her, and says what is missing: "${blocked.label.split("\n")[0]}"`);
    else
      note("deadend", `No way forward from "${head}"`,
           onScreen.map((a) => a.label).filter(Boolean).join(" | "));
    break;
  }

  const moved = await tapAndWatch(forward.label, `on "${head}"`);
  if (!moved) break;
}
console.log(`\x1b[2m  path: ${seen.join("  →  ")}\x1b[0m`);

// ── what she was told ────────────────────────────────────────────────────────
step("5. Anything on screen that isn't true");
const { NEVER_CLAIM } = await import("./src/compliance/claims.js");
const finalText = await text();
for (const n of NEVER_CLAIM) {
  const m = finalText.match(n.re);
  if (m) note("lie", `The screen says something the register forbids (${n.id})`, m[0]);
}
if (!findings.some((f) => f.severity === "lie")) good("Nothing on screen contradicts the claims register");

if (errors.length) note("silent", `${errors.length} runtime error(s) while she was doing this`, errors[0]);
else good("No runtime errors anywhere in the walk");

// ── the report ───────────────────────────────────────────────────────────────
const bySeverity = (s) => findings.filter((f) => f.severity === s).length;
console.log(`\n\x1b[1mHow far she got\x1b[0m`);
console.log(reached
  ? `  \x1b[32mAll the way to ${reached}.\x1b[0m`
  : `  \x1b[33mNot to a published listing.\x1b[0m \x1b[2mFurthest screen: ${seen[seen.length - 1] || "the first"}\x1b[0m`);

console.log(`\n\x1b[1mWhat stopped her\x1b[0m`);
if (!findings.length) console.log("  \x1b[32mNothing. Every screen she reached explained itself.\x1b[0m");
else {
  console.log(`  ${bySeverity("deadend")} dead end(s) · ${bySeverity("silent")} silent refusal(s) · ` +
              `${bySeverity("unexplained")} unexplained requirement(s) · ${bySeverity("lie")} untrue statement(s)`);
  for (const f of findings) console.log(`    · ${f.what}`);
}
console.log("");

await browser.close();
server.close();
// Dead ends and lies fail the run. An unexplained requirement is a note, not a
// blocker — it is a judgement about wording and a person should read it.
process.exit(bySeverity("deadend") + bySeverity("silent") + bySeverity("lie") > 0 ? 1 : 0);
