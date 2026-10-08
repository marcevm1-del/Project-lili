// ─────────────────────────────────────────────────────────────────────────────
//  INTEGRATION
//
//  The functional pass checked arithmetic on one screen. This checks the things
//  that span screens and survive restarts — where the bugs actually live:
//
//    · does a shop you create still exist after closing the app?
//    · does a listing you publish appear in your shop, and stay there?
//    · does blocking a seller remove them from the feed, search AND shops?
//    · does a report actually arrive in the moderation queue?
//    · does the counterfeit screen actually stop a listing being published?
//    · do language and theme choices survive a reload?
//    · does withdrawing consent stick?
//
//  Usage: npm run integration
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from "playwright";
import { offline } from "./testnet.mjs";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = "dist", PORT = 4198;
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
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));

let pass = 0, fail = 0;
const check = (l, ok, x = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${l}${!ok && x ? `\n      \x1b[2m${x}\x1b[0m` : ""}`);
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);
// v2.8 — every miss is recorded.
//
// tap() returns false when the button is not there and the caller almost never
// checks, so a whole section could walk past a screen it never reached and
// still report green. That is exactly what happened: after the reload in
// "Choices persist" the app was back at the market gate, tap("Shop Now") missed
// silently, and the Arabic check ran against a gate screen it had never left.
// The assertion had never once tested language persistence.
//
// A helper that swallows a miss is how a suite ends up testing nothing.
const misses = [];
const tap = async (t, { optional = false } = {}) => {
  const el = page.locator(`button:has-text("${t}")`).first();
  if (await el.count() === 0) { if (!optional) misses.push(t); return false; }
  try { await el.scrollIntoViewIfNeeded({ timeout: 700 }).catch(() => {}); await el.click({ timeout: 1500 }); await page.waitForTimeout(300); return true; }
  catch { misses.push(`${t} (present but unclickable)`); return false; }
};

/** For steps the rest of the run depends on: say so loudly instead of drifting. */
const mustTap = async (t) => {
  const ok = await tap(t);
  if (!ok) throw new Error(`required control never appeared: "${t}"`);
  return ok;
};
const label = async (l) => {
  const el = page.locator(`button[aria-label="${l}"]`).first();
  if (await el.count() === 0) return false;
  await el.click({ timeout: 2500 }); await page.waitForTimeout(340); return true;
};
const txt = () => page.evaluate(() => document.body.innerText);
const tiles = () => page.evaluate(() => [...document.querySelectorAll("div")]
  .filter(d => d.style.cursor === "pointer" && /AED/.test(d.textContent || ""))
  .filter((d, _, a) => !a.some(o => o !== d && d.contains(o)))
  .map(d => (d.textContent || "").slice(0, 70)));

async function passGate() {
  // Every step here is optional on purpose. The gate may be wholly or partly
  // passed already — the browse choice and the consent record both persist now
  // — so re-running this must be harmless and must not be counted as a missed
  // interaction. Anything the run genuinely depends on uses mustTap().
  const o = { optional: true };
  await tap("look around anyway", o);
  const yr = page.locator("input").first();
  if (await yr.count()) await yr.fill("1994").catch(() => {});
  await tap("I agree to lili's Platform Terms", o);
  await tap("I agree to Privacy Notice", o);
  await tap("Agree and continue", o);
  await tap("Save choices", o);
  await tap("Shop Now", o);
  await tap("Skip", o);
  await page.waitForTimeout(400);
}

console.log("\n\x1b[1mINTEGRATION — state that must survive\x1b[0m");
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await passGate();

// ── create a shop, then reload ────────────────────────────────────────────
section("A shop you open still exists tomorrow");
await label("Sell");
const nameField = page.locator('input[placeholder*="Desert Rose"]').first();
check("shop setup is reachable", await nameField.count() > 0);
if (await nameField.count()) {
  await nameField.fill("Sahara Closet");
  await tap("Selling from my own wardrobe");
  await tap("Continue");
  const { sellerClausesFor } = await import("./src/compliance/agreements.js");
  for (const c of sellerClausesFor("listing")) await tap(c.title);
  await tap("Agree and open my shop");
  // opening a shop now offers sign-in first; these suites run without an account
  await tap("Not now");
  await page.waitForTimeout(600);
  check("the shop is created", /Sahara Closet/.test(await txt()), (await txt()).slice(0, 80));

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await passGate();
  await page.waitForTimeout(400);
  await label("Sell");
  await page.waitForTimeout(400);
  check("the shop survives a restart", /Sahara Closet/.test(await txt()),
        (await txt()).slice(0, 90));
}

// ── publish a listing, then reload ────────────────────────────────────────
section("A piece you list stays listed");
await tap("List Item");
await tap("Quick");
// v2.9: the photos step now warns once when there is no photograph — a
// photograph being the single largest determinant of whether a piece sells —
// and lets her past on the second tap of the same button. Every other step
// warns and advances in one. Two taps here is the deliberate behaviour, not a
// stuck screen; see `next` in SellPage.
await tap("Next");            // the nudge
await tap("Next");            // past the photos step
await page.waitForTimeout(300);
// the flow is photos -> details -> price; fill the title on the details step
const title = page.locator('input[placeholder*="Chanel Classic"]').first();
if (await title.count()) { await title.fill("Silk Midi Dress"); await tap("Next"); await page.waitForTimeout(300); }
const priceField = page.locator('input[inputmode="decimal"]').first();
if (await priceField.count()) {
  await priceField.fill("850");
  await page.waitForTimeout(400);
  const published = await tap("List Your Item") || await tap("List with Authentication")
                 || await tap("Submit for review") || await tap("Skip authentication");
  await page.waitForTimeout(700);
  check("a listing can be published", published);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await passGate();
  await page.waitForTimeout(500);
  const feed = (await tiles()).join(" | ");
  check("the new listing survives a restart", /Silk Midi Dress/i.test(feed),
        feed.slice(0, 120));
} else check("listing form reachable", false);

// ── counterfeit screening actually blocks ─────────────────────────────────
section("Screening stops what it says it stops");
await label("Sell");
await tap("List Item");
await tap("Quick");
await tap("Next");            // past the photos step
await page.waitForTimeout(300);
const badTitle = page.locator('input[placeholder*="Chanel Classic"]').first();
if (await badTitle.count()) { await badTitle.fill("Chanel replica bag mirror quality"); await tap("Next"); await page.waitForTimeout(300); }
if (await page.locator('input[inputmode="decimal"]').count()) {
  await page.locator('input[inputmode="decimal"]').first().fill("400");
  await page.waitForTimeout(500);
  const screen = await txt();
  check("a self-declared replica is refused", /can't be listed|Can't be listed/i.test(screen),
        screen.slice(0, 120));
  const blocked = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => /Can't be listed/i.test(x.textContent));
    return b ? b.disabled : null;
  });
  check("the publish button is actually disabled", blocked === true, `disabled=${blocked}`);
}

// ── blocking removes a seller everywhere ──────────────────────────────────
section("Blocking a seller removes them everywhere");
await label("Home");
await page.waitForTimeout(400);
const before = await tiles();
const tile = page.locator('div:has-text("AED")').last();
await tile.click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(400);
const reported = await tap("Report this listing");
if (reported) {
  await tap("Counterfeit or replica");
  const brand = page.locator('input[placeholder*="Chanel"]').first();
  if (await brand.count()) await brand.fill("Chanel");
  const blockToggle = page.locator('button:has-text("Also block")').first();
  const shopName = await page.evaluate(() => {
    const m = document.body.innerText.match(/Also block (.+)/);
    return m ? m[1].trim() : null;
  });
  if (await blockToggle.count()) await blockToggle.click();
  await page.waitForTimeout(200);
  await tap("Send report");
  // The receipt waits briefly for the server before it appears — sending a
  // report is not instant any more, and a fixed 500ms sleep asserted against
  // whatever happened to be on screen. Wait for the thing itself.
  await page.getByText("Report received").first()
    .waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  check("the report is acknowledged", /Report received/.test(await txt()));
  await tap("Done");
  await page.waitForTimeout(500);

  const after = await tiles();
  check("the feed shrinks after blocking", after.length < before.length,
        `before ${before.length}, after ${after.length}`);
  if (shopName) {
    await label("Search");
    await page.waitForTimeout(400);
    const searchTiles = (await tiles()).join(" | ");
    check("the blocked seller is gone from search too",
          !searchTiles.includes(shopName), shopName);
  }

  // and the report should be in the queue
  await label("Profile");
  await tap("Privacy & Safety");
  await tap("Moderation queue");
  await page.waitForTimeout(400);
  const queue = await txt();
  check("the report reached the moderation queue",
        !/Nothing waiting/.test(queue) && /Waiting|Being read|counterfeit/i.test(queue),
        queue.slice(0, 120));
  await tap("←"); await tap("←");
}

// ── settings persist ──────────────────────────────────────────────────────
section("Choices persist");
await label("Profile");
await tap("Appearance");
await page.locator('button:has(div:text-is("Dark"))').first().click().catch(() => {});
await page.waitForTimeout(400);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(900);
check("dark mode survives a restart",
      await page.evaluate(() => document.documentElement.getAttribute("data-theme")) === "dark");

// The gate can be back after a reload (a fresh install would see it too), so
// go through it properly rather than assuming we are already inside.
await passGate();
await label("Profile");
await mustTap("Language");
await mustTap("العربية");
await page.waitForTimeout(400);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(700);
check("Arabic survives a restart",
      await page.evaluate(() => document.documentElement.dir) === "rtl");

section("Runtime");
check("no page errors throughout", errs.length === 0, [...new Set(errs)].slice(0, 3).join(" | "));
check("no interaction was silently missed", misses.length === 0,
      [...new Set(misses)].slice(0, 6).join(" | "));

console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m\n`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
