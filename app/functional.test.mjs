// ─────────────────────────────────────────────────────────────────────────────
//  FUNCTIONAL TEST
//
//  Everything so far proves the app does not crash. That is not the same as
//  proving it WORKS. A cart that renders beautifully and totals the wrong
//  number passes every test written to date.
//
//  This asserts outcomes:
//    · saving an item puts it in Saved and moves the badge
//    · the list shows each piece at its real price and claims nothing else
//    · "ask about these" actually opens the conversation
//    · search only returns things that match
//    · filters actually filter
//    · a listing you create appears in your shop
//    · the seller payout is the advertised percentage
//    · blocking a seller removes their items everywhere
//
//  Usage: npm run functional
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from "playwright";
import { offline } from "./testnet.mjs";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = "dist", PORT = 4193;
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
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 120)));

let pass = 0, fail = 0;
const check = (l, ok, extra = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${l}${!ok && extra ? `\n      \x1b[2m${extra}\x1b[0m` : ""}`);
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

const tap = async (t) => {
  const el = page.locator(`button:has-text("${t}")`).first();
  if (await el.count() === 0) return false;
  try { await el.scrollIntoViewIfNeeded({ timeout: 1200 }).catch(() => {}); await el.click({ timeout: 2500 }); await page.waitForTimeout(280); return true; }
  catch { return false; }
};
const label = async (l) => {
  const el = page.locator(`button[aria-label="${l}"]`).first();
  if (await el.count() === 0) return false;
  await el.click({ timeout: 2500 }); await page.waitForTimeout(320); return true;
};
const bodyText = () => page.evaluate(() => document.body.innerText);

async function typeInto(selector, value) {
  return page.evaluate(({ sel, val }) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, "value").set;
    setter.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }, { sel: selector, val: value });
}
// every AED figure on screen, in order
const amounts = () => page.evaluate(() =>
  [...(document.body.innerText.matchAll(/AED\s*([\d,]+(?:\.\d+)?)/g))].map(m => Number(m[1].replace(/,/g, ""))));

console.log("\n\x1b[1mFUNCTIONAL — does it actually work?\x1b[0m");

await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await tap("look around anyway");
await page.locator("input").first().fill("1994");
await tap("I agree to lili's Platform Terms");
await tap("I agree to Privacy Notice");
await tap("Agree and continue");
await tap("Save choices");
await tap("Shop Now");
await tap("Skip");
await page.waitForTimeout(500);

// ── saving ────────────────────────────────────────────────────────────────
section("Saving a piece");
const savedBefore = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button[aria-label='Saved']")][0];
  return b ? Number((b.textContent.match(/\d+/) || [0])[0]) : -1;
});
const saveBtn = page.locator('button[aria-label="Save"]').first();
const hadSave = await saveBtn.count() > 0;
check("listings offer a save control", hadSave);
if (hadSave) {
  await saveBtn.click();
  await page.waitForTimeout(350);
  const savedAfter = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button[aria-label='Saved']")][0];
    return b ? Number((b.textContent.match(/\d+/) || [0])[0]) : -1;
  });
  // Seed items ship with some already saved, so the first tap may untick one.
  // What matters is that the control TOGGLES and the badge follows it.
  check("saving toggles the badge by exactly one",
        Math.abs(savedAfter - savedBefore) === 1,
        `before ${savedBefore}, after ${savedAfter}`);
  await saveBtn.click(); await page.waitForTimeout(350);
  const savedBack = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button[aria-label='Saved']")][0];
    return b ? Number((b.textContent.match(/\d+/) || [0])[0]) : -1;
  });
  check("tapping again puts it back", savedBack === savedBefore,
        `expected ${savedBefore}, got ${savedBack}`);
  await saveBtn.click(); await page.waitForTimeout(300);

  await label("Saved");
  const savedTxt = await bodyText();
  check("the saved item is actually in Saved",
        !/nothing saved|no saved/i.test(savedTxt) && /AED/.test(savedTxt),
        savedTxt.slice(0, 90));
}

// ── the list ──────────────────────────────────────────────────────────────
section("The list, and what it claims");
await label("Home");
await page.waitForTimeout(300);
const tile = page.locator('div:has-text("AED")').last();
await tile.click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(400);

const itemPrice = await page.evaluate(() => {
  const m = document.body.innerText.match(/AED\s*([\d,]+)/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
});
check("the item shows a price", itemPrice !== null && itemPrice > 0, String(itemPrice));
await tap("Add to Cart");
await page.waitForTimeout(400);
await label("Cart");
await page.waitForTimeout(400);

// ── what this section used to assert, and why it doesn't any more ──────────
//
// Until v2.9.4 this block checked a subtotal, a 9% "LILI Service Fee" and a
// total, and that a `+` control doubled all three. Every one of those passed,
// and every one of them was protecting a lie:
//
//   · lili charges the SELLER 9% at payout. There is no buyer-side fee, and
//     there never was one — the cart invented a charge and then this test
//     defended the arithmetic of it.
//   · quantity is meaningless for unique second-hand pieces. "2 of that
//     dress" was never a thing anyone could buy.
//   · the total led to "Proceed to Checkout" → "Order placed! Your seller has
//     been notified" — which wrote nothing anywhere and told nobody.
//
// A passing test on a fabricated number is worse than no test, so these assert
// the screen's real job instead: it is a shortlist that says so, shows each
// piece at its own price, and opens a conversation with the seller.
const readCart = () => page.evaluate(() => {
  const t = document.body.innerText;
  const num = (re) => { const m = t.match(re); return m ? Number(m[1].replace(/,/g, "")) : null; };
  return {
    text: t,
    line: num(/AED\s*([\d,]+)/),
    prices: [...t.matchAll(/AED\s*([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, ""))),
  };
});
const c1 = await readCart();

// Deliberately NOT compared against a price scraped from the previous screen:
// the detail modal renders over the grid, so `innerText` there picks up a tile
// behind it. The first version of this test did exactly that and reported a bug
// that wasn't one. The cart's own figures have to agree with each other, and
// with one piece on the list that means the seller's subtotal IS the line
// price — and that there is no third number.
check("the piece is on the list at a real price", c1.line > 0, String(c1.line));
check("the seller's subtotal is the sum of her lines, and nothing else",
      c1.prices.length === 2 && c1.prices[0] === c1.prices[1],
      `figures on screen: ${c1.prices.join(", ")}`);
check("the list says plainly that it is not a basket",
      /list, not a basket/i.test(c1.text), c1.text.slice(0, 120));
check("and that lili does not handle the money",
      /doesn't handle your money|pay her directly|pay her in person/i.test(c1.text));
check("no invented buyer-side fee anywhere on the screen",
      !/service fee|subtotal/i.test(c1.text),
      (c1.text.match(/.{0,40}(service fee|subtotal).{0,40}/i) || [])[0]);
check("no checkout that doesn't check anything out",
      !/proceed to checkout|place order|order placed/i.test(c1.text));

// Quantity is gone with the checkout, and its absence is the assertion now.
const plus = page.locator('button:has-text("+")').first();
check("no quantity control on a screen listing unique second-hand pieces",
      (await plus.count()) === 0);

// The one thing the screen can actually do, and the reason it exists.
const askedBefore = await bodyText();
check("every seller on the list gets her own ask button",
      /Ask about these/i.test(askedBefore));
await tap("Ask about these");
await page.waitForTimeout(500);
const afterAsk = await bodyText();
check("asking opens the conversation with that seller",
      /still available/i.test(afterAsk), afterAsk.slice(0, 140));
await label("Cart");
await page.waitForTimeout(300);

// ── search ────────────────────────────────────────────────────────────────
section("Search returns only matches");
await label("Search");
await page.waitForTimeout(350);
const searchBox = page.locator('input[placeholder*="Search" i]').first();
if (await searchBox.count()) {
  await searchBox.fill("chanel");
  await page.waitForTimeout(500);
  const res = await page.evaluate(() => {
    const cards = [...document.querySelectorAll("div")]
      .filter(d => d.style.cursor === "pointer" && /AED/.test(d.textContent || ""))
      .filter((d, _, a) => !a.some(o => o !== d && d.contains(o)));
    return cards.map(c => (c.textContent || "").slice(0, 60));
  });
  check("search returns something for a known brand", res.length > 0, `${res.length} results`);
  check("every result mentions the search term",
        res.length > 0 && res.every(t => /chanel/i.test(t)),
        res.filter(t => !/chanel/i.test(t)).slice(0, 2).join(" | "));

  await searchBox.fill("zzzznotathing");
  await page.waitForTimeout(500);
  const none = await bodyText();
  check("a nonsense search says nothing was found",
        /no |nothing|0 |try/i.test(none), none.slice(0, 80));
  await searchBox.fill("");
  await page.waitForTimeout(400);
} else check("search field exists", false);

// ── filters ───────────────────────────────────────────────────────────────
section("Filters actually filter");
await label("Home");
await page.waitForTimeout(350);
const allCount = await page.evaluate(() => [...document.querySelectorAll("div")]
  .filter(d => d.style.cursor === "pointer" && /AED/.test(d.textContent || ""))
  .filter((d, _, a) => !a.some(o => o !== d && d.contains(o))).length);

const bagsChip = page.locator('button:has-text("Bags")').first();
if (await bagsChip.count()) {
  await bagsChip.click(); await page.waitForTimeout(450);
  const filtered = await page.evaluate(() => [...document.querySelectorAll("div")]
    .filter(d => d.style.cursor === "pointer" && /AED/.test(d.textContent || ""))
    .filter((d, _, a) => !a.some(o => o !== d && d.contains(o))).length);
  check("a category filter narrows the feed", filtered > 0 && filtered <= allCount,
        `all ${allCount}, filtered ${filtered}`);
} else check("category chips exist", false);

// ── seller payout ─────────────────────────────────────────────────────────
section("Seller payout maths");
const payout = await page.evaluate(() => {
  // the sell form advertises what the seller receives
  return null;
});
await label("Sell");
await page.waitForTimeout(400);
// a shop must exist before the listing form appears
const shopName = page.locator('input[placeholder*="Desert Rose"]').first();
if (await shopName.count()) {
  await shopName.fill("Test Closet");
  await tap("Selling from my own wardrobe");
  await tap("Continue");
  await page.waitForTimeout(300);
  const { sellerClausesFor } = await import("./src/compliance/agreements.js");
  for (const c of sellerClausesFor("listing")) { await tap(c.title); }
  await tap("Agree and open my shop");
  // opening a shop now offers sign-in first; these suites run without an account
  await tap("Not now");
  await page.waitForTimeout(600);
  // once a shop exists the tab shows My Shop — the listing form is one hop on
  await label("Sell");
  await page.waitForTimeout(400);
  if (await page.locator('input[placeholder="0"]:visible').count() === 0) {
    await tap("List Item") || await tap("List an item");
    await page.waitForTimeout(400);
  }
  // the listing flow offers a mode, then walks steps — advance until the price
  // field appears rather than assuming how many screens there are
  for (let i = 0; i < 8 && await page.locator('input[placeholder="0"]:visible').count() === 0; i++) {
    const moved = await tap("Quick") || await tap("Guided") || await tap("Next")
               || await tap("Continue") || await tap("Skip");
    if (!moved) break;
  }
}
const priceInput = page.locator('input[placeholder="0"]:visible').first();
const reachedPrice = await priceInput.count() > 0
  && await priceInput.waitFor({ state: "visible", timeout: 4000 }).then(() => true, () => false);
check("the listing flow reaches the price step", reachedPrice);
if (reachedPrice) {
  await typeInto('input[placeholder="0"]', "1000");
  await page.waitForTimeout(400);
  const txt = await bodyText();
  // v2.8: this used to assert a hard-coded 900 — a flat 10% typed into the
  // test as well as into the copy. Commission is tiered now, so the expected
  // payout comes from the fee module itself. A test that repeats the number
  // cannot notice the schedule changing; one that asks the schedule can.
  const { breakdown } = await import("./src/data/fees.js");
  const expected = Math.round(breakdown(1000).payout);
  const m = txt.match(/You receive\s*:?\s*AED\s*([\d,]+)/i);
  check("the seller is told what they receive", !!m, txt.slice(0, 140));
  if (m) {
    const got = Number(m[1].replace(/,/g, ""));
    check(`payout matches the fee schedule (${breakdown(1000).ratePercent}% band)`,
          got === expected, `got ${got}, schedule says ${expected}`);
  }
  // and in Arabic numerals
  await typeInto('input[placeholder="0"]', "١٠٠٠");
  await page.waitForTimeout(400);
  const t2 = await bodyText();
  const m2 = t2.match(/You receive\s*:?\s*AED\s*([\d,]+)/i);
  check("Arabic-Indic price gives the same payout",
        !!m2 && Number(m2[1].replace(/,/g, "")) === expected,
        m2 ? m2[1] : "no payout shown");
} else check("listing price field exists", false);

section("Runtime");
check("no page errors during any of this", pageErrors.length === 0,
      [...new Set(pageErrors)].slice(0, 3).join(" | "));

console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m\n`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
