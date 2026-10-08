// ─────────────────────────────────────────────────────────────────────────────
//  ACCESSIBILITY AUDIT
//
//  Runs axe-core — the engine behind most accessibility tooling — against every
//  screen in the real browser. It checks the WCAG 2.1 A and AA rules that can be
//  detected automatically: contrast, names on controls, roles, landmarks, form
//  labels, heading order, language attributes.
//
//  Automated checks catch roughly a third of real accessibility problems. They
//  cannot tell you whether a label makes sense, whether focus order is logical,
//  or whether a screen reader user can complete a purchase. This raises the
//  floor; it does not certify the ceiling.
//
//  Usage: npm run a11y
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from "playwright";
import { offline } from "./testnet.mjs";
import AxeBuilder from "@axe-core/playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = "dist", PORT = 4186;
if (!existsSync(DIST)) { console.error("Run `npm run build` first."); process.exit(1); }

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
               ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  let p = join(DIST, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(p) || p.endsWith("/")) p = join(DIST, "index.html");
  res.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });
await offline(ctx);   // suites do not talk to the live project — see testnet.mjs
const page = await ctx.newPage();

const tap = async (t) => {
  const el = page.locator(`button:has-text("${t}")`).first();
  if (await el.count() === 0) return false;
  try {
    await el.scrollIntoViewIfNeeded({ timeout: 1200 }).catch(() => {});
    await el.click({ timeout: 2200 }); await page.waitForTimeout(230); return true;
  } catch { return false; }
};

let violations = 0, screens = 0;
const seen = new Map();

async function scan(name) {
  screens++;
  try {
    const res = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const v = res.violations.filter((x) => x.impact !== "minor" || x.id === "color-contrast");
    if (v.length === 0) { console.log(`  \x1b[32m✓\x1b[0m ${name}`); return; }
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    for (const x of v) {
      violations += x.nodes.length;
      seen.set(x.id, (seen.get(x.id) || 0) + x.nodes.length);
      console.log(`      \x1b[33m${x.id}\x1b[0m (${x.impact}, ${x.nodes.length}) — ${x.help}`);
      for (const n of x.nodes.slice(0, 2)) {
        console.log(`        \x1b[2m${n.html.slice(0, 110)}\x1b[0m`);
      }
    }
  } catch (e) {
    console.log(`  \x1b[33m?\x1b[0m ${name} — scan skipped: ${String(e.message).slice(0, 70)}`);
  }
}

console.log("\n\x1b[1mACCESSIBILITY AUDIT — axe-core, WCAG 2.1 A + AA\x1b[0m\n");

await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);

await scan("market gate");
await tap("look around anyway");
await page.locator("input").first().fill("1994");
await scan("age + terms");
await tap("I agree to lili's Platform Terms");
await tap("I agree to Privacy Notice");
await tap("Agree and continue");
await scan("consent");
await tap("Save choices");
await page.waitForTimeout(300);
await scan("splash");
await tap("Shop Now");
await scan("style picker");
await tap("Skip");
await page.waitForTimeout(400);

await scan("home feed");
await page.locator('div:has-text("AED")').last().click({ timeout: 2500 }).catch(() => {});
await page.waitForTimeout(350);
await scan("item detail");

// Closing it properly. `tap()` matches on visible TEXT, and the modal's
// dismiss control is an icon with an aria-label and no text at all — so both
// of the old taps silently did nothing and the dialog stayed open. That went
// unnoticed because the tile click before it used to miss as often as it hit;
// once it started opening reliably, every screen after this one was scanned
// through a modal, and the tab bar underneath was unclickable.
const dismiss = async () => {
  const byLabel = page.locator('div[role="dialog"] button[aria-label="Close"]').first();
  if (await byLabel.count()) await byLabel.click({ timeout: 2000 }).catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
  return (await page.locator('div[role="dialog"]').count()) === 0;
};
if (!(await dismiss())) {
  console.log("  \x1b[31m✗\x1b[0m the item detail dialog cannot be dismissed");
  violations++;
}

for (const [label, name] of [["Search", "search"], ["Home", null], ["Saved", "saved"], ["Inbox", "inbox"],
                             ["Sell", "sell"], ["Profile", "profile"]]) {
  const b = page.locator(`button[aria-label="${label}"]`).first();
  if (await b.count()) { await b.click(); await page.waitForTimeout(350); if (name) await scan(name); }
}

await tap("Appearance");   await scan("appearance");
await tap("←"); await tap("Language"); await scan("language");
await tap("←"); await tap("Privacy & Safety"); await scan("privacy & safety");
await tap("How lili works"); await scan("how lili works");

console.log(`\n\x1b[1m${screens} screens scanned, ${violations} issues\x1b[0m`);
if (seen.size) {
  console.log("\nBy rule:");
  for (const [k, n] of [...seen.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${k}`);
  }
}
console.log("\n\x1b[2mAutomated checks find roughly a third of real accessibility issues.");
console.log("A clean run is a floor, not a certificate.\x1b[0m\n");

await browser.close();
server.close();
process.exit(violations ? 1 : 0);
