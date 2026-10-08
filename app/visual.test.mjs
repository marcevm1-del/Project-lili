// ─────────────────────────────────────────────────────────────────────────────
//  VISUAL CHECK
//
//  jsdom runs React but has no layout engine: every element measures 0×0, so it
//  can prove nothing crashes and nothing about how anything looks. This runs the
//  real built app in real Chromium at real phone dimensions, so boxes have
//  actual sizes and positions.
//
//  What only this can catch:
//    · content wider than the screen (horizontal scroll)
//    · tap targets that are genuinely too small once rendered
//    · text clipped or overflowing its container
//    · elements hidden behind the fixed tab bar
//    · anything invisible because it matches its own background
//
//  It also captures the phone screenshots the Play listing requires.
//
//  Usage: npm run visual   (needs `npm run build` first)
// ─────────────────────────────────────────────────────────────────────────────
import { chromium, devices } from "playwright";
import { offline } from "./testnet.mjs";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = "dist";
const SHOTS = "screenshots";
const PORT = 4183;
const PHONE = { width: 393, height: 852 };   // Pixel 8 logical size
const MIN_TAP = 44;

if (!existsSync(DIST)) { console.error("Run `npm run build` first."); process.exit(1); }
mkdirSync(SHOTS, { recursive: true });

// ── static server for the built bundle ─────────────────────────────────────
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
               ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };
const server = createServer((req, res) => {
  let p = join(DIST, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(p) || p.endsWith("/")) p = join(DIST, "index.html");
  res.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const ctx = await browser.newContext({
  ...devices["Pixel 7"], viewport: PHONE, deviceScaleFactor: 2,
  locale: "en-AE", timezoneId: "Asia/Dubai",
});
await offline(ctx);   // suites do not talk to the live project — see testnet.mjs
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const t = m.text();
  // Network reachability to the backend is an environment fact, not an app
  // defect — the app is expected to fall back cleanly, which it does.
  if (/ERR_CERT|ERR_NAME_NOT_RESOLVED|Failed to load resource|net::ERR/.test(t)) return;
  consoleErrors.push(t.slice(0, 200));
});
page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message.slice(0, 200)));

let pass = 0, fail = 0;
const check = (label, ok, extra = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${label}${!ok && extra ? `\n      \x1b[2m${extra}\x1b[0m` : ""}`);
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

// has-text is a case-insensitive substring match, which once selected the
// "Match my phone" card when asked for "Dark" — its description contains the
// words "light or dark setting". Prefer an exact match, fall back to substring.
const tap = async (rx) => {
  let el = page.getByRole("button", { name: rx, exact: true }).first();
  if (await el.count() === 0) el = page.locator(`button:has-text("${rx}")`).first();
  if (await el.count() === 0) return false;
  try { await el.click({ timeout: 2500 }); await page.waitForTimeout(260); return true; }
  catch { return false; }
};
const tapLabel = async (label) => {
  const el = page.locator(`button[aria-label="${label}"]`).first();
  if (await el.count() === 0) return false;
  await el.click({ timeout: 2500 }); await page.waitForTimeout(260); return true;
};

// ── layout assertions, run on whatever is on screen ────────────────────────
async function auditScreen(name) {
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });

  const r = await page.evaluate((MIN) => {
    const out = { overflowX: 0, small: [], clipped: [], hidden: [] };
    out.overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;

    const tabBar = [...document.querySelectorAll("div")]
      .find((d) => getComputedStyle(d).position === "fixed" && d.getBoundingClientRect().bottom >= innerHeight - 2);
    const tabTop = tabBar ? tabBar.getBoundingClientRect().top : Infinity;

    for (const el of document.querySelectorAll("button, a, input, select, [role=button]")) {
      const b = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (b.width === 0 || b.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
      // ignore anything scrolled out of the viewport
      if (b.bottom < 0 || b.top > innerHeight) continue;
      // the real hit area includes the invisible ::after we expand buttons with
      const after = getComputedStyle(el, "::after");
      const hitW = Math.max(b.width, parseFloat(after.width) || 0, parseFloat(after.minWidth) || 0);
      const hitH = Math.max(b.height, parseFloat(after.height) || 0, parseFloat(after.minHeight) || 0);
      if (hitW < MIN || hitH < MIN) {
        out.small.push(`${el.tagName.toLowerCase()}"${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 22)}" ${Math.round(hitW)}x${Math.round(hitH)}`);
      }
    }
    // text overflowing its own box
    for (const el of document.querySelectorAll("div,span,p,h1,h2")) {   // buttons carry a hit-area pseudo-element
      if (el.children.length) continue;
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
        const cs = getComputedStyle(el);
        if (cs.overflow === "visible" && cs.whiteSpace !== "nowrap" && cs.textOverflow !== "ellipsis") {
          out.clipped.push(`"${(el.textContent || "").trim().slice(0, 30)}" ${el.scrollWidth}>${el.clientWidth}`);
        }
      }
    }
    return out;
  }, MIN_TAP);

  check(`${name}: no horizontal scroll`, r.overflowX <= 1, `overflows by ${r.overflowX}px`);
  check(`${name}: tap targets >= ${MIN_TAP}px`, r.small.length === 0,
        [...new Set(r.small)].slice(0, 5).join("  ·  "));
  check(`${name}: no clipped text`, r.clipped.length === 0,
        [...new Set(r.clipped)].slice(0, 4).join("  ·  "));
  return r;
}

console.log("\n\x1b[1mVISUAL CHECK — real Chromium, 393×852\x1b[0m");

// ── boot through the gate ──────────────────────────────────────────────────
await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

section("Gate");
await auditScreen("01-market-gate");
await tap("look around anyway");
await page.locator("input").first().fill("1994");
await tap("I agree to lili's Platform Terms");
await tap("I agree to Privacy Notice");
await auditScreen("02-terms-and-age");
await tap("Agree and continue");
await auditScreen("03-consent");
await tap("Save choices");
await page.waitForTimeout(400);

section("Onboarding");
await auditScreen("04-splash");
await tap("Shop Now");
await auditScreen("05-style-picker");
await tap("Skip");
await page.waitForTimeout(400);

section("Core screens");
await auditScreen("06-home-feed");

await page.locator('div:has-text("AED")').last().click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(400);
await auditScreen("07-item-detail");
await tap("Add to Cart");
await page.waitForTimeout(300);

await tapLabel("Search");   await auditScreen("08-search");
await tapLabel("Saved");    await auditScreen("09-saved");
await tapLabel("Sell");     await auditScreen("10-sell");
await tapLabel("Profile");  await auditScreen("11-profile");

section("Settings and legal");
await tap("Appearance");
await auditScreen("12-appearance");
// click the card by its heading, then PROVE the theme actually changed before
// auditing it — otherwise the dark-mode checks run against a light screen
await page.locator('button:has(div:text-is("Dark"))').first().click().catch(async () => {
  await page.getByText("Warm near-black", { exact: false }).click();
});
await page.waitForTimeout(400);
const themeNow = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
check("dark mode actually applies", themeNow === "dark", `data-theme=${themeNow}`);
await auditScreen("13-dark-mode");

// dark mode must not make anything invisible
const invisible = await page.evaluate(() => {
  const bad = [];
  const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const p = parse(c);
      if (p.length >= 3 && (p[3] === undefined || p[3] > 0.5)) return p;
      n = n.parentElement;
    }
    return [253, 235, 216];
  };
  for (const el of document.querySelectorAll("div,span,p,button,h1,h2")) {
    if (el.children.length || !(el.textContent || "").trim()) continue;
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.top > innerHeight || b.bottom < 0) continue;
    const fg = parse(getComputedStyle(el).color);
    const bg = bgOf(el);
    if (fg.length < 3) continue;
    const [x, y] = [lum(fg), lum(bg)].sort((a, c) => c - a);
    const ratio = (x + 0.05) / (y + 0.05);
    if (ratio < 2) bad.push(`"${el.textContent.trim().slice(0, 26)}" ${ratio.toFixed(2)}:1`);
  }
  return bad;
});
check("dark mode: nothing is invisible against its background",
      invisible.length === 0, [...new Set(invisible)].slice(0, 5).join("  ·  "));

await tap("Light");
await tap("←");
await tap("Language");
await auditScreen("14-language");
await tap("العربية");
await page.waitForTimeout(400);
const dir = await page.evaluate(() => document.documentElement.dir);
check("Arabic flips the layout to RTL", dir === "rtl", `dir=${dir}`);
await auditScreen("15-arabic-rtl");
await tap("English");
await tap("←");

await tap("Privacy & Safety");
await auditScreen("16-privacy-safety");
await tap("How lili works");
await auditScreen("17-how-lili-works");

section("Runtime");
check("no console errors anywhere in the walkthrough",
      consoleErrors.length === 0, [...new Set(consoleErrors)].slice(0, 4).join(" | "));

console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m`);
console.log(`\x1b[2mScreenshots in ${SHOTS}/\x1b[0m\n`);

await browser.close();
server.close();
process.exit(fail ? 1 : 0);
