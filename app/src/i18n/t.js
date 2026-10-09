import { STRINGS } from "./strings.js";
import { getDir, onDirChange } from "./direction.js";

// ─────────────────────────────────────────────────────────────────────────────
//  ONE LANGUAGE AT A TIME
//
//  Until this file there was no translation layer at all. `languages.js` is a
//  metadata table with no strings in it; `applyLanguage` set `dir` and could not
//  change a single word. So the app's answer to being bilingual was to print
//  both languages into the same label:
//
//      "Filters" + " · " + "\u0641\u0644\u062a\u0631"      (as one literal, in one label)
//
//  118 of them. That is not a bilingual app, it is one interface carrying two
//  interfaces' worth of text, and it is worse for both readers: an English
//  speaker reads past Arabic she cannot use on every button, and an Arabic
//  speaker reads past English to find her half — in a smaller font, second,
//  after the dot.
//
//  ── the design
//
//  A flat dictionary keyed by a slug of the English, because that is what the
//  strings already were. `t("filters")` returns the language in force and falls
//  back to English when a key has no Arabic yet, which is the honest failure:
//  she sees a word she may not want rather than a blank or a key name.
//
//  ── what this is NOT for
//
//  Terms, the seller agreement, refund policy and the report reasons a decision
//  is made on. `languages.js` says it plainly and it is right: "A marketplace's
//  listing rules, refund terms and seller agreement are the last text on earth
//  that should be run through a translation engine and shipped unread." Those
//  keys exist here with `ar: null`, so `coverage()` counts them as missing and
//  nobody can quietly mark the job done.
// ─────────────────────────────────────────────────────────────────────────────

let lang = "en";

export function setLang(code) {
  lang = code === "ar" ? "ar" : "en";
  return lang;
}
export const getLang = () => lang;

/**
 * Translate.
 *
 * `vars` interpolates {name}-style placeholders, so a sentence with a number in
 * it stays one string in the dictionary rather than three fragments a
 * translator has to reassemble — word order differs between the two languages
 * and fragments cannot express that.
 */
export function t(key, vars) {
  const entry = STRINGS[key];
  if (!entry) {
    // A missing key is a bug in the caller, not in the translation. Say which
    // key, in development, and render something readable rather than blank.
    if (typeof console !== "undefined" && console.warn) console.warn("i18n: no string for", key);
    return key;
  }
  let out = (lang === "ar" && entry.ar) || entry.en || "";
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

/** Both languages, deliberately — for the two or three places that want it. */
export const both = (key) => {
  const e = STRINGS[key];
  if (!e) return key;
  return e.ar ? `${e.en} · ${e.ar}` : e.en;
};

/**
 * How much of the DICTIONARY exists in a language.
 *
 * Read the name carefully, because the obvious misreading is the dangerous one.
 * This measures the dictionary, and the dictionary is not the interface: it was
 * seeded from the 128 labels that were ALREADY bilingual, so it reports 100%
 * for Arabic the moment it is created and will keep reporting 100% while most
 * of the app is still English.
 *
 * A number that is 100% on day one and means nothing is exactly the kind of
 * green tick this project keeps deleting. `interfaceCoverage()` below is the
 * one that tells the truth, and it is the one the suite asserts on.
 */
export function coverage(code = "ar") {
  const keys = Object.keys(STRINGS);
  const done = keys.filter((k) => STRINGS[k][code]);
  return { total: keys.length, translated: done.length,
           pct: keys.length ? Math.round((100 * done.length) / keys.length) : 0,
           missing: keys.filter((k) => !STRINGS[k][code]) };
}

/**
 * How much of what she actually reads exists in a language.
 *
 * Counts translated strings against every user-visible string in the source,
 * translated or not — the denominator the audit used when it found ~150
 * bilingual labels against 600+ English ones. The count is passed in by the
 * caller (the test walks the source; the app does not need to) so this module
 * stays free of filesystem access.
 */
export function interfaceCoverage(englishOnlyCount, code = "ar") {
  const c = coverage(code);
  const total = c.translated + Math.max(0, englishOnlyCount);
  return { translated: c.translated, untranslated: Math.max(0, englishOnlyCount), total,
           pct: total ? Math.round((100 * c.translated) / total) : 0 };
}

// Direction and language move together — `setDir` is what the picker calls, and
// it is the only thing that publishes a change, so this keeps them in step
// without a second subscription for every component.
if (typeof window !== "undefined") {
  onDirChange(() => setLang(getDir() === "rtl" ? "ar" : "en"));
}
