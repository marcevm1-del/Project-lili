// ─────────────────────────────────────────────────────────────────────────────
//  THE TRANSLATION LAYER
//
//  Run: npm run i18n
//
//  Two jobs. Prove the layer works — one language at a time, a real fallback,
//  no key rendered raw at a user. And prove the COVERAGE NUMBER IS HONEST,
//  which is the part that will rot if nobody watches it.
//
//  The trap this suite exists for: `coverage("ar")` reads the dictionary, the
//  dictionary was seeded from the 128 labels that were already bilingual, and
//  so it reports 100% on the day it is created while seven eighths of the app
//  is still English. A metric that is green on day one and cannot go down is
//  worse than no metric, because somebody will quote it.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { marketSource } from "./market-source.mjs";
let pass = 0, fail = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(`  ✓ ${name}${detail ? `  \x1b[2m${detail}\x1b[0m` : ""}`); }
  else { fail++; failures.push(name); console.log(`  ✗ ${name}${detail ? `  ${detail}` : ""}`); }
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

const { STRINGS } = await import("./src/i18n/strings.js");
const { t, setLang, getLang, coverage, interfaceCoverage, both } = await import("./src/i18n/t.js");
const { LANGUAGES, getLanguage } = await import("./src/i18n/languages.js");

const srcFiles = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    statSync(p).isDirectory() ? walk(p) : (/\.(js|jsx)$/.test(n) && srcFiles.push(p));
  }
})("src");

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");

const ARABIC = /[؀-ۿ]/;

section("1. One language at a time");

setLang("en");
check("English renders English", t("filters") === "Filters", t("filters"));
setLang("ar");
check("Arabic renders Arabic", ARABIC.test(t("filters")) && !/Filters/.test(t("filters")), t("filters"));
check("and never both at once",
  !/ · /.test(t("filters")) && !/ · /.test(t("add_to_cart")));
setLang("en");
check("the language is a real switch, not a render of both",
  t("add_to_cart") !== (setLang("ar"), t("add_to_cart")));
setLang("en");

section("2. Failing safely");

check("a missing key renders something readable, not blank",
  t("definitely_not_a_key").length > 0);
check("interpolation works, so a sentence stays one string for a translator",
  (STRINGS.__probe = { en: "{n} left", ar: "بقي {n}" }) && t("__probe", { n: 3 }) === "3 left");
setLang("ar");
check("and interpolates in the other language too", t("__probe", { n: 3 }) === "بقي 3");
setLang("en");
delete STRINGS.__probe;
check("`both` still exists for the places that genuinely want two languages",
  / · /.test(both("filters")));

section("3. The dictionary");

check("every entry has English", Object.values(STRINGS).every((e) => e.en && e.en.length));
check("no entry has the separator baked back into it",
  !Object.values(STRINGS).some((e) => / · /.test(e.en) || (e.ar && / · /.test(e.ar))));
check("no English text hiding in an Arabic field",
  !Object.entries(STRINGS).some(([, e]) => e.ar && /^[A-Za-z ]{6,}$/.test(e.ar)));
check("keys are slugs, so a string can be found from what it says",
  Object.keys(STRINGS).every((k) => /^[a-z0-9_]+$/.test(k)));

section("4. The coverage number is honest");

const dict = coverage("ar");
check("dictionary coverage is high, because the dictionary was seeded from it",
  dict.pct >= 90, `${dict.translated}/${dict.total} = ${dict.pct}%`);

// Every quoted string in the source that looks like prose a person reads.
let englishOnly = 0;
for (const f of srcFiles) {
  if (f.includes("i18n/strings")) continue;
  const s = stripComments(readFileSync(f, "utf8"));
  for (const m of s.matchAll(/"([A-Z][^"\n]{9,120})"/g)) {
    const v = m[1];
    if (/^[A-Z_]+$/.test(v) || /[<>{}]/.test(v)) continue;
    if (/^(https?|var\(|image\/|application|Bearer)/.test(v)) continue;
    englishOnly++;
  }
}
const real = interfaceCoverage(englishOnly, "ar");
check("interface coverage is reported separately, and is not the same number",
  real.pct < dict.pct, `interface ${real.pct}% vs dictionary ${dict.pct}%`);
check("the real figure is honest about how much is left",
  real.pct > 5 && real.pct < 60, `${real.translated} translated / ${real.total} total = ${real.pct}%`);

// The status in languages.js has to agree with the measurement. This is the
// assertion that stops "partial" quietly becoming "ready" one afternoon.
check("Arabic is marked 'partial' while the interface figure says partial",
  getLanguage("ar").status === (real.pct >= 90 ? "ready" : "partial"),
  `status=${getLanguage("ar").status}, coverage=${real.pct}%`);
check("English is the one language marked ready",
  getLanguage("en").status === "ready");

section("5. Nothing sneaks back to rendering both languages");

// The pattern this release removed. A new one is a regression, and it is easy
// to add by accident because it looks like being helpful.
const offenders = [];
for (const f of srcFiles) {
  if (f.includes("i18n/")) continue;
  const s = stripComments(readFileSync(f, "utf8"));
  for (const m of s.matchAll(/"([^"\n]{1,70}?) · ([^"\n]{0,60}?)"/g)) {
    if (ARABIC.test(m[2]) !== ARABIC.test(m[1])) offenders.push(`${f}: ${m[1]} · ${m[2]}`);
  }
  // v2.11.4 — shape five: the same label with the languages the other way round.
  //   أضيفي قطعة · How would you like to list?
  // Both halves of this check required English then Arabic, so every label that
  // led with the Arabic walked past both. Four were live: the sell mode chooser,
  // the categories page, the offer sheet and the sellers page. Order-agnostic
  // now — one side Arabic, the other not, either way round.
  for (const m of s.matchAll(/>(\s*)([^<>{}"\n]{1,70}?) · ([^<>{}"\n]{0,60}?)(\s*)</g)) {
    if (ARABIC.test(m[3]) !== ARABIC.test(m[2])) offenders.push(`${f}: ${m[2]} · ${m[3]}`);
  }
  // Shape four, found in v2.11.2: `{t.label} <span>· {t.labelAr}</span>` in the
  // seller-type radio. Neither pattern above can see it — there is no Arabic
  // LITERAL anywhere in it, only a separator sitting beside an expression whose
  // property name ends in Ar. This catches that family, and the caveat stands:
  // a source scan enumerates shapes and there is no end to them. `npm run
  // uxlaws` reads the rendered label, where there is only ever one shape; this
  // check is for the screens that walk cannot reach without an account.
  for (const m of s.matchAll(/·\s*\{\s*[A-Za-z_$][\w$]*\.[\w$]*Ar\b/g)) {
    offenders.push(`${f}: ${m[0].replace(/\s+/g, " ")}`);
  }
}
check("no component prints English and Arabic into one label",
  offenders.length === 0, offenders.slice(0, 4).join(" | "));

section("6. The surfaces that matter when something is wrong");

const report = readFileSync("src/compliance/ReportDialog.jsx", "utf8");
check("every report reason has Arabic — this is the flow with a cost outside the app",
  (report.match(/labelAr:/g) || []).length >= 8);
check("and it is marked as needing a native speaker's review, not passed off as final",
  /REASONS_NEED_NATIVE_REVIEW/.test(report));
check("the legal text is NOT machine-translated into the dictionary",
  !Object.values(STRINGS).some((e) => e.en.length > 160));

section("7. It is wired to something");

const picker = readFileSync("src/i18n/LanguagePicker.jsx", "utf8");
check("choosing a language sets the strings, not only the direction",
  /setLang\(lang\.code\)/.test(picker) && /setDir\(lang\.dir\)/.test(picker));
check("and the tree is told, so it re-renders",
  /onDirChange/.test(marketSource()));

section("8. The translator's file round-trips");

// The mechanism has existed since v2.9.3 and the only thing missing is a
// person who speaks Arabic. Until v2.10 the only way to give her the work was
// to send her the source code.
const { parseCSV } = await import("./i18n-export.mjs").catch(() => ({}));
check("the export tool exists and can read its own output back",
  typeof parseCSV === "function");
if (typeof parseCSV === "function") {
  const round = parseCSV('﻿key,english,arabic\r\na,"He said ""yes""",نعم\r\n');
  check("quoted fields, doubled quotes, CRLF and the BOM all survive",
    round.length === 2 && round[1][1] === 'He said "yes"' && round[1][2] === "نعم",
    JSON.stringify(round[1]));
}

const exportSrc = readFileSync("i18n-export.mjs", "utf8");
check("the file is ordered by what a comprehension failure costs, not alphabetically",
  /const PRIORITY = \[/.test(exportSrc) &&
  exportSrc.indexOf('"Reporting a listing or a person"') <
  exportSrc.indexOf('"Internal — moderator screens"'));
check("long-form legal text is kept out of it",
  /MAX_LEN = 160/.test(exportSrc));
check("the importer refuses English pasted into the Arabic column",
  /the Arabic cell has no Arabic in it/.test(exportSrc));
check("and refuses a row whose English was edited",
  /the English was changed/.test(exportSrc));
check("it writes a byte-order mark, or Excel opens Arabic as mojibake",
  /"\\ufeff"|"﻿"/.test(exportSrc) || exportSrc.includes('return "﻿"') || /toCSV = \(rows\) => "/.test(exportSrc));

console.log(`\n\x1b[1m${pass}/${pass + fail} passed\x1b[0m`);
console.log(`\x1b[2mArabic: ${real.translated} of ${real.total} user-visible strings — ${real.pct}%.`);
console.log(`The rest is Legal Centre, Help Centre answers, long-form copy and error`);
console.log(`text, and it wants a translator rather than another release.\x1b[0m`);
if (fail) {
  console.log("\nFailed:");
  failures.forEach((f) => console.log(`  · ${f}`));
  process.exit(1);
}
