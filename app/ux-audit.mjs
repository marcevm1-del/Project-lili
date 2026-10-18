#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  UX AUDIT — the Laws of UX, checked rather than quoted
//
//  Jakob's Law, Fitts's Law, Hick's Law, Miller's Law, Doherty Threshold.
//  Design heuristics, not legislation — but the ones with numbers attached can
//  be measured against the source, and the ones without can at least be asked
//  as specific questions rather than vague ones.
//
//  Usage: npm run ux
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(jsx?|css)$/.test(f)) files.push({ path: p, text: readFileSync(p, "utf8") });
  }
})("src");

const all = files.map((f) => f.text).join("\n");
const has = (re) => re.test(all);

let pass = 0, warn = 0;
const out = [];
const ok = (law, label, detail = "") => { pass++; out.push({ law, label, ok: true, detail }); };
const flag = (law, label, detail = "") => { warn++; out.push({ law, label, ok: false, detail }); };

// ── FITTS'S LAW ────────────────────────────────────────────────────────────
// Time to hit a target grows as it shrinks. Android's floor is 48dp, Apple's
// 44pt. Anything smaller is a target people miss — and on a marketplace, a
// missed tap on "remove from cart" is a refund request.
const MIN_TAP = 44;
const smallTargets = [];

for (const f of files) {
  // interactive elements carrying an explicit pixel size
  const re = /<button[^>]*?style=\{\{([^}]*(?:\}[^}]*)?)\}\}/gs;
  let m;
  while ((m = re.exec(f.text))) {
    const style = m[1];
    const w = Number((style.match(/\bwidth:\s*(\d+)(?!\d*%)/) || [])[1]);
    const h = Number((style.match(/\bheight:\s*(\d+)(?!\d*%)/) || [])[1]);
    if ((w && w < MIN_TAP) || (h && h < MIN_TAP)) {
      const line = f.text.slice(0, m.index).split("\n").length;
      smallTargets.push({ file: f.path.replace("src/", ""), line, w: w || "auto", h: h || "auto" });
    }
  }
}

if (smallTargets.length === 0) {
  ok("Fitts", `Every sized button meets the ${MIN_TAP}px minimum`);
} else {
  flag("Fitts", `${smallTargets.length} tap targets below ${MIN_TAP}px`,
       smallTargets.map((t) => `${t.file}:${t.line} (${t.w}×${t.h})`).join("  ·  "));
}

// Bottom-nav reachability: the tab bar is the most-tapped surface in the app.
const tabBarHeight = Number(((files.find((f) => /function TabBar/.test(f.text)) || { text: "" })
  .text.match(/height:\s*(\d+)[^}]*paddingBottom/) || [])[1]);
if (tabBarHeight >= MIN_TAP) ok("Fitts", `Tab bar is ${tabBarHeight}px tall`);
else if (tabBarHeight) flag("Fitts", `Tab bar only ${tabBarHeight}px`);

// ── HICK'S LAW ─────────────────────────────────────────────────────────────
// Decision time rises with the number and complexity of choices. Counting
// consecutive gates before a user reaches any value is the sharpest version
// of this for an app like ours.
const provider = files.find((f) => /ComplianceProvider/.test(f.path));
const gates = provider ? (provider.text.match(/gate = </g) || []).length : 0;
if (gates <= 2) ok("Hick", `${gates} screens before the marketplace`);
else flag("Hick", `${gates} consecutive gates before a user sees a single item`,
          "Market → age → terms → consent. Each is defensible alone; together " +
          "they are a wall in front of an app nobody has decided to trust yet.");

// Choice count at the point of first listing. What matters is how many
// decisions stand between a seller and her first piece — not how many
// obligations exist in total.
const agreements = files.find((f) => /agreements\.js$/.test(f.path));
const atListing = agreements
  ? (agreements.text.match(/stage: "listing"/g) || []).length : 0;
const atPayout = agreements
  ? (agreements.text.match(/stage: "payout"/g) || []).length : 0;
if (atListing && atListing <= 5)
  ok("Hick", `${atListing} decisions before a first listing, ${atPayout} deferred to first payout`);
else if (atListing)
  flag("Hick", `${atListing} decisions before a first listing`,
       "The brief asks for a piece live in under two minutes.");

// ── MILLER'S LAW ───────────────────────────────────────────────────────────
// Working memory holds roughly 7 chunks. Navigation beyond that stops being
// scannable and starts needing to be read.
const marketplace = files.find((f) => /Marketplace\.jsx$/.test(f.path));
const tabs = marketplace ? (marketplace.text.match(/\{k:"[a-z]+",/g) || []).length : 0;
if (tabs && tabs <= 7) ok("Miller", `${tabs} primary navigation items`);
else if (tabs) flag("Miller", `${tabs} navigation items`, "Above the ~7 chunk limit");

const legalMenu = files.find((f) => /LegalCenter/.test(f.path));
const menuBlock = legalMenu ? (legalMenu.text.match(/const items = \[[\s\S]*?\n  \];/) || [""])[0] : "";
const legalItems = (menuBlock.match(/^\s+\["/gm) || []).length;
if (legalItems <= 7) ok("Miller", `Privacy & Safety menu has ${legalItems} items`);
else flag("Miller", `Privacy & Safety menu has ${legalItems} items`,
          "Group them — legal, safety, and your data are three different errands.");

// ── JAKOB'S LAW ────────────────────────────────────────────────────────────
// People expect this app to behave like every other app on their phone.
const conventions = [
  [/useAndroidBack/, "Hardware back behaves as users expect"],
  [/safe-area-inset-bottom/, "Content clears the gesture bar"],
  [/tab==="cart"/, "Cart is a first-class destination"],
  [/cartCount/, "Cart shows a count badge"],
  [/placeholder=/, "Inputs carry placeholders"],
  [/type="file"[^>]*accept="image/, "Photo picker uses the system picker"],
  [/inputMode="numeric"|inputMode: "numeric"/, "Numeric fields raise the number pad"],
];
for (const [re, label] of conventions) {
  const found = files.some((f) => re.test(f.text));
  found ? ok("Jakob", label) : flag("Jakob", `Missing: ${label}`);
}

// A pull-to-refresh-less feed and a non-standard scroll are the two most
// common ways a WebView app announces it is a WebView app.
const overscroll = files.some((f) => /overscroll-behavior/.test(f.text));
overscroll ? ok("Jakob", "Overscroll bounce suppressed — doesn't read as a web page")
           : flag("Jakob", "Overscroll not handled");

// ── DOHERTY THRESHOLD ──────────────────────────────────────────────────────
// Under 400ms feels instant. Above it, attention wanders.
const artificialDelays = [];
for (const f of files) {
  const re = /setTimeout\([^,]+,\s*(\d{3,})\)/g;
  let m;
  while ((m = re.exec(f.text))) {
    const ms = Number(m[1]);
    if (ms > 400) {
      artificialDelays.push({ file: f.path.replace("src/", ""), ms,
                              line: f.text.slice(0, m.index).split("\n").length });
    }
  }
}
if (artificialDelays.length === 0) ok("Doherty", "No artificial waits over 400ms");
else flag("Doherty", `${artificialDelays.length} deliberate delays above 400ms`,
          artificialDelays.map((d) => `${d.file}:${d.line} — ${d.ms}ms`).join("  ·  "));

// Loading feedback: anything async should say so.
const hasBusyState = files.some((f) => /busy|loading|Working/i.test(f.text));
hasBusyState ? ok("Doherty", "Async actions show a busy state")
             : flag("Doherty", "No visible loading feedback");

// ── AESTHETIC–USABILITY & CONSISTENCY ──────────────────────────────────────
// One palette, one type scale. Divergent tokens are how a design drifts.
const paletteDefs = files.filter((f) => /^const C = \{|export const C = \{/m.test(f.text));
if (paletteDefs.length <= 2) ok("Consistency", `${paletteDefs.length} palette definitions`);
else flag("Consistency", `${paletteDefs.length} separate palette definitions`,
          paletteDefs.map((f) => f.path.replace("src/", "")).join(", "));

// ── POSTEL'S LAW ───────────────────────────────────────────────────────────
// Be liberal in what you accept. In a bilingual market that means an Arabic
// keyboard's own digits must work everywhere Latin digits do.
const inputLib = files.find((f) => /ux\/input\.js$/.test(f.path));
if (inputLib) {
  ok("Postel", "Input normalisation layer exists");
  // v2.11 — these two were greps for the strings "u0660" and "u06f0", so they
  // failed on a library that handles both digit families using the characters
  // themselves and the hex constants 0x0660 / 0x06F0. The behaviour was right
  // and the check was reading notation. It calls the function now.
  //
  // This suite's own opening paragraph warns about exactly this — "assert the
  // property, not the shape" — and it was doing the other thing in two of its
  // own checks.
  const { parsePrice, parseYear } = await import("./src/ux/input.js");
  const digits = [
    ["Arabic-Indic digits accepted", "٣٥٠", 350],
    ["Persian digits accepted", "۳۵۰", 350],
    ["Latin digits still work, obviously", "350", 350],
    ["a price with separators and a currency word", "AED 1,250", 1250],
  ];
  for (const [label, input, want] of digits) {
    const got = parsePrice(input);
    got === want ? ok("Postel", label) : flag("Postel", `${label} — parsePrice("${input}") gave ${got}`);
  }
  parseYear("١٩٩٤") === 1994
    ? ok("Postel", "a year of birth typed on an Arabic keyboard")
    : flag("Postel", "Arabic-Indic year of birth is not parsed");
  const covers = [
    [/parsePhoneAE/, "Phone numbers accepted in any local format"],
    [/INVISIBLE/, "Invisible paste characters stripped"],
  ];
  for (const [re, label] of covers) re.test(inputLib.text) ? ok("Postel", label) : flag("Postel", `Missing: ${label}`);
} else {
  flag("Postel", "No input normalisation — non-Latin digits will be rejected");
}

// type="number" filters non-Latin digits before JS can see them.
const numberInputs = files.filter((f) => /type="number"/.test(f.text));
numberInputs.length === 0
  ? ok("Postel", 'No type="number" fields (they silently drop Arabic digits)')
  : flag("Postel", `${numberInputs.length} file(s) use type="number"`,
         numberInputs.map((f) => f.path.replace("src/", "")).join(", "));

// Year and price must run through the parsers, not raw regex or Number().
has(/parseYear/) ? ok("Postel", "Year of birth parsed, not regex-tested")
                 : flag("Postel", "Year field uses a Latin-only test");
has(/parsePrice/) ? ok("Postel", "Prices parsed leniently")
                  : flag("Postel", "Prices use Number(), which rejects Arabic digits");

// ── GOAL-GRADIENT & ZEIGARNIK ──────────────────────────────────────────────
// Motivation rises as the goal nears — but only if the remaining distance is
// visible. Unfinished tasks also nag, which is why steps should be countable.
has(/Step \{step\} of \{totalSteps\}/) ? ok("Goal-gradient", "Multi-step flow names the remaining distance")
                                        : flag("Goal-gradient", "Progress bar without a step count");
has(/Last step/) ? ok("Goal-gradient", "Final step is called out")
                 : flag("Goal-gradient", "Final step not emphasised");

// ── VON RESTORFF ───────────────────────────────────────────────────────────
// The distinct thing is the thing remembered. More than one competing primary
// button on a screen means neither reads as primary.
for (const f of files.filter((f) => /\.jsx$/.test(f.path))) {
  const primaries = (f.text.match(/background:\s*C\.terra,\s*color:\s*C\.white/g) || []).length;
  if (primaries > 6) {
    flag("Von Restorff", `${f.path.replace("src/", "")} has ${primaries} primary-styled buttons`,
         "If everything is emphasised, nothing is.");
  }
}
if (!out.some((r) => r.law === "Von Restorff")) ok("Von Restorff", "Primary emphasis stays scarce");

// ── SERIAL POSITION EFFECT ─────────────────────────────────────────────────
// First and last items in a list are recalled best, so the most important
// destinations belong at the ends of the tab bar.
const navMatch = (marketplace ? marketplace.text.match(/\{k:"([a-z]+)"/g) || [] : []).map((x) => x.slice(4, -1));
if (navMatch.length) {
  const firstOk = navMatch[0] === "home";
  const lastOk = ["profile", "sell", "cart"].includes(navMatch[navMatch.length - 1]);
  firstOk && lastOk
    ? ok("Serial position", `Nav ends carry weight: ${navMatch[0]} … ${navMatch[navMatch.length - 1]}`)
    : flag("Serial position", `Nav order is ${navMatch.join(" → ")}`,
           "Put the most-used destinations first and last.");
}

// ── PEAK-END RULE ──────────────────────────────────────────────────────────
// An experience is judged by its most intense moment and its ending. Every
// flow that ends should end deliberately.
// v2.11 — the first of these looked for `checkedOut`, the boolean behind the
// fake checkout that v2.9.4 removed. It was asking whether the app still had a
// purchase confirmation for a purchase that cannot happen: passing it would
// have meant the lie was back. It now checks the ending that actually exists.
//
// The third looked for "Request received" — wording that was replaced when
// erasure started returning a receipt of real row counts rather than filing a
// request. Right idea, stale string.
const endings = [
  [/this_is_a_list_not_a_basket/, "The list says what it is, since there is no purchase to confirm"],
  [/its_live|held_for_review/, "Listing something ends on the piece she made"],
  [/Report received/, "Reporting ends with an acknowledgement"],
  [/erased|Nothing was deleted|row counts|receipt/i, "Deletion ends with a receipt"],
];
for (const [re, label] of endings) has(re) ? ok("Peak-end", label) : flag("Peak-end", `Missing: ${label}`);

// ── TESLER'S LAW ───────────────────────────────────────────────────────────
// Complexity is conserved — someone absorbs it. Prefer the system.
has(/normaliseDigits/) ? ok("Tesler", "System converts digit scripts rather than asking the user to")
                       : flag("Tesler", "Digit conversion pushed onto the user");
has(/metadataStripped/) ? ok("Tesler", "System strips photo metadata rather than warning about it")
                        : flag("Tesler", "Photo privacy left to the user");

// ── report ─────────────────────────────────────────────────────────────────
console.log("\n\x1b[1mUX AUDIT — the Laws of UX\x1b[0m");
console.log("\x1b[2mHeuristics, not legislation. Flags are judgement calls, not defects.\x1b[0m\n");

let law = "";
for (const r of out) {
  if (r.law !== law) { law = r.law; console.log(`\n\x1b[1m${law}'s Law\x1b[0m`.replace("Doherty's Law", "Doherty Threshold").replace("Consistency's Law", "Consistency")); }
  const mark = r.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[33m▲\x1b[0m";
  console.log(`  ${mark} ${r.label}`);
  if (r.detail) console.log(`      \x1b[2m${r.detail}\x1b[0m`);
}

console.log(`\n\x1b[1m${pass} good, ${warn} worth a look\x1b[0m`);
console.log("\x1b[2mNothing here is a build failure. These are trade-offs to make deliberately.\x1b[0m\n");
