// Fails the build when the shipped JavaScript grows past its budget.
//
// The app opens on mid-range Android phones over mobile data; every 100 KB of
// script is parse time before the first piece appears. Measured 8 Oct 2026:
// largest chunk 274 KB, all JavaScript 800 KB in 31 files. 14 Oct 2026: 328 KB
// with delivery and orders, back to 268 KB once Sell, the shop pages, Messages
// and the shortlist loaded on first tap. 16 Oct 2026: 294 KB as the Arabic
// dictionary grew, 264 KB once the Arabic half became its own file loaded only
// when Arabic is chosen (i18n-split.mjs). The budget leaves room to grow
// on purpose and stops a surprise dependency from doubling it unnoticed.
//
//   node bundle-budget.mjs        (after npm run build)
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LARGEST_CHUNK = 340 * 1024;
const ALL_JS = 960 * 1024;
// The Arabic half of the dictionary is text, not a dependency, and it is
// loaded only by the women who read Arabic. It gets its own line, so a full
// translation can land without eating the room meant for catching code bloat.
const ARABIC = 120 * 1024;

const dir = "dist/assets";
const all = readdirSync(dir).filter((f) => f.endsWith(".js"))
  .map((f) => ({ f, size: statSync(join(dir, f)).size }))
  .sort((a, b) => b.size - a.size);
const isArabic = (x) => /^strings\.ar-/.test(x.f);
const js = all.filter((x) => !isArabic(x));
const ar = all.filter(isArabic).reduce((n, x) => n + x.size, 0);
const total = js.reduce((n, x) => n + x.size, 0);
const kb = (n) => `${Math.round(n / 1024)} KB`;

console.log(`largest chunk ${js[0].f} ${kb(js[0].size)} (budget ${kb(LARGEST_CHUNK)})`);
console.log(`all JavaScript ${kb(total)} in ${js.length} files (budget ${kb(ALL_JS)})`);
console.log(`Arabic dictionary ${kb(ar)} (budget ${kb(ARABIC)})`);
const over = js[0].size > LARGEST_CHUNK || total > ALL_JS || ar > ARABIC || ar === 0;
if (ar === 0) console.log("No separate Arabic dictionary in the build: has t.js gone back to importing strings.js?");
if (over) console.log("Over budget. Lazy-load the new code, or raise the budget in this file on purpose.");
process.exit(over ? 1 : 0);
