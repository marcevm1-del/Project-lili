// ─────────────────────────────────────────────────────────────────────────────
//  THE LAWS OF UX, MEASURED ON THE RENDERED APP
//
//  Run: npm run uxlaws
//
//  `npm run ux` already checks the laws against the SOURCE — it greps for
//  patterns and asks good questions. This one opens the app in a browser and
//  measures what is actually on the glass, because the properties these laws
//  are about are properties of pixels, not of code:
//
//    · a button styled `padding: 6px` may still be 48px tall inside a flex row
//    · a button with `min-height: 44px` may be 44px wide and 20px tall
//    · two targets that are each big enough can still sit 2px apart
//    · a type scale looks tidy in one file and has nineteen sizes on screen
//
//  Nothing here changes how the app LOOKS. Every finding it produces is about
//  size, rhythm, spacing and timing — the things a person feels rather than
//  notices.
//
//  ── the laws, and the number each one is checked against
//
//  FITTS'S LAW — time to acquire a target grows as the target shrinks and as
//    it gets further away. Apple says 44pt, Android says 48dp. 44 is the floor
//    used here. A missed tap on "remove" in a cart is a refund request; a
//    missed tap on "report" is a woman who does not report.
//
//  FITTS, second half — two targets less than 8px apart are one target as far
//    as a thumb is concerned. The gap matters as much as the size.
//
//  HICK'S LAW — decision time grows with the number and complexity of choices.
//    Counted per screen, as simultaneously visible interactive elements.
//
//  MILLER'S LAW — about seven items in working memory. Applied here to the
//    number of distinct type sizes and spacing values on one screen: every
//    extra one is a distinction the eye has to resolve and the brain has to
//    hold.
//
//  VON RESTORFF — the isolated thing is remembered. One primary action per
//    screen, or none of them is primary.
//
//  DOHERTY THRESHOLD — below about 400ms a system feels instant and attention
//    stays engaged. Measured as the time from a tap to the first change on
//    screen, not to the work finishing.
//
//  JAKOB'S LAW — people expect this app to work like the others they use.
//    Checked as conventions: back at the start of the top bar, the tab bar at
//    the bottom, a visible focus ring for keyboard and switch users.
//
//  AESTHETIC-USABILITY EFFECT — this is the one that makes the others worth
//    obeying quietly. The look does not change.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from "playwright";
import { offline } from "./testnet.mjs";
import { SCALE } from "./src/theme/scale.js";
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
await offline(ctx);
const page = await ctx.newPage();

const MIN_TAP = 44;        // Apple 44pt; Android's 48dp is stricter still
const MIN_GAP = 8;         // below this, two targets are one target to a thumb
const MAX_CHOICES = 9;     // Hick — distinct decisions on one screen
const MAX_TYPE_SIZES = 9;  // Miller, applied to one screen's type scale
const SPACING_STEP = 4;    // the rhythm everything should land on
const DOHERTY_MS = 400;

let issues = 0, checks = 0;
const findings = [];
const record = (law, what, detail, bad) => {
  checks++;
  if (bad) { issues++; findings.push({ law, what, detail }); }
  console.log(`  ${bad ? "\x1b[33m▲\x1b[0m" : "\x1b[32m✓\x1b[0m"} ${what}` +
              (detail ? `  \x1b[2m${detail}\x1b[0m` : ""));
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

const tap = async (t) => {
  const el = page.locator("button").filter({ hasText: String(t).slice(0, 40) }).first();
  if (!(await el.count())) return false;
  try { await el.click({ timeout: 2500 }); await page.waitForTimeout(300); return true; }
  catch { return false; }
};
const label = async (l) => {
  const el = page.locator(`button[aria-label="${l}"]`).first();
  if (!(await el.count())) return false;
  try { await el.click({ timeout: 2500 }); await page.waitForTimeout(350); return true; }
  catch { return false; }
};

/** Everything on the glass, measured. Runs in the page. */
const measure = () => page.evaluate(({ MIN_TAP, MIN_GAP }) => {
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" &&
           s.display !== "none" && Number(s.opacity) > 0.05 &&
           r.bottom > 0 && r.top < innerHeight;
  };
  const name = (el) =>
    (el.getAttribute("aria-label") || (el.innerText || "").trim().split("\n")[0] ||
     el.getAttribute("placeholder") || el.tagName.toLowerCase()).slice(0, 34);

  const interactive = [...document.querySelectorAll(
    "button, [role=button], a[href], input, select, textarea")].filter(vis);

  // Fitts — the hit box, including any invisible expansion via ::after
  const targets = interactive.map((el) => {
    const r = el.getBoundingClientRect();
    let w = r.width, h = r.height;
    for (const pseudo of ["::after", "::before"]) {
      const p = getComputedStyle(el, pseudo);
      if (p.content && p.content !== "none" && p.position === "absolute") {
        w = Math.max(w, parseFloat(p.width) || 0);
        h = Math.max(h, parseFloat(p.height) || 0);
      }
    }
    return { name: name(el),
             // The hit box, including invisible expansion — this is what Fitts
             // is about for SIZE.
             w: Math.round(w), h: Math.round(h),
             // The visible box — this is what she aims at, and therefore what
             // crowding has to be measured on. Using the expanded box made
             // every chip row look 2px too tight, which was the tool being
             // wrong rather than the app.
             vx: Math.round(r.x), vy: Math.round(r.y),
             vw: Math.round(r.width), vh: Math.round(r.height),
             x: Math.round(r.x), y: Math.round(r.y),
             小: Math.min(w, h) < MIN_TAP };
  });

  // Fitts, second half — adjacent pairs that are too close to separate
  const crowded = [];
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const a = targets[i], b = targets[j];
      const dx = Math.max(0, Math.max(a.vx, b.vx) - Math.min(a.vx + a.vw, b.vx + b.vw));
      const dy = Math.max(0, Math.max(a.vy, b.vy) - Math.min(a.vy + a.vh, b.vy + b.vh));
      if (dx === 0 && dy === 0) continue;                  // overlapping: nested
      const gap = dx > 0 && dy > 0 ? Math.hypot(dx, dy) : dx + dy;
      if (gap > 0 && gap < MIN_GAP) crowded.push(`${a.name} / ${b.name} ${Math.round(gap)}px @${a.x},${a.y}`);
    }
  }

  // Miller — the type scale and the spacing rhythm actually in use
  const sizes = new Set(), spacings = new Set(), offScale = new Set();
  const oddType = [], oddSpace = [];   // which element, so a finding is actionable
  for (const el of [...document.querySelectorAll("body *")]) {
    if (!vis(el)) continue;
    const s = getComputedStyle(el);
    const fs = Math.round(parseFloat(s.fontSize) * 2) / 2;
    if ((el.innerText || "").trim()) {
      sizes.add(fs);
      if (fs % 1 !== 0) oddType.push(`${fs}px · ${name(el)}`);
    }
    for (const prop of ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight",
                        "marginTop", "marginBottom", "gap", "rowGap", "columnGap"]) {
      const v = parseFloat(s[prop]);
      if (!v || Number.isNaN(v)) continue;
      spacings.add(v);
      // Negative values are deliberate overlaps — an avatar pulled up over a
      // banner — and are not part of a rhythm. Values under 8px are optical
      // nudges, which are a craft decision rather than a grid violation. What
      // a 4px rhythm is actually about is LAYOUT spacing, so that is what is
      // measured: anything 8px or over should land on the grid.
      if (v >= 8 && v < 80 && v % 2 !== 0) { offScale.add(v); oddSpace.push(`${v}px ${prop} · ${name(el)}`); }
    }
  }

  // Text that does not fit the box it is in.
  //
  // The category strip is `overflowX:auto` and its chips had no `flexShrink:0`,
  // so instead of scrolling, flex compressed every chip to fit the screen —
  // and `whiteSpace:nowrap` then pushed the text straight out through the
  // pill. "Dresses" rendered as "Dresse" with the S sitting on the next chip's
  // border. Nothing in the source looks wrong; it is only wrong once laid out.
  const clipped = [];
  for (const el of [...document.querySelectorAll("button, span, div, a")]) {
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.overflow !== "visible" || cs.textOverflow === "ellipsis") continue;
    if (!(el.innerText || "").trim() || el.children.length) continue;
    // 2px of tolerance for sub-pixel text metrics.
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0)
      clipped.push(`${name(el)} (${el.scrollWidth}>${el.clientWidth})`);
  }

  // Arabic sentences stranded in a left-to-right paragraph.
  //
  // A full stop, a comma and a bracket are direction-NEUTRAL: they take the
  // paragraph's direction, not the sentence's. So an Arabic sentence ending in
  // "." inside an LTR block renders that stop at the visual LEFT — the
  // punctuation arrives before the words. The splash tagline read
  // ".قطع فاخرة … لدبي" on every cold start.
  //
  // Nothing in the source looks wrong. It is only wrong once laid out, which
  // is why this belongs here and not in a grep.
  const ARABIC_RE = /[\u0600-\u06FF]/;
  const stranded = [];
  for (const el of [...document.querySelectorAll("body *")]) {
    if (!vis(el) || el.children.length) continue;
    const txt = (el.innerText || "").trim();
    if (!txt || !ARABIC_RE.test(txt)) continue;
    // Only a run that is MOSTLY Arabic — a bilingual label is a separate
    // problem with a separate check.
    const arabic = (txt.match(/[\u0600-\u06FF]/g) || []).length;
    const letters = (txt.match(/[A-Za-z\u0600-\u06FF]/g) || []).length;
    if (letters === 0 || arabic / letters < 0.6) continue;
    const endsNeutral = /[.،,;:!?)\]]$/.test(txt);
    if (endsNeutral && getComputedStyle(el).direction !== "rtl")
      stranded.push(txt.slice(0, 28));
  }

  // One label, two languages.
  //
  // v2.9.3 removed 118 of these and added a source-level check. That check has
  // now missed three more — the category chips (built in a template
  // expression), the theme picker (Arabic in a nested <span>) and the New In
  // subtitle (an array index next to a literal) — because it looks for shapes
  // in the source and there are more shapes than anyone will enumerate.
  //
  // On the glass there is only one shape: a single element whose visible text
  // holds a Latin word and an Arabic word with a separator between them.
  const bilingual = [];
  for (const el of [...document.querySelectorAll("body *")]) {
    if (!vis(el)) continue;
    const txt = (el.innerText || "").trim();
    if (!txt || txt.length > 90) continue;
    // Only the deepest element that holds the whole label, so a container is
    // not blamed for two children that each speak one language.
    if ([...el.children].some((c) => (c.innerText || "").includes("·"))) continue;
    if (!/·/.test(txt)) continue;
    if (/[A-Za-z]{3}/.test(txt) && /[\u0600-\u06FF]{2}/.test(txt)) bilingual.push(txt.slice(0, 44));
  }

  // Von Restorff — how many things claim to be THE action
  const primary = interactive.filter((el) => {
    const s = getComputedStyle(el);
    const bg = s.backgroundColor;
    if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") return false;
    const r = el.getBoundingClientRect();
    return r.width > 120 && parseInt(s.fontWeight || "400", 10) >= 600;
  }).map(name);

  return {
    targets, crowded,
    // Hick's Law is about deciding between ALTERNATIVES, and the count that
    // matters is the number of distinct decisions, not the number of things
    // that can be tapped.
    //
    // Three corrections, each of which was the tool being wrong rather than
    // the app: twelve save hearts down a feed are one kind of choice, not
    // twelve; one horizontally-scrolling strip of category chips is one
    // choice-set, not nine; and the tab bar is navigation a person arrives
    // already knowing, not a decision this screen is asking them to make.
    choices: interactive.length,
    controls: (() => {
      const inBar = (el) => {
        for (let n = el; n; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (cs.position === "fixed" && n.getBoundingClientRect().top > innerHeight * 0.7) return true;
        }
        return false;
      };
      const strip = (el) => {
        for (let n = el.parentElement; n; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (/auto|scroll/.test(cs.overflowX) || cs.flexWrap === "wrap") return n;
        }
        return null;
      };
      // A labelled group of rows inside its own bordered region is one
      // decision, then a shorter one — that is what chunking buys, and a
      // measure that cannot see it will keep reporting a grouped menu as if it
      // were a flat list.
      const region = (el) => {
        for (let n = el.parentElement; n; n = n.parentElement) {
          const cs = getComputedStyle(n);
          const bordered = cs.borderTopWidth !== "0px" || cs.borderRadius !== "0px";
          if (bordered && n.querySelectorAll("button").length >= 3) return n;
        }
        return null;
      };
      const all = [...document.querySelectorAll("*")];
      const kinds = new Set();
      for (const el of interactive) {
        if (inBar(el)) continue;
        const g = region(el) || strip(el);
        kinds.add(g ? `group:${all.indexOf(g)}` : `label:${name(el)}`);
      }
      return kinds.size;
    })(),
    sizes: [...sizes].sort((a, b) => a - b),
    oddType: [...new Set(oddType)],
    oddSpace: [...new Set(oddSpace)],
    spacings: [...spacings].sort((a, b) => a - b),
    offScale: [...offScale].sort((a, b) => a - b),
    primary,
    clipped: [...new Set(clipped)],
    stranded: [...new Set(stranded)],
    bilingual: [...new Set(bilingual)],
  };
}, { MIN_TAP, MIN_GAP });

console.log("\n\x1b[1mTHE LAWS OF UX — measured on the glass, not in the source\x1b[0m");
console.log("\x1b[2mNothing here is about how it looks. Size, rhythm, spacing, timing.\x1b[0m");

await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

// ── through the gate, MEASURING on the way ──────────────────────────────────
//
// The first version of this walked through the entry screens to reach the app
// and measured nothing on them. Those are the first four screens anybody sees,
// and one of them carried an Arabic tagline whose full stop rendered at the
// left — on every cold start, for as long as the screen has existed. A tool
// that skips the way in cannot see the way in.
const allSmall = new Map(), allCrowded = new Set(), allClipped = new Set(), allStranded = new Set(), allBilingual = new Set();
const allSizes = new Set(), allOffScale = new Set(), allOdd = new Set(), allOddSpace = new Set();
const gateFindings = { clipped: new Set(), stranded: new Set(), bilingual: new Set(), small: new Map() };
const measureGate = async (where) => {
  const g = await measure();
  for (const c of g.clipped) gateFindings.clipped.add(`${where}: ${c}`);
  for (const c of g.stranded) gateFindings.stranded.add(`${where}: ${c}`);
  for (const c of g.bilingual) gateFindings.bilingual.add(`${where}: ${c}`);
  for (const t of g.targets) if (t.小) gateFindings.small.set(`${where}: ${t.name}`, `${t.w}×${t.h}`);
  for (const z of g.sizes) allSizes.add(z);
  for (const z of g.offScale) allOffScale.add(z);
  for (const o of g.oddType) allOdd.add(`${where}: ${o}`);
  for (const o of g.oddSpace) allOddSpace.add(`${where}: ${o}`);
};

await measureGate("market gate");
await tap("look around anyway");
await page.locator("input").first().fill("1994").catch(() => {});
await tap("I agree to lili's Platform Terms");
await tap("I agree to Privacy Notice");
await tap("Agree and continue");
await page.waitForTimeout(300);
await measureGate("consent");
await tap("Save choices");
await page.waitForTimeout(300);
await measureGate("splash");
await tap("Shop Now");
await page.waitForTimeout(300);
await measureGate("style picker");
await tap("Skip");
await page.waitForTimeout(600);

const SCREENS = [
  ["home", null],
  ["search", "Search"],
  ["saved", "Saved"],
  ["cart", "Cart"],
  ["sell", "Sell"],
  ["profile", "Profile"],
];

let worstChoices = { screen: "", n: 0 };

section("Fitts's Law — every target a thumb has to hit");
for (const [screenName, navLabel] of SCREENS) {
  if (navLabel) { if (!(await label(navLabel))) continue; }
  else { await label("Home"); }
  await page.waitForTimeout(350);

  const m = await measure();
  for (const t of m.targets) if (t.小) allSmall.set(`${screenName}: ${t.name}`, `${t.w}×${t.h}`);
  for (const c of m.crowded) allCrowded.add(`${screenName}: ${c}`);
  for (const c of m.clipped) allClipped.add(`${screenName}: ${c}`);
  for (const c of m.stranded) allStranded.add(`${screenName}: ${c}`);
  for (const c of m.bilingual) allBilingual.add(`${screenName}: ${c}`);
  for (const s of m.sizes) allSizes.add(s);
  for (const o of m.oddType) allOdd.add(`${screenName}: ${o}`);
  for (const s of m.offScale) allOffScale.add(s);
  for (const o of m.oddSpace) allOddSpace.add(`${screenName}: ${o}`);
  if (m.choices > worstChoices.n) worstChoices = { screen: screenName, n: m.choices };

  record("hick", `${screenName} asks for ${m.controls} distinct decision(s)`,
         `${m.choices} things tappable`, m.controls > MAX_CHOICES);
  record("restorff", `${screenName} has ${m.primary.length} primary action(s)`,
         m.primary.slice(0, 3).join(", "), m.primary.length > 1);
}

for (const [k, v] of gateFindings.small) allSmall.set(k, v);
for (const c of gateFindings.clipped) allClipped.add(c);
for (const c of gateFindings.stranded) allStranded.add(c);
for (const c of gateFindings.bilingual) allBilingual.add(c);

record("fitts", `${allSmall.size} target(s) under ${MIN_TAP}px on their short side`,
       [...allSmall.entries()].slice(0, 6).map(([k, v]) => `${k} ${v}`).join(" · "),
       allSmall.size > 0);
record("fitts", `${allCrowded.size} pair(s) of targets closer than ${MIN_GAP}px`,
       [...allCrowded].slice(0, 4).join(" · "), allCrowded.size > 0);

section("Miller's Law — how many distinctions the eye has to hold");
// The meaningful question is not "how many" — a scale of eleven is a scale —
// but whether every size on the glass is one somebody chose. A single value
// that is on no scale is how 13.333px lived in the tab bar for three releases.
const strays = [...allSizes].filter((n) => !SCALE.includes(n));
record("fitts", `${allClipped.size} element(s) whose text does not fit its box`,
       [...allClipped].slice(0, 5).join(" · "), allClipped.size > 0);

record("jakob", `${allBilingual.size} label(s) printing two languages at once`,
       [...allBilingual].slice(0, 5).join(" · "), allBilingual.size > 0);

record("jakob", `${allStranded.size} Arabic sentence(s) whose punctuation lands on the wrong side`,
       [...allStranded].slice(0, 4).join(" · "), allStranded.size > 0);

record("miller", `${allSizes.size} type sizes, ${strays.length} of them on no scale`,
       strays.length ? `stray: ${strays.join(", ")}` : [...allSizes].sort((a, b) => a - b).join(", "),
       strays.length > 0);
record("miller", `${allOdd.size} element(s) at a half-pixel size`,
       [...allOdd].slice(0, 6).join(" · "), allOdd.size > 0);
record("miller", `${allOffScale.size} layout spacing value(s) off the rhythm`,
       [...allOddSpace].slice(0, 5).join(" · "), allOffScale.size > 0);

section("Doherty Threshold — how long until something happens");
await label("Home");
await page.waitForTimeout(300);
for (const [what, run] of [
  ["opening a listing", async () => {
    await page.locator('div:has-text("AED")').last().click({ timeout: 2500 }).catch(() => {});
  }],
  // Clicked raw, not through label() — that helper waits 350ms after every
  // click, and timing a response with a deliberate wait inside it measures the
  // wait. The first version of this reported 403ms for a screen that changes
  // in about fifty.
  ["switching to Search", async () => {
    await page.locator('button[aria-label="Search"]').first().click({ timeout: 2500 }).catch(() => {});
  }],
]) {
  const before = await page.evaluate(() => document.body.innerHTML.length);
  const t0 = Date.now();
  await run();
  // First CHANGE, not the work finishing. That is what a person perceives.
  let ms = null;
  for (let i = 0; i < 60; i++) {
    const now = await page.evaluate(() => document.body.innerHTML.length);
    if (now !== before) { ms = Date.now() - t0; break; }
    await page.waitForTimeout(16);
  }
  record("doherty", `${what} responds in ${ms == null ? "—" : ms + "ms"}`,
         ms == null ? "no change detected" : "", ms == null || ms > DOHERTY_MS);
  await page.keyboard.press("Escape").catch(() => {});
  await label("Home");
  await page.waitForTimeout(250);
}

section("Jakob's Law — the conventions people arrive with");
const conventions = await page.evaluate(() => {
  const bar = [...document.querySelectorAll("div")].find((d) => {
    const s = getComputedStyle(d);
    return s.position === "fixed" && d.getBoundingClientRect().top > innerHeight * 0.7 &&
           d.querySelectorAll("button").length >= 3;
  });
  return {
    bottomNav: !!bar,
    navItems: bar ? bar.querySelectorAll("button").length : 0,
    reducedMotion: [...document.styleSheets].some((sh) => {
      try { return [...sh.cssRules].some((r) => /prefers-reduced-motion/.test(r.conditionText || "")); }
      catch { return false; }
    }),
    focusRing: [...document.styleSheets].some((sh) => {
      try { return [...sh.cssRules].some((r) => /:focus-visible/.test(r.selectorText || "")); }
      catch { return false; }
    }),
  };
});
record("jakob", "the tab bar is at the bottom, where a thumb is", "", !conventions.bottomNav);
record("miller", `${conventions.navItems} items in the tab bar`,
       "five is the usual ceiling", conventions.navItems > 5);
record("jakob", "keyboard and switch users get a visible focus ring", "", !conventions.focusRing);
record("jakob", "motion is reduced for anyone who asked the OS for that", "", !conventions.reducedMotion);

// ── the icon set, measured rather than parsed ───────────────────────────────
//
// This lives here because it needs a renderer. The first version was in
// `npm run research` and read the path strings as alternating x,y numbers,
// which is not what path data is — a relative command moves the origin, and an
// elliptical arc carries seven parameters of which two are flags. It measured
// the dress as 26 wide and 33 tall inside a 24 box. getBBox is the browser
// doing it correctly.
section("The icon set — drawn, not borrowed");

const iconSource = readFileSync("src/icons/Icon.jsx", "utf8");
const ICONS = {};
for (const m of iconSource.matchAll(/^\s{2}([a-zA-Z_]+):\s*"([^"]+)"/gm)) ICONS[m[1]] = m[2];

const boxes = await page.evaluate((paths) => {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.style.cssText = "position:fixed;left:-9999px;width:240px;height:240px";
  document.body.appendChild(svg);
  const out = {};
  for (const [name, d] of Object.entries(paths)) {
    const el = document.createElementNS(NS, "path");
    el.setAttribute("d", d);
    svg.appendChild(el);
    const b = el.getBBox();
    out[name] = { x: b.x, y: b.y, w: b.width, h: b.height };
    el.remove();
  }
  svg.remove();
  return out;
}, ICONS);

// 1. Nothing outside the grid. A path that overflows 0–24 is clipped by every
//    viewBox that renders it, and the clip is invisible until it is not.
const overflow = Object.entries(boxes)
  .filter(([, b]) => b.x < -0.6 || b.y < -0.6 || b.x + b.w > 24.6 || b.y + b.h > 24.6)
  .map(([n, b]) => `${n} ${b.w.toFixed(1)}×${b.h.toFixed(1)} at ${b.x.toFixed(1)},${b.y.toFixed(1)}`);
record("miller", `${overflow.length} icon(s) drawn outside the 24 grid`,
       overflow.slice(0, 4).join(" · "), overflow.length > 0);

// 2. Optical weight. A set where one glyph fills the box and the next uses half
//    of it does not read as a set: the small one looks broken rather than quiet.
const spans = Object.entries(boxes).map(([n, b]) => [n, Math.max(b.w, b.h)]);
const sorted = spans.map(([, s]) => s).sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
const offWeight = spans.filter(([, s]) => s < median * 0.6 || s > median * 1.3)
                       .map(([n, s]) => `${n} ${s.toFixed(1)} vs ${median.toFixed(1)}`);
record("miller", `${offWeight.length} icon(s) optically out of step with the set`,
       offWeight.slice(0, 4).join(" · "), offWeight.length > 0);

// 3. The croquis rule is stated in Icon.jsx, so it is worth enforcing: the
//    garments this app puts on every tile are drawn taller than wide. This is
//    the check that was wrong while it was reading the string.
const WORN = ["dress", "abaya", "jacket", "top", "skirt"];
const notTall = WORN.filter((g) => boxes[g] && boxes[g].h <= boxes[g].w)
                    .map((g) => `${g} ${boxes[g].w.toFixed(1)}×${boxes[g].h.toFixed(1)}`);
record("restorff", `${notTall.length} garment(s) not drawn to the croquis proportion`,
       notTall.join(" · "), notTall.length > 0);

// ── report ──────────────────────────────────────────────────────────────────
console.log(`\n\x1b[1m${checks - issues}/${checks} measured clean\x1b[0m`);
if (findings.length) {
  console.log("\nWorth fixing:");
  for (const f of findings) console.log(`  \x1b[33m·\x1b[0m [${f.law}] ${f.what}`);
}
console.log("\n\x1b[2mHeuristics, not legislation — but the ones with numbers attached");
console.log("are worth measuring rather than quoting.\x1b[0m\n");

await browser.close();
server.close();
process.exit(0);
