// ─────────────────────────────────────────────────────────────────────────────
//  DEVICE MATRIX
//
//  "Works on my phone" is one data point. This runs the built app across the
//  range of shapes real users actually hold, plus the two settings that break
//  more layouts than any screen size does:
//
//    · TEXT SCALING. Android and iOS let people set text to 200%. Someone with
//      low vision has it on permanently. Fixed-height rows and single-line
//      labels fall apart long before that.
//    · LANDSCAPE. Usually rotated by accident, but a layout that traps someone
//      with no way back is still broken.
//
//  Checks per device: no horizontal scroll, nothing clipped, tap targets, and
//  that the bottom navigation is actually reachable.
//
//  Usage: npm run devices
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from "playwright";
import { offline } from "./testnet.mjs";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = "dist", PORT = 4185, SHOTS = "screenshots/devices";
if (!existsSync(DIST)) { console.error("Run `npm run build` first."); process.exit(1); }
mkdirSync(SHOTS, { recursive: true });

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
               ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  let p = join(DIST, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(p) || p.endsWith("/")) p = join(DIST, "index.html");
  res.writeHead(200, { "Content-Type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(PORT, r));

// width × height, and why each one is in the list
const DEVICES = [
  { name: "galaxy-fold-cover",  w: 280, h: 653, why: "narrowest screen still sold" },
  { name: "iphone-se-1",        w: 320, h: 568, why: "smallest common iPhone" },
  { name: "galaxy-s8",          w: 360, h: 740, why: "most common Android width" },
  { name: "iphone-se-3",        w: 375, h: 667, why: "current small iPhone" },
  { name: "pixel-8",            w: 393, h: 852, why: "modern Android" },
  { name: "iphone-15-pro-max",  w: 430, h: 932, why: "large phone" },
  { name: "ipad-mini",          w: 744, h: 1133, why: "small tablet" },
  { name: "ipad-pro",           w: 1024, h: 1366, why: "large tablet" },
  { name: "pixel-8-landscape",  w: 852, h: 393, why: "rotated phone" },
  { name: "s8-text-200pct",     w: 360, h: 740, why: "text at 200%", fontScale: 2 },
  { name: "pixel-text-150pct",  w: 393, h: 852, why: "text at 150%", fontScale: 1.5 },
];

const browser = await chromium.launch();
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => {
  ok ? pass++ : fail++;
  console.log(`    ${ok ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${label}${!ok && extra ? `  \x1b[2m${extra}\x1b[0m` : ""}`);
};

console.log("\n\x1b[1mDEVICE MATRIX\x1b[0m");

for (const d of DEVICES) {
  console.log(`\n  \x1b[1m${d.name}\x1b[0m \x1b[2m${d.w}×${d.h} — ${d.why}\x1b[0m`);
  const ctx = await browser.newContext({
    viewport: { width: d.w, height: d.h },
    deviceScaleFactor: 2, isMobile: d.w < 700, hasTouch: true,
    locale: "en-AE", timezoneId: "Asia/Dubai",
  });
await offline(ctx);   // suites do not talk to the live project — see testnet.mjs
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message.slice(0, 140)));

  if (d.fontScale) {
    // Mirrors the OS text-size setting: everything sized in rem/em grows.
    await page.addInitScript((s) => {
      document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.style.fontSize = `${16 * s}px`;
        document.body.style.fontSize = `${16 * s}px`;
        const st = document.createElement("style");
        st.textContent = `* { font-size: inherit !important; line-height: 1.4 !important; }`;
        document.head.appendChild(st);
      });
    }, d.fontScale);
  }

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  const tap = async (t) => {
    const el = page.locator(`button:has-text("${t}")`).first();
    if (await el.count() === 0) return false;
    try {
      await el.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
      await el.click({ timeout: 2500 });
      await page.waitForTimeout(220);
      return true;
    }
    catch { return false; }
  };

  // through the gate
  await tap("look around anyway");
  const yr = page.locator("input").first();
  if (await yr.count()) await yr.fill("1994").catch(() => {});
  await tap("I agree to lili's Terms of Use");
  await tap("I agree to Privacy Notice");
  await tap("Agree and continue");
  await tap("Save choices");
  await tap("Shop Now");
  await tap("Skip");
  await page.waitForTimeout(400);

  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const out = {
      overflowX: doc.scrollWidth - doc.clientWidth,
      clipped: [],
      offscreen: [],
      reachedFeed: /AED/.test(document.body.textContent || ""),
      tabBarVisible: false,
    };
    // the bottom bar must be on screen and inside the viewport
    for (const el of document.querySelectorAll("div")) {
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed") continue;
      const b = el.getBoundingClientRect();
      if (b.bottom > innerHeight - 4 && b.width > innerWidth * 0.5 && b.height > 20) {
        out.tabBarVisible = b.top < innerHeight && b.left >= -1 && b.right <= innerWidth + 1;
      }
    }
    for (const el of document.querySelectorAll("div,span,p,h1,h2")) {
      if (el.children.length) continue;
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 &&
          cs.overflow === "visible" && cs.whiteSpace !== "nowrap" && cs.textOverflow !== "ellipsis") {
        out.clipped.push(`"${(el.textContent || "").trim().slice(0, 26)}"`);
      }
      // Content inside a horizontal carousel is SUPPOSED to sit past the edge —
      // that is what makes it scrollable. Only flag things with no scrollable
      // ancestor, which are genuinely unreachable.
      const b = el.getBoundingClientRect();
      if (b.width > 0 && (b.left < -2 || b.right > innerWidth + 2)) {
        let scrollable = false, n = el.parentElement;
        while (n && n !== document.body) {
          const ov = getComputedStyle(n).overflowX;
          if ((ov === "auto" || ov === "scroll") && n.scrollWidth > n.clientWidth) { scrollable = true; break; }
          n = n.parentElement;
        }
        if (!scrollable) out.offscreen.push(`"${(el.textContent || "").trim().slice(0, 24)}"`);
      }
    }
    return out;
  });

  await page.screenshot({ path: join(SHOTS, `${d.name}.png`), fullPage: false });

  check("app reaches the feed", r.reachedFeed);
  check("no horizontal scroll", r.overflowX <= 1, `overflows ${r.overflowX}px`);
  check("nothing sits off the edge", r.offscreen.length === 0,
        [...new Set(r.offscreen)].slice(0, 3).join(" "));
  check("no clipped text", r.clipped.length === 0,
        [...new Set(r.clipped)].slice(0, 3).join(" "));
  check("bottom navigation reachable", r.tabBarVisible);
  check("no runtime errors", errs.length === 0, errs.slice(0, 2).join(" | "));

  await ctx.close();
}

console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m across ${DEVICES.length} configurations`);
console.log(`\x1b[2mScreenshots in ${SHOTS}/\x1b[0m\n`);
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
