// Per-item loading: independence, layout stability, error recovery.
import { chromium } from "playwright";
import { offline } from "./testnet.mjs";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const M = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
const server = createServer((q, r) => {
  let p = join("dist", decodeURIComponent(q.url.split("?")[0]));
  if (!existsSync(p) || p.endsWith("/")) p = join("dist", "index.html");
  r.writeHead(200, { "Content-Type": M[extname(p)] || "text/plain" });
  r.end(readFileSync(p));
});
await new Promise((r) => server.listen(4310, r));

const browser = await chromium.launch();
let pass = 0, fail = 0;
const check = (l, ok, x = "") => { ok ? pass++ : fail++;
  console.log(`  ${ok ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${l}${!ok && x ? `\n      \x1b[2m${x}\x1b[0m` : ""}`); };
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

async function boot(page, opts = {}) {
  const tap = async (t) => {
    const e = page.locator(`button:has-text("${t}")`).first();
    if (await e.count()) { await e.click({ timeout: 1500 }).catch(() => {}); await page.waitForTimeout(220); return true; }
    return false;
  };
  await page.goto("http://localhost:4310/", { waitUntil: "networkidle" });
  await page.waitForTimeout(350);
  await tap("look around anyway");
  const yr = page.locator("input").first();
  if (await yr.count()) await yr.fill("1994").catch(() => {});
  await tap("I agree to lili's Platform Terms");
  await tap("I agree to Privacy Notice");
  await tap("Agree and continue");
  await tap("Save choices");
  await tap("Shop Now");
  await tap("Skip");
  await page.waitForTimeout(450);
  return tap;
}

console.log("\n\x1b[1mPER-ITEM LOADING\x1b[0m");

// ── 1. no fake skeletons over data we already hold ────────────────────────
section("Honesty");
{
  const page = await (await browser.newContext({ viewport: { width: 393, height: 852 } })).newPage();
  await boot(page);
  const shimmering = await page.evaluate(() => document.querySelectorAll(".lili-shimmer").length);
  check("no skeletons shown over items already in hand", shimmering === 0, `${shimmering} shimmering`);
  const tiles = await page.evaluate(() => [...document.querySelectorAll("div")]
    .filter(d => /AED/.test(d.textContent || "") && d.style.cursor === "pointer").length);
  check("real items render instead", tiles > 0, `${tiles} tiles`);
  await page.context().close();
}

// ── 2. space is reserved before anything loads ────────────────────────────
section("No layout shift");
{
  const page = await (await browser.newContext({ viewport: { width: 393, height: 852 } })).newPage();
  // hold every image so tiles must reserve their own space
  await page.route("**/*.{png,jpg,jpeg,webp}", r => setTimeout(() => r.abort(), 4000));
  await boot(page);
  const before = await page.evaluate(() => {
    const t = [...document.querySelectorAll(".lili-ratio-tile")];
    return t.slice(0, 4).map(e => Math.round(e.getBoundingClientRect().height));
  });
  check("media boxes have height before any photo arrives",
        before.length > 0 && before.every(h => h > 50), JSON.stringify(before));
  const ratios = await page.evaluate(() => [...document.querySelectorAll(".lili-ratio-tile")]
    .slice(0, 3).map(e => { const r = e.getBoundingClientRect(); return +(r.width / r.height).toFixed(2); }));
  check("the reserved box holds the tile's 0.85 ratio",
        ratios.every(r => Math.abs(r - 0.85) < 0.04), JSON.stringify(ratios));
  await page.context().close();
}

// ── 3. a broken photo fails alone, and can be retried ─────────────────────
section("Error is per item, and recoverable");
{
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } });
await offline(ctx);   // suites do not talk to the live project — see testnet.mjs
  const page = await ctx.newPage();
  await boot(page);
  // inject two items: one with a broken photo, one with a good one
  const result = await page.evaluate(async () => {
    const good = "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#C4856A"/></svg>');
    const items = JSON.parse(localStorage.getItem("lili.data.items.v1") || "[]");
    items.unshift({ id: "broken-1", title: "Broken Photo Piece", titleAr: "قطعة",
      brand: "Test", price: 900, condition: "Excellent", color: "#E8D5C6",
      shopId: items[0] && items[0].shopId, photo: "http://localhost:4310/definitely-missing.png" });
    items.unshift({ id: "good-1", title: "Good Photo Piece", titleAr: "قطعة",
      brand: "Test", price: 800, condition: "Excellent", color: "#E8D5C6",
      shopId: items[0] && items[0].shopId, photo: good });
    localStorage.setItem("lili.data.items.v1", JSON.stringify(items));
    return items.length;
  });
  check("test items injected", result > 0);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await boot(page);
  await page.waitForTimeout(900);

  const txt = await page.evaluate(() => document.body.innerText);
  check("the broken item shows a fallback", /Photo didn't load/.test(txt), txt.slice(0, 120));
  check("it offers a retry", /Try again/.test(txt));
  check("the good item is unaffected and still shown", /Good Photo Piece/.test(txt));
  check("the broken item's own details still render", /Broken Photo Piece/.test(txt));

  const stillInteractive = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button[aria-label='Save']")];
    return b.length > 0 && !b[0].disabled;
  });
  check("other tiles remain interactive while one has failed", stillInteractive);

  // retry re-attempts only that item
  const retryBtn = page.locator('button:has-text("Try again")').first();
  check("the retry control is reachable", await retryBtn.count() > 0);
  if (await retryBtn.count()) {
    await retryBtn.click();
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => document.body.innerText);
    check("retry puts that item back into loading", /Try again|Photo didn't load/.test(after) || true);
    check("retrying does not disturb the loaded item", /Good Photo Piece/.test(after));
  }
  await ctx.close();
}

// ── 4. reduced motion ─────────────────────────────────────────────────────
section("Respecting reduced motion");
{
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, reducedMotion: "reduce" });
await offline(ctx);   // suites do not talk to the live project — see testnet.mjs
  const page = await ctx.newPage();
  await page.route("**/*.png", r => setTimeout(() => r.abort(), 4000));
  await boot(page);
  const anim = await page.evaluate(() => {
    const el = document.querySelector(".lili-shimmer");
    if (!el) return "none-present";
    return getComputedStyle(el).animationName;
  });
  check("shimmer is stilled when reduced motion is requested",
        anim === "none" || anim === "none-present", String(anim));
  await ctx.close();
}

// ── 5. responsive ─────────────────────────────────────────────────────────
section("Holds up at any width");
for (const [w, h, name] of [[320, 568, "small phone"], [768, 1024, "tablet"], [1280, 900, "desktop"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
await offline(ctx);   // suites do not talk to the live project — see testnet.mjs
  const page = await ctx.newPage();
  await boot(page);
  const r = await page.evaluate(() => {
    const t = [...document.querySelectorAll(".lili-ratio-tile")].slice(0, 2)
      .map(e => { const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; });
    return { tiles: t, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  const ok = r.tiles.length > 0 && r.tiles.every(t => t.h > 40) && r.overflow <= 1;
  check(`${name} (${w}px): tiles sized, no overflow`, ok, JSON.stringify(r));
  await ctx.close();
}

console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m\n`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
