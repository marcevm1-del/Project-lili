#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  ANDROID COMPATIBILITY
//
//  The manifest says minSdkVersion 23 — Android 6.0, 2015. Play will therefore
//  offer this app to those devices. Whether it RUNS there is a different
//  question, and it comes down to one component: Android System WebView, which
//  renders the entire app.
//
//  WebView is updatable through the Play Store, so most active devices carry
//  something recent. Not all: devices without Play Services (Huawei since 2019),
//  devices where updates are disabled or storage is full, and grey-market
//  handsets can be years behind.
//
//  This scans the BUILT bundle for CSS and JS features, maps each to the Chrome
//  version that introduced it, and reports the real floor — as opposed to the
//  floor the manifest claims.
//
//  Usage: npm run android-compat
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIST = "dist/assets";
if (!existsSync(DIST)) { console.error("Run `npm run build` first."); process.exit(1); }

const files = readdirSync(DIST).map((f) => ({ name: f, text: readFileSync(join(DIST, f), "utf8") }));
const css = files.filter((f) => f.name.endsWith(".css")).map((f) => f.text).join("\n");
const js = files.filter((f) => f.name.endsWith(".js")).map((f) => f.text).join("\n");
const html = existsSync("dist/index.html") ? readFileSync("dist/index.html", "utf8") : "";
const all = css + "\n" + js + "\n" + html;

// Android release → the WebView version it originally shipped with.
// WebView updates independently, so this is the FLOOR for a device that has
// never updated, not what a typical device runs today.
const ANDROID = [
  { api: 23, name: "6.0 Marshmallow", chrome: 44, year: 2015 },
  { api: 24, name: "7.0 Nougat",      chrome: 51, year: 2016 },
  { api: 26, name: "8.0 Oreo",        chrome: 58, year: 2017 },
  { api: 28, name: "9 Pie",           chrome: 66, year: 2018 },
  { api: 29, name: "10",              chrome: 74, year: 2019 },
  { api: 30, name: "11",              chrome: 83, year: 2020 },
  { api: 31, name: "12",              chrome: 94, year: 2021 },
  { api: 33, name: "13",              chrome: 108, year: 2022 },
  { api: 34, name: "14",              chrome: 120, year: 2023 },
];

// feature → [regex, chrome version, what breaks if unsupported, severity]
const FEATURES = [
  // CSS
  ["dvh units",          /\d(?:dvh|dvw)/,               108, "full-height screens collapse", "high"],
  ["color-mix()",        /color-mix\(/,                 111, "focus ring loses its glow",     "low"],
  ["aspect-ratio",       /aspect-ratio\s*:/,             88, "listing tiles lose their shape","high"],
  [":focus-visible",     /:focus-visible/,               86, "focus ring shows on tap too",   "low"],
  ["flexbox gap",        /display\s*:\s*flex[^}]*gap\s*:/, 84, "spacing between items vanishes","medium"],
  ["inset shorthand",    /[^-]inset\s*:\s*0/,            87, "overlays don't cover the screen","high"],
  ["backdrop-filter",    /backdrop-filter/,              76, "blur behind buttons is skipped","low"],
  ["env() safe areas",   /env\(safe-area/,               69, "content sits under the notch",  "medium"],
  ["CSS custom props",   /var\(--/,                      49, "every colour falls back to none","critical"],
  ["position: sticky",   /position\s*:\s*sticky/,        56, "top bars scroll away",          "medium"],
  ["object-fit",         /object-fit/,                   32, "photos stretch",                "medium"],
  // JS
  ["optional chaining",  /[a-zA-Z_$)\]]\?\.[a-zA-Z_$[(]/, 80, "app fails to parse — white screen","critical"],
  ["nullish coalescing", /[a-zA-Z_$)\]]\s*\?\?\s*[a-zA-Z_${(]/, 80, "app fails to parse — white screen","critical"],
  ["ES modules",         /<script[^>]+type="module"/,    61, "app never starts",              "critical"],
  ["Array.flat",         /\.flat\(\)/,                   69, "runtime error",                 "high"],
  ["Object.entries",     /Object\.entries/,              54, "runtime error",                 "high"],
  ["Promise.allSettled", /allSettled/,                   76, "runtime error",                 "high"],
  ["String.matchAll",    /\.matchAll\(/,                 73, "runtime error",                 "high"],
  ["globalThis",         /globalThis/,                   71, "runtime error",                 "high"],
];

// A feature with a fallback declared before it is progressive enhancement, not
// a requirement — an old engine drops the line and keeps the fallback. Counting
// those as hard requirements overstates the floor.
// APIs we ship a polyfill for are no longer a requirement.
//
// v2.10 — this used to search index.html for the polyfill SOURCE. The
// polyfills have lived in their own file since the CSP was tightened (an
// inline block would need script-src 'unsafe-inline', which is most of what a
// CSP buys you), so the search never matched and the report claimed three
// high-severity runtime errors that had been fixed all along. It now follows
// the <script src> the page actually loads, which also means deleting the
// polyfill file raises the reported floor instead of going unnoticed.
const polyfillSrc = (() => {
  let out = html;
  for (const m of html.matchAll(/<script[^>]+src="\/([^"]+\.js)"/g)) {
    const p = join("dist", m[1]);
    if (existsSync(p)) out += "\n" + readFileSync(p, "utf8");
  }
  return out;
})();
const POLYFILLED = ["globalThis", "Object.entries", "Object.values",
                    "Promise.allSettled", "Array.flat", "String.matchAll"]
  .filter((name) => {
    const bare = name.replace(/^(Array|String)\./, "");
    return new RegExp(`(?:!|typeof\\s+)?(?:window\\.|Array\\.prototype\\.|String\\.prototype\\.|Object\\.|Promise\\.)?${bare}\\b`)
      .test(polyfillSrc.slice(html.length));   // only what the polyfill file says
  });

const ENHANCED = [
  ["dvh units",      /min-height:\s*100vh;\s*min-height:\s*100dvh/],
  // padding-top declared first, aspect-ratio applied only inside @supports —
  // an engine that does not know the property keeps the ratio box.
  ["aspect-ratio",   /padding-top:[^;]+;[\s\S]{0,400}@supports\s*\(aspect-ratio/],
  [":focus-visible", /:focus-visible/],          // purely additive
  ["backdrop-filter",/backdrop-filter/],         // decorative blur only
  ["color-mix()",    /rgba\([^)]*\)/],            // replaced with rgba
  ["env() safe areas", /padding:\s*34px 20px;\s*padding:\s*calc\(env\(/],  // plain padding declared first
];

const found = [];
for (const [name, re, chrome, breaks, severity] of FEATURES) {
  const target = name === "ES modules" ? html : all;
  if (!re.test(target)) continue;
  const enh = ENHANCED.find(([n, fb]) => n === name && fb.test(all));
  const poly = POLYFILLED.includes(name);
  found.push({ name, chrome, breaks, severity, enhanced: !!enh, polyfilled: poly });
}
found.sort((a, b) => b.chrome - a.chrome);

const hard = found.filter((f) => !f.enhanced && !f.polyfilled);
const required = hard.length ? Math.max(...hard.map((f) => f.chrome)) : 0;
const criticalReq = found.filter((f) => f.severity === "critical");
const criticalFloor = criticalReq.length ? Math.max(...criticalReq.map((f) => f.chrome)) : 0;

const SEV = { critical: "\x1b[31mcritical\x1b[0m", high: "\x1b[31mhigh\x1b[0m",
              medium: "\x1b[33mmedium\x1b[0m", low: "\x1b[2mlow\x1b[0m" };

console.log("\n\x1b[1mANDROID COMPATIBILITY\x1b[0m");
console.log("\x1b[2mWhat the built bundle actually requires of the WebView.\x1b[0m\n");

console.log("\x1b[1mFeatures in use\x1b[0m");
for (const f of found) {
  const tag = f.polyfilled ? "\x1b[32mpolyfilled\x1b[0m"
            : f.enhanced ? "\x1b[32menhancement\x1b[0m" : SEV[f.severity];
  const note = f.polyfilled ? "shipped with a polyfill"
             : f.enhanced ? "falls back cleanly" : f.breaks;
  console.log(`  Chrome ${String(f.chrome).padStart(3)}+  ${f.name.padEnd(20)} ${tag}` +
              `  \x1b[2m${note}\x1b[0m`);
}

console.log(`\n\x1b[1mFloor\x1b[0m`);
console.log(`  App renders correctly from    \x1b[1mChrome ${required}\x1b[0m`);
// Below the start floor the page still renders #boot-fallback — a bilingual
// note telling her to update Android System WebView from the Play Store, which
// she then can. That is a supported outcome, not a broken one, and calling it a
// white screen when a real message is on the phone overstates the problem by
// about as much as the polyfill bug understated it.
const hasBootFallback = /id="boot-fallback"/.test(html) &&
                        /Android System WebView/i.test(html);
console.log(`  App at least STARTS from      \x1b[1mChrome ${criticalFloor}\x1b[0m` +
            `  \x1b[2m(below this: ${hasBootFallback
              ? "a bilingual note telling her to update WebView" : "white screen"})\x1b[0m`);

console.log(`\n\x1b[1mAgainst Android releases\x1b[0m \x1b[2m(WebView as originally shipped, never updated)\x1b[0m`);
for (const a of ANDROID) {
  const starts = a.chrome >= criticalFloor;
  const perfect = a.chrome >= required;
  const mark = perfect ? "\x1b[32m✓ full\x1b[0m"
    : starts ? "\x1b[33m~ runs, some layout breaks\x1b[0m"
    : hasBootFallback ? "\x1b[33m! asks her to update WebView\x1b[0m"
    : "\x1b[31m✗ white screen\x1b[0m";
  console.log(`  API ${String(a.api).padEnd(3)} Android ${a.name.padEnd(16)} Chrome ${String(a.chrome).padStart(3)}  ${mark}`);
}

const minSdk = (() => {
  try {
    const g = readFileSync("android/variables.gradle", "utf8");
    return Number((g.match(/minSdkVersion\s*=\s*(\d+)/) || [])[1]);
  } catch { return null; }
})();

console.log(`\n\x1b[1mVerdict\x1b[0m`);
if (minSdk) {
  const claimed = ANDROID.filter((a) => a.api >= minSdk);
  const broken = claimed.filter((a) => a.chrome < criticalFloor);
  const degraded = claimed.filter((a) => a.chrome >= criticalFloor && a.chrome < required);
  console.log(`  Manifest declares minSdkVersion ${minSdk}.`);
  if (broken.length && hasBootFallback) {
    console.log(`  \x1b[33m${broken.length} declared version(s) need an updated WebView\x1b[0m` +
                `: ${broken.map((b) => b.name).join(", ")}`);
    console.log(`  \x1b[2mOn a stock WebView those phones show the update note rather than the app.`);
    console.log(`  WebView updates from the Play Store on every certified device, so this is`);
    console.log(`  a one-tap fix she is told about — which is why minSdkVersion ${minSdk} still`);
    console.log(`  stands rather than being raised to ${(ANDROID.find((a) => a.chrome >= criticalFloor) || {}).api}.\x1b[0m`);
  } else if (broken.length) {
    console.log(`  \x1b[31m${broken.length} declared Android version(s) cannot start the app\x1b[0m` +
                ` on an un-updated WebView: ${broken.map((b) => b.name).join(", ")}`);
  } else {
    console.log(`  \x1b[32mEvery declared Android version can start the app.\x1b[0m`);
  }
  if (degraded.length) {
    console.log(`  \x1b[33m${degraded.length} version(s) start but lose layout\x1b[0m: ` +
                degraded.map((d) => d.name).join(", "));
  }
}
console.log(`\n\x1b[2mWebView updates through the Play Store, so most real devices run something`);
console.log(`recent regardless of their Android version. This is the worst case: a device`);
console.log(`with no Play Services, or one where WebView was never updated.\x1b[0m\n`);
