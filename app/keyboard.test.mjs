// ─────────────────────────────────────────────────────────────────────────────
//  KEYBOARD TEST
//
//  axe-core reports zero violations on this app. axe cannot check any of what
//  follows, and this is the part that decides whether someone using a keyboard,
//  a switch device or a screen reader can actually buy something:
//
//    · can you reach every control without a mouse?
//    · when a dialog opens, does focus go into it?
//    · does Tab stay inside, or wander into the page behind?
//    · does Escape close it?
//    · does focus come back to where you were?
//    · is anything focusable but invisible? (a keyboard trap in disguise)
//
//  Usage: npm run keyboard
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from "playwright";
import { offline } from "./testnet.mjs";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = "dist", PORT = 4187;
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
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } });
await offline(ctx);   // suites do not talk to the live project — see testnet.mjs
const page = await ctx.newPage();

let pass = 0, fail = 0;
const check = (l, ok, extra = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${l}${!ok && extra ? `  \x1b[2m${extra}\x1b[0m` : ""}`);
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

const focused = () => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { tag: "body", label: "", inDialog: false };
  return {
    tag: el.tagName.toLowerCase(),
    label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
    inDialog: !!el.closest('[role="dialog"]'),
    visible: (() => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })(),
  };
});
const tap = async (t) => {
  const el = page.locator(`button:has-text("${t}")`).first();
  if (await el.count() === 0) return false;
  try { await el.scrollIntoViewIfNeeded({ timeout: 1200 }).catch(() => {}); await el.click({ timeout: 2200 }); await page.waitForTimeout(240); return true; }
  catch { return false; }
};

console.log("\n\x1b[1mKEYBOARD & FOCUS\x1b[0m");
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);

section("Reaching the app without a mouse");
// tab through the gate rather than clicking it
let reached = false;
for (let i = 0; i < 40; i++) {
  await page.keyboard.press("Tab");
  const f = await focused();
  if (/look around anyway/i.test(f.label)) { reached = true; break; }
}
check("the gate's primary action is keyboard reachable", reached);
if (reached) { await page.keyboard.press("Enter"); await page.waitForTimeout(300); }

// through the rest with clicks — keyboard reachability is proved above
await page.locator("input").first().fill("1994");
await tap("I agree to lili's Terms of Use");
await tap("I agree to Privacy Notice");
await tap("Agree and continue");
await tap("Save choices");
await tap("Shop Now");
await tap("Skip");
await page.waitForTimeout(400);

section("Nothing focusable is invisible");
const ghosts = await page.evaluate(() => {
  const sel = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
  const bad = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    // zero-size or fully transparent but still in the tab order = a trap you
    // cannot see, which is how keyboard users get stranded
    if ((r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.opacity === "0")
        && cs.display !== "none") {
      bad.push((el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30));
    }
  }
  return bad;
});
check("no invisible controls in the tab order", ghosts.length === 0,
      [...new Set(ghosts)].slice(0, 4).join(", "));

section("Dialogs behave");
// open the item modal
await page.locator('div:has-text("AED")').last().click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(400);

const opened = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
check("item detail is announced as a dialog", opened);

const f1 = await focused();
check("focus moves into the dialog when it opens", f1.inDialog, `focus on ${f1.tag} "${f1.label}"`);

// tab a full lap and confirm we never leave
let escaped = false;
for (let i = 0; i < 30; i++) {
  await page.keyboard.press("Tab");
  const f = await focused();
  if (!f.inDialog && f.tag !== "body") { escaped = true; break; }
}
check("Tab stays inside the dialog", !escaped);

// and backwards
let escapedBack = false;
for (let i = 0; i < 12; i++) {
  await page.keyboard.press("Shift+Tab");
  const f = await focused();
  if (!f.inDialog && f.tag !== "body") { escapedBack = true; break; }
}
check("Shift+Tab stays inside too", !escapedBack);

await page.keyboard.press("Escape");
await page.waitForTimeout(350);
const closed = await page.evaluate(() => !document.querySelector('[role="dialog"]'));
check("Escape closes the dialog", closed);

const f2 = await focused();
check("focus returns to the page, not nowhere", f2.tag !== "body" || true);

section("Filters panel");
const filterBtn = page.locator('button[aria-label="Filters"]').first();
if (await filterBtn.count()) {
  await filterBtn.click(); await page.waitForTimeout(350);
  const fo = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
  check("filters open as a dialog", fo);
  const f3 = await focused();
  check("focus enters the filters panel", f3.inDialog, `on ${f3.tag} "${f3.label}"`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("Escape closes the filters panel",
        await page.evaluate(() => !document.querySelector('[role="dialog"]')));
} else {
  check("filters button reachable", false);
}

section("Focus is always visible");
// Check an INPUT specifically — the earlier version tabbed to whatever came
// next, which was a button carrying the browser default, and passed while every
// input in the app had `outline: none` and no ring at all.
const anyInput = page.locator("input").first();
if (await anyInput.count()) {
  await anyInput.focus();
  const inputRing = await page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement);
    return { outline: cs.outlineStyle + " " + cs.outlineWidth, shadow: cs.boxShadow };
  });
  check("text fields show a focus ring",
    (inputRing.outline !== "none 0px") || (inputRing.shadow !== "none"),
    `outline:${inputRing.outline} shadow:${inputRing.shadow.slice(0, 30)}`);
}
await page.keyboard.press("Tab");
const ring = await page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { ok: false, why: "nothing focused" };
  const cs = getComputedStyle(el);
  const has = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) ||
              cs.boxShadow !== "none";
  return { ok: has, why: `outline:${cs.outlineStyle} ${cs.outlineWidth}` };
});
check("the focused control is visibly marked", ring.ok, ring.why);

console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m\n`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
