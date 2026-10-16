import { STRINGS } from "./strings.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Coverage, and both languages at once
//
//  Moved out of t.js so the app's first chunk carries only the English half of
//  the dictionary (see i18n-split.mjs). These read strings.js, both languages
//  side by side, and only the suites call them.
// ─────────────────────────────────────────────────────────────────────────────

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

