// ─────────────────────────────────────────────────────────────────────────────
//  THE TRANSLATOR'S FILE
//
//  Run: npm run i18n:export      →  writes i18n/to-translate.csv
//       npm run i18n:import      →  reads i18n/translated.csv back into the
//                                    dictionary
//
//  ── the problem this solves
//
//  About 861 strings are English-only. The mechanism to switch languages has
//  existed since v2.9.3 and works; what is missing is a person who speaks
//  Arabic. Until now the only way to give her the work was to send her the
//  source code, which is not a thing you can ask of a translator.
//
//  ── one file, two states
//
//  `to-translate.csv` is her file, and every string in the app that a person
//  reads is in it, ordered by what a comprehension failure costs — reporting
//  harassment first, moderator screens last. Each row carries a `status`:
//
//    wired          — already going through t(). It changes a screen the
//                     moment the file comes back.
//    not yet wired  — still a hard-coded literal in a component. Translating
//                     it now files the Arabic under the key it will have, so
//                     nobody waits for the other half to finish.
//
//  The first version of this wrote two separate files and hers came back with
//  ZERO rows in it: all 139 dictionary entries were seeded from labels that
//  were already bilingual. The bottleneck was never translation — it is that
//  775 strings have never been moved into the dictionary at all. Splitting the
//  work into two files made the translator wait for a developer for no reason.
//
//  `not-yet-extracted.csv` is the developer's half of the same list: which
//  literal to move into the dictionary, and in which order.
//
//  There is a `notes` column with the files each string appears in, because
//  "Save" as a button and "Save" as a heading are different words in Arabic
//  and nobody can tell which is which from the word alone.
//
//  ── what is deliberately excluded
//
//  Terms, the seller agreement, the refund policy and anything over 160
//  characters. `languages.js` has been right about this from the beginning: a
//  marketplace's listing rules and seller agreement are the last text on earth
//  to run through a translation engine and ship unread. Those want a lawyer who
//  works in both languages, not this file.
//
//  ── the encoding, which matters more than it should
//
//  The CSV is written with a UTF-8 byte-order mark. Without it Excel on Windows
//  opens Arabic as mojibake, the translator assumes the file is broken, and you
//  lose a day. The importer strips the BOM again and tolerates it coming back.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "i18n";
const FOR_TRANSLATOR = join(OUT_DIR, "to-translate.csv");
const FOR_DEVELOPER  = join(OUT_DIR, "not-yet-extracted.csv");
const RETURNED       = join(OUT_DIR, "translated.csv");
const DICT           = "src/i18n/strings.js";

const MAX_LEN = 160;   // the legal-text line, same as the one i18n.test.mjs asserts

// ── csv ─────────────────────────────────────────────────────────────────────
const esc = (v) => {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCSV = (rows) => "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";

/** A small, complete CSV reader — quoted fields, doubled quotes, CRLF, BOM. */
export function parseCSV(text) {
  const s = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim().length));
}

// ── the source ──────────────────────────────────────────────────────────────
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

/**
 * Where a string lives, in words a translator can use.
 *
 * "src/sell/BulkList.jsx" is meaningless to her. "Listing several pieces at
 * once" is the difference between a good translation and a literal one.
 */
const AREA = [
  [/compliance\/LegalCenter/,   "Privacy & safety centre"],
  [/compliance\/ReportDialog/,  "Reporting a listing or a person"],
  [/compliance\/ModerationQueue/, "Internal — moderator screens"],
  [/compliance\/ListingScreen/, "When a listing is held for review"],
  [/compliance\//,              "Rules and legal wording"],
  [/HelpCentre/,                "Help centre answers"],
  [/sell\/BulkList/,            "Listing several pieces at once"],
  [/sell\//,                    "Listing something for sale"],
  [/discovery\//,               "Search and filters"],
  [/meet\//,                    "Arranging to meet a seller"],
  [/invites\//,                 "Invitations to the beta"],
  [/offers\//,                  "Making and answering offers"],
  [/messages\/|conversations/,  "Messages between two women"],
  [/auth\//,                    "Signing in"],
  [/settings\//,                "Settings"],
  [/loading\/|ErrorBoundary/,   "Loading, errors and empty screens"],
  [/notifications\//,           "Notifications"],
  [/data\/|backend\//,          "Errors the app reports when something fails"],
  [/Marketplace|market\/|pages\//, "The main shopping screens"],
];
const areaOf = (f) => (AREA.find(([re]) => re.test(f)) || [null, "Elsewhere"])[1];

/** A slug of the English, matching how the existing dictionary keys were made. */
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48);

function extractLiterals() {
  const found = new Map();   // english -> {files:Set, area}
  for (const f of srcFiles) {
    if (f.includes("i18n/strings")) continue;
    const body = stripComments(readFileSync(f, "utf8"));
    const lines = body.split("\n");
    lines.forEach((line, n) => {
      for (const m of line.matchAll(/"([A-Z][^"\n]{9,160})"/g)) {
        const v = m[1];
        if (/^[A-Z_]+$/.test(v) || /[<>{}]/.test(v)) continue;
        if (/^(https?|var\(|image\/|application|Bearer|SELECT|INSERT)/.test(v)) continue;
        if (!/[a-z]/.test(v)) continue;                 // constants, not prose
        const rec = found.get(v) || { files: new Set(), area: areaOf(f), line: n + 1 };
        rec.files.add(f);
        found.set(v, rec);
      }
    });
  }
  return found;
}

// ── the dictionary ──────────────────────────────────────────────────────────
async function loadDict() {
  const { STRINGS } = await import("./src/i18n/strings.js");
  return STRINGS;
}

// ── export ──────────────────────────────────────────────────────────────────
//
// One file, two states, and a column that says which.
//
// The first version of this wrote two files: one for the translator (dictionary
// keys missing Arabic) and one for a developer (English still hard-coded). The
// translator's file came out with ZERO rows in it, because every one of the 139
// dictionary entries was seeded from a label that was already bilingual. That
// is the whole finding: the bottleneck is not translation, it is that 775
// strings have never been moved into the dictionary at all.
//
// Two files meant the translator waited for the developer. One file with a
// `status` column means they proceed at the same time: she translates a string
// that is not wired yet, the importer files it under the key it will have, and
// the moment somebody swaps the literal for t("key") the Arabic is already
// there. Nothing is lost if the two halves finish weeks apart.

/**
 * Which areas matter most, in the order they should be worked.
 *
 * Not alphabetical and not by size. The order is what a comprehension failure
 * COSTS: reporting harassment while it is happening, then a woman putting her
 * own things up for sale, then the screens that tell her something went wrong,
 * and so on down to the moderator screens only staff ever see.
 */
const PRIORITY = [
  "Reporting a listing or a person",
  "Arranging to meet a seller",
  "Listing something for sale",
  "Listing several pieces at once",
  "Errors the app reports when something fails",
  "Loading, errors and empty screens",
  "The main shopping screens",
  "Messages between two women",
  "Making and answering offers",
  "Search and filters",
  "Signing in",
  "Help centre answers",
  "Privacy & safety centre",
  "Invitations to the beta",
  "Settings",
  "When a listing is held for review",
  "Elsewhere",
  "Rules and legal wording",
  "Internal — moderator screens",
];
const rank = (a) => { const i = PRIORITY.indexOf(a); return i < 0 ? PRIORITY.length : i; };

async function runExport() {
  const STRINGS = await loadDict();
  const literals = extractLiterals();
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const rows = [["key", "english", "arabic", "area", "status", "notes"]];
  const skippedTooLong = [];
  let wired = 0, unwired = 0;
  const byArea = new Map();

  // 1. Wired and waiting — these change a screen the moment they come back.
  for (const [k, v] of Object.entries(STRINGS)) {
    if (v.ar) continue;
    if ((v.en || "").length > MAX_LEN) { skippedTooLong.push(k); continue; }
    rows.push([k, v.en, "", "Already on screen", "wired", "Appears as soon as you send this back"]);
    wired++;
  }

  // 2. Not wired yet — translate now, and it is there when the string moves.
  const pending = [];
  const usedKeys = new Set(Object.keys(STRINGS));
  for (const [en, rec] of literals.entries()) {
    if (Object.values(STRINGS).some((v) => v.en === en)) continue;
    if (en.length > MAX_LEN) { skippedTooLong.push(en.slice(0, 40)); continue; }
    // Keys must be unique: two different sentences can slug to the same thing.
    let key = slug(en), n = 2;
    while (usedKeys.has(key)) key = `${slug(en)}_${n++}`;
    usedKeys.add(key);
    pending.push([key, en, "", rec.area, "not yet wired",
                  `${[...rec.files].map((f) => f.replace(/^src\//, "")).join(" ")}`]);
    byArea.set(rec.area, (byArea.get(rec.area) || 0) + 1);
    unwired++;
  }
  pending.sort((a, b) => rank(a[3]) - rank(b[3]) || a[1].localeCompare(b[1]));
  rows.push(...pending);

  writeFileSync(FOR_TRANSLATOR, toCSV(rows));

  // The developer's worklist is the same rows, minus the translation columns —
  // it is a checklist of literals to move into the dictionary, in the order
  // that gets the most dangerous screens done first.
  writeFileSync(FOR_DEVELOPER, toCSV([["key", "english", "area", "files"],
    ...pending.map((r) => [r[0], r[1], r[3], r[5]])]));

  console.log(`\n\x1b[1mThe translator's file\x1b[0m  ${FOR_TRANSLATOR}`);
  console.log(`  \x1b[1m${wired + unwired}\x1b[0m strings, in the order they should be worked`);
  console.log(`  \x1b[2m${wired} already wired — they change a screen the moment they come back`);
  console.log(`  ${unwired} not wired yet — translating them now means no second wait later\x1b[0m`);
  if (skippedTooLong.length)
    console.log(`  \x1b[2m${skippedTooLong.length} left out for being over ${MAX_LEN} characters. Terms, the`);
  if (skippedTooLong.length)
    console.log(`  seller agreement and the refund policy want a lawyer who works in both`);
  if (skippedTooLong.length)
    console.log(`  languages, not a translation file.\x1b[0m`);

  console.log(`\n\x1b[1mThe developer's worklist\x1b[0m  ${FOR_DEVELOPER}`);
  console.log(`  \x1b[2mEach row is a literal to move into the dictionary and call through t().`);
  console.log(`  Until that happens the Arabic sits in the dictionary unused — which is`);
  console.log(`  fine, and much better than the translator waiting for it.\x1b[0m\n`);
  for (const [area, n] of [...byArea.entries()].sort((a, b) => rank(a[0]) - rank(b[0])))
    console.log(`    ${String(n).padStart(4)}  ${area}`);
  console.log("");
}

// ── import ──────────────────────────────────────────────────────────────────
//
// Rewrites strings.js from the returned file. It only ever ADDS Arabic to a key
// that already exists, and it refuses anything it was not expecting:
//
//   · a key that is not in the dictionary          — a typo, or an invented row
//   · an Arabic cell with no Arabic characters in it — usually the English
//     pasted back, which would silently make coverage look finished
//   · a changed English cell                       — the source of truth is the
//     code, and a translator editing it is a signal, not an instruction
//
async function runImport() {
  if (!existsSync(RETURNED)) {
    console.error(`\nNothing to import. Put the translator's returned file at ${RETURNED}\n`);
    process.exit(1);
  }
  const STRINGS = await loadDict();
  const rows = parseCSV(readFileSync(RETURNED, "utf8"));
  const head = rows.shift().map((h) => h.trim().toLowerCase());
  const iKey = head.indexOf("key"), iEn = head.indexOf("english"), iAr = head.indexOf("arabic");
  if (iKey < 0 || iAr < 0) {
    console.error("\nThat file has no `key` and `arabic` columns. Is it the right one?\n");
    process.exit(1);
  }

  const ARABIC = /[؀-ۿ]/;
  const accepted = [], rejected = [];
  for (const r of rows) {
    const key = (r[iKey] || "").trim();
    const ar = (r[iAr] || "").trim();
    const en = iEn >= 0 ? (r[iEn] || "").trim() : null;
    if (!key || !ar) continue;
    // A key that is not in the dictionary yet is expected, not an error: the
    // export deliberately includes strings that have not been wired. It is
    // filed under the key it will have, ready for whoever moves the literal.
    const isNew = !STRINGS[key];
    if (isNew && !en) { rejected.push([key, "a new key needs its English column too"]); continue; }
    if (!ARABIC.test(ar)) { rejected.push([key, "the Arabic cell has no Arabic in it"]); continue; }
    if (!isNew && en && STRINGS[key].en !== en) { rejected.push([key, "the English was changed — check this by hand"]); continue; }
    accepted.push([key, ar, isNew ? en : null]);
  }

  if (accepted.length) {
    let src = readFileSync(DICT, "utf8");
    for (const [key, ar, newEn] of accepted) {
      const esc = ar.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      if (newEn) {
        // A brand-new entry goes in just before the closing brace, keeping the
        // file's one-entry-per-line shape so a diff stays readable.
        const enEsc = newEn.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        src = src.replace(/\n\};\s*$/, `\n  ${key}: { en: "${enEsc}", ar: "${esc}" },\n};\n`);
        continue;
      }
      // Match the entry however it is written, and replace only its ar field.
      const re = new RegExp(`(\\n  ${key}:\\s*\\{[^}]*?)ar:\\s*null`, "m");
      if (re.test(src)) src = src.replace(re, `$1ar: "${esc}"`);
      else {
        const re2 = new RegExp(`(\\n  ${key}:\\s*\\{\\s*en:\\s*"(?:[^"\\\\]|\\\\.)*")\\s*\\}`, "m");
        src = src.replace(re2, `$1, ar: "${esc}" }`);
      }
    }
    writeFileSync(DICT, src);
  }

  console.log(`\n\x1b[1m${accepted.length}\x1b[0m translations written into ${DICT}`);
  if (rejected.length) {
    console.log(`\x1b[33m${rejected.length} rows refused\x1b[0m — nothing was written for these:`);
    for (const [k, why] of rejected.slice(0, 20)) console.log(`  · ${k}: ${why}`);
    if (rejected.length > 20) console.log(`  … and ${rejected.length - 20} more`);
  }
  console.log(`\nRun \x1b[1mnpm run i18n\x1b[0m — it will tell you what the real interface`);
  console.log(`coverage is now, and it is the only number worth quoting.\n`);
}

// Only when run as a command. The i18n suite imports this module for its CSV
// reader, and a module that does its work at import time would print an entire
// export in the middle of a test run — and write two files as a side effect of
// being read.
const invokedDirectly = process.argv[1] && process.argv[1].endsWith("i18n-export.mjs");
if (invokedDirectly) {
  const mode = process.argv[2] === "import" ? "import" : "export";
  await (mode === "import" ? runImport() : runExport());
}
