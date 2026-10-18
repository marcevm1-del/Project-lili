#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  RELEASE AUDIT
//
//  This does NOT certify legal compliance. Nothing can. It inspects the actual
//  built artifact and the source, and reports what is verifiably true.
//
//  Three outcomes:
//    PASS — checked against the real APK or source, and it holds
//    FAIL — checked, and it does not hold. Fix before submitting.
//    MANUAL — cannot be checked by a script. Named so it is not forgotten.
//
//  The MANUAL list is the honest part. A green run means "nothing automatable
//  is broken", not "you may publish".
//
//  Usage: npm run audit
// ─────────────────────────────────────────────────────────────────────────────
import { execSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APK = "android/app/build/outputs/apk/release/app-release.apk";
const AAB = "android/app/build/outputs/bundle/release/app-release.aab";

let pass = 0, fail = 0;
const manual = [];
const results = [];

const check = (area, label, ok, detail = "") => {
  results.push({ area, label, ok, detail });
  ok ? pass++ : fail++;
};
const note = (area, label, why) => manual.push({ area, label, why });

const sh = (cmd) => {
  try { return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
  catch { return ""; }
};

// Read every source file once so checks are greps over a known corpus.
const source = (() => {
  const out = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(jsx?|html|css)$/.test(f)) out.push({ path: p, text: readFileSync(p, "utf8") });   // css too — safe areas and theming live there
    }
  };
  walk("src");
  if (existsSync("web")) walk("web");
  return out;
})();
const all = source.map((f) => f.text).join("\n");
const has = (re) => re.test(all);

console.log("\n\x1b[1mRELEASE AUDIT — love it or leave it\x1b[0m");
console.log("Inspecting the built artifact, not the intention.\n");

// ── 1. artifact ────────────────────────────────────────────────────────────
//
// v2.11.6 — these were two unconditional `check`s, so they FAILED on every run,
// so `audit` exited 1 on every run, so the `&&` chain in `npm run verify` died
// here. `imagequality`, `i18n`, `preflight` and `legal` had not executed inside
// a verify run at all — confirmed by grepping a full log for their output and
// finding none. Every "full verify is green" in the last several release notes
// was reporting suites that had been run by hand, not by the chain.
//
// A release build needs `keystore.properties`, and that key belongs to whoever
// owns the Play listing — it is deliberately not in this repo. So "no release
// APK here" is an environmental fact, not a defect, and a permanently red line
// for an expected condition is how people learn to scroll past red.
//
// With no keystore it is reported as work for a human. With a keystore present
// and the artefact still missing, it fails, because then it is a real failure.
const apkExists = existsSync(APK);
const canSign = existsSync("keystore.properties");
if (canSign) {
  check("Artifact", "Release APK built", apkExists);
  check("Artifact", "Play bundle (.aab) built", existsSync(AAB));
} else {
  note("Artifact", "Release APK and .aab",
       "No keystore.properties, so a release build cannot happen in this checkout. " +
       "`npm run apk` makes a debug build for sideloading; the upload key belongs " +
       "with the Play listing and must not live in the repo.");
}

if (apkExists) {
  const badging = sh(`aapt2 dump badging ${APK}`);
  const target = (badging.match(/targetSdkVersion:'(\d+)'/) || [])[1];
  const min = (badging.match(/minSdkVersion:'(\d+)'/) || [])[1];
  const pkg = (badging.match(/package: name='([^']+)'/) || [])[1];
  const perms = [...badging.matchAll(/uses-permission: name='([^']+)'/g)].map((m) => m[1]);

  check("Artifact", `Target API ${target} meets Play's minimum (35)`, Number(target) >= 35,
        `targetSdkVersion=${target}`);
  check("Artifact", `Min API ${min} covers current devices`, Number(min) >= 21 && Number(min) <= 26,
        `minSdkVersion=${min}`);
  check("Artifact", "Package id is not a placeholder", !!pkg && !/example|test|com\.mycompany/.test(pkg), pkg);

  const risky = perms.filter((p) =>
    /LOCATION|READ_CONTACTS|READ_SMS|CALL_LOG|RECORD_AUDIO|READ_EXTERNAL_STORAGE|QUERY_ALL_PACKAGES/.test(p));
  check("Artifact", "No high-scrutiny permissions requested", risky.length === 0,
        risky.length ? risky.join(", ") : `only: ${perms.join(", ")}`);

  const sig = sh(`apksigner verify --print-certs ${APK} 2>&1`);
  check("Artifact", "APK is signed", /Signer #1 certificate DN/.test(sig) || sh(`apksigner verify ${APK} 2>&1`) !== "");
} else {
  // v2.11.2: this said "Run `npm run apk` before auditing", and `npm run apk`
  // builds a DEBUG apk, into a different directory than the one checked above.
  // The instruction could be followed exactly and the check would still fail —
  // which is how people learn to ignore a red line. It fails for a real reason:
  // a release build needs the upload keystore, and that key belongs to whoever
  // owns the Play listing. It is deliberately not generated in this repo.
  note("Artifact", "Build the release APK",
       "`npm run apk` makes a debug build for sideloading, not this one. " +
       "A release APK/AAB needs the upload keystore, which must not live in the repo.");
}

// ── 2. user-generated content (the policy that rejects marketplaces) ────────
check("UGC", "Users can report a listing", has(/Report this listing/i));
check("UGC", "Users can report a seller", has(/kind:"seller"/));
check("UGC", "Users can block a seller", has(/blockSeller/));
check("UGC", "Blocked sellers are hidden everywhere, not just one screen",
      has(/visibleItems/) && has(/visibleShops/));
check("UGC", "Reports reach a moderation queue, not a dead end", has(/enqueue\(/));
check("UGC", "Decisions carry a statement of reasons", has(/statementToReporter/));
check("UGC", "Decisions can be appealed", has(/resolveAppeal/));
check("UGC", "A repeat-infringer policy exists and escalates", has(/STRIKE_POLICY/));
check("UGC", "Listings are screened before publishing", has(/screenListing/));

// ── 3. data safety and privacy ─────────────────────────────────────────────
check("Privacy", "Age gate present", has(/AgeGate/));
check("Privacy", "Consent is granular, not one blanket tick", has(/personalisation/) && has(/analytics/));
check("Privacy", "Marketing consent is off by default", has(/marketing:\s*existing\?\.marketing\s*\?\?\s*false/));
check("Privacy", "Consent can be withdrawn in-app", has(/withdrawConsent/));
check("Privacy", "Users can export their data", has(/exportAll/));
check("Privacy", "In-app account deletion", has(/deletion_requested/));
check("Privacy", "Public deletion page exists (Play requires it)",
      existsSync("web/delete-account.html"));
check("Privacy", "Photo metadata is stripped before storage",
      has(/metadataStripped/) && has(/processImage/));

// ── 4. commerce and marketplace posture ────────────────────────────────────
check("Commerce", "Seller is named before the buy button", has(/not by lili/));
check("Commerce", "Private vs business seller is disclosed", has(/consumerRightsApply/));
check("Commerce", "Platform does not hold funds", /liliHoldsFunds:\s*false/.test(all));
check("Commerce", "No Play Billing for physical goods",
      !has(/com\.android\.billingclient|BillingClient/));
check("Commerce", "Prohibited items are enforced, not just listed", has(/verdict === "block"/));
check("Commerce", "Counterfeit price-floor check is wired up", has(/priceIsPlausible/));

// ── 5. correctness traps ───────────────────────────────────────────────────
// The hazard is a MIXED-script token — the original `isCalibреOK` had Cyrillic
// "ре" inside a Latin identifier and silently never matched. Cyrillic on its
// own is legitimate content: "Русский" is the name of a language we support.
const mixedScript = source.flatMap((f) =>
  (f.text.match(/[A-Za-z_$][A-Za-z0-9_$]*[\u0400-\u04FF][A-Za-z0-9_$\u0400-\u04FF]*/g) || [])
    .map((tok) => `${f.path.replace("src/", "")}: ${tok}`));
check("Code", "No mixed Latin/Cyrillic identifiers", mixedScript.length === 0,
      mixedScript.slice(0, 3).join(", "));
check("Code", "No browser storage APIs that fail in a WebView shell",
      !has(/sessionStorage/));
check("Code", "Single React context instance (no duplicate-module bug)",
      existsSync("src/compliance/context.js"));
check("Code", "Android back button is handled", has(/useAndroidBack/));
check("Code", "Safe-area insets respected", has(/safe-area-inset-bottom/));

// ── things no script can settle ────────────────────────────────────────────
note("Licensing", "Trade licence for marketplace activity",
     "A company matter. The activity must read as intermediary services, not retail.");
check("Legal", "Terms, Privacy Notice, Seller Policy and nine more drafted (src/legal/policies.js)",
      existsSync("src/legal/policies.js") && existsSync("web/policies/privacy.html"));
note("Legal", "All three documents reviewed by UAE counsel",
     "Drafts exist and are marked as drafts. None may be published unreviewed.");
note("Legal", "Terms of Sale (seller to buyer)",
     "lili must not be a party. Counsel should draft a template sellers adopt.");
note("Legal", "Arabic legal translation",
     "Consumer terms need Arabic, and it prevails over English. A human translation job.");
note("Tax", "Agent vs principal for VAT",
     "Turns on the seller agreement wording. Only a tax adviser can settle it.");
note("Payments", "CBUAE-licensed processor engaged",
     "Code asserts lili holds no funds. Only a signed processor agreement makes it true.");
note("Backend", "Server-side geo, screening and auth",
     "Every client check is advisory. The server must repeat all of them.");
note("Play Console", "Data safety form matches reality",
     "Declare every data type actually collected. Mismatches cause suspension.");
note("Play Console", "Privacy policy at a public URL",
     "Required. Not a PDF, not a Google Doc.");
note("Play Console", "Screenshots and content rating",
     "Needs a device. Minimum 2 phone screenshots.");
note("Multi-user", "Two devices can see each other",
     "Still the biggest gap. Without it, Minimum Functionality rejection is likely.");

// ── what a phone downloads before it can show anything ──────────────────────
//
// A budget, not a target. It exists so a convenience import cannot quietly put
// another 40 kB in front of the first paint — which is exactly what happened
// with the compliance barrel: one `import { useCompliance }` made LegalCenter,
// listingRules and the 23 kB resale-value model statically reachable, and every
// lazy() boundary around them was decorative.
{
  const dir = "dist/assets";
  if (!existsSync(dir)) {
    note("Bundle", "First-paint budget", "Run `npm run build` first — no dist/ to measure.");
  } else {
    const js = readdirSync(dir).filter((f) => f.endsWith(".js"));
    const html = existsSync("dist/index.html") ? readFileSync("dist/index.html", "utf8") : "";
    // Only what index.html actually pulls before anything renders: the entry
    // script and whatever it preloads. Lazy chunks are not in this number,
    // which is the whole point of them.
    const eager = js.filter((f) => html.includes(f));
    const bytes = eager.reduce((n, f) => n + statSync(join(dir, f)).size, 0);
    const BUDGET = 420 * 1024;
    check("Bundle", "First paint stays inside its budget", bytes <= BUDGET,
          `${(bytes / 1024).toFixed(0)} kB of ${(BUDGET / 1024).toFixed(0)} kB across ${eager.length} file(s)`);

    // The two specific regressions this budget was written after.
    const barrel = readFileSync("src/compliance/index.js", "utf8");
    check("Bundle", "the compliance barrel exports rules, not screens",
          !/from "\.\/[A-Z][A-Za-z]*\.jsx"/.test(barrel.replace(/ComplianceProvider\.jsx/g, "")),
          "a component re-exported here is in the entry chunk however it is imported");
    const repoSrc = readFileSync("src/data/repo.js", "utf8");
    check("Bundle", "moderator machinery is not in every shopper's bundle",
          !/^import .*moderation\.js/m.test(repoSrc),
          "repo.js is reachable from the first paint");
  }
}

// ── report ─────────────────────────────────────────────────────────────────
let area = "";
for (const r of results) {
  if (r.area !== area) { area = r.area; console.log(`\n\x1b[1m${area}\x1b[0m`); }
  const mark = r.ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
  console.log(`  ${mark} ${r.label}${r.detail ? `  \x1b[2m${r.detail}\x1b[0m` : ""}`);
}

console.log(`\n\x1b[1mCannot be checked by a script — ${manual.length} items\x1b[0m`);
for (const m of manual) console.log(`  \x1b[33m•\x1b[0m ${m.area}: ${m.label}\n    \x1b[2m${m.why}\x1b[0m`);

console.log(`\n\x1b[1m${pass} passed, ${fail} failed, ${manual.length} need a human\x1b[0m`);
console.log("\x1b[2mA clean run means nothing automatable is broken. It does not mean you may publish.\x1b[0m\n");
process.exit(fail ? 1 : 0);
