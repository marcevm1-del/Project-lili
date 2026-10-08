// Runs every suite CI depends on and fails unless each one actually ran.
//
// A green job used to mean "no script exited non-zero", which is also what a
// suite that silently skipped everything looks like. Here each suite must exit
// 0 AND print a summary with at least the expected number of passing checks
// and no failures. Lower a floor only on purpose, in the same commit that
// removes the checks.
//
//   node ci-suites.mjs            all suites (needs `npm run build` first)
//   node ci-suites.mjs smoke walk only those
import { spawnSync } from "node:child_process";

const SUITES = [
  // name         file                       min passes
  ["smoke",      "vite-node smoke.test.mjs",       199],
  ["research",   "vite-node research.test.mjs",    481],
  ["walk",       "vite-node walkthrough.test.mjs",  71],
  ["contract",   "node api-contract.test.mjs",      30],
  ["functional", "node functional.test.mjs",        26],
  ["settings",   "node settings.test.mjs",          13],
  ["keyboard",   "node keyboard.test.mjs",          13],
  ["oldwebview", "node oldwebview.test.mjs",         6],
  ["loading",    "node loading.test.mjs",           17],
  ["devices",    "node devices.test.mjs",           66],
  ["a11y",       "node a11y.test.mjs",              15],
  ["security",   "node security.test.mjs",         222],
];

const only = process.argv.slice(2);
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

// Recognised summaries: "199 passed, 0 failed", "464/464 passed",
// "212/222 passed, 10 failed", "15 screens scanned, 0 issues".
function summary(out) {
  let m = [...out.matchAll(/(\d+)\/(\d+) passed(?:, (\d+) failed)?/g)].pop();
  if (m) return { passed: +m[1], failed: +(m[3] || 0) + (+m[2] - +m[1] - +(m[3] || 0)) };
  m = [...out.matchAll(/(\d+) passed, (\d+) failed/g)].pop();
  if (m) return { passed: +m[1], failed: +m[2] };
  m = [...out.matchAll(/(\d+) screens scanned, (\d+) issues/g)].pop();
  if (m) return { passed: +m[1], failed: +m[2] };
  return null;
}

const rows = [];
let bad = 0;
for (const [name, cmd, min] of SUITES) {
  if (only.length && !only.includes(name)) continue;
  const [bin, ...args] = cmd.split(" ");
  const r = spawnSync(bin === "vite-node" ? "npx" : bin, bin === "vite-node" ? [bin, ...args] : args,
    { encoding: "utf8", env: process.env, maxBuffer: 64 << 20, timeout: 15 * 60_000 });
  const out = strip((r.stdout || "") + (r.stderr || ""));
  const s = summary(out);
  let verdict = "ok";
  if (r.status !== 0) verdict = `exit ${r.status ?? r.signal}`;
  else if (!s) verdict = "no summary printed — did it run?";
  else if (s.failed > 0) verdict = `${s.failed} failed`;
  else if (s.passed < min) verdict = `only ${s.passed} checks ran, expected ≥ ${min}`;
  if (verdict !== "ok") {
    bad++;
    console.log(`\n──── ${name} (last 40 lines) ────\n` + out.trimEnd().split("\n").slice(-40).join("\n"));
  }
  rows.push(`${verdict === "ok" ? "✓" : "✗"} ${name.padEnd(11)} ${s ? `${s.passed} passed`.padEnd(12) : "".padEnd(12)} ${verdict}`);
}

console.log("\n" + rows.join("\n"));
console.log(`\n${rows.length - bad}/${rows.length} suites ran clean`);
if (only.length && rows.length !== only.length) { console.log("unknown suite name"); process.exit(1); }
process.exit(bad ? 1 : 0);
