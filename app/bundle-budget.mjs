// Fails the build when the shipped JavaScript grows past its budget.
//
// The app opens on mid-range Android phones over mobile data; every 100 KB of
// script is parse time before the first piece appears. Measured 8 Oct 2026:
// largest chunk 274 KB, all JavaScript 800 KB in 31 files. The budget leaves room to grow
// on purpose and stops a surprise dependency from doubling it unnoticed.
//
//   node bundle-budget.mjs        (after npm run build)
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LARGEST_CHUNK = 340 * 1024;
const ALL_JS = 960 * 1024;

const dir = "dist/assets";
const js = readdirSync(dir).filter((f) => f.endsWith(".js"))
  .map((f) => ({ f, size: statSync(join(dir, f)).size }))
  .sort((a, b) => b.size - a.size);
const total = js.reduce((n, x) => n + x.size, 0);
const kb = (n) => `${Math.round(n / 1024)} KB`;

console.log(`largest chunk ${js[0].f} ${kb(js[0].size)} (budget ${kb(LARGEST_CHUNK)})`);
console.log(`all JavaScript ${kb(total)} in ${js.length} files (budget ${kb(ALL_JS)})`);
const over = js[0].size > LARGEST_CHUNK || total > ALL_JS;
if (over) console.log("Over budget. Lazy-load the new code, or raise the budget in this file on purpose.");
process.exit(over ? 1 : 0);
