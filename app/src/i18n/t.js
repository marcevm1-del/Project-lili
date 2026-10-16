import { EN } from "./strings.en.js";
import { getDir, onDirChange, refreshDir } from "./direction.js";

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

// ── the Arabic half, on demand ───────────────────────────────────────────────
// strings.js holds both languages and is the source, but the app reads two
// files generated from it (i18n-split.mjs): English here, in the first chunk,
// and Arabic loaded only when Arabic is chosen. Until it arrives t() answers in
// English, the same fallback as a key with no Arabic yet, and the tree is told
// to re-render the moment it lands.
let AR = null;
let loading = null;
export function loadArabic() {
  if (AR) return Promise.resolve(AR);
  if (!loading) {
    loading = import("./strings.ar.js")
      .then((m) => { AR = m.AR; return AR; })
      .catch((e) => { loading = null; throw e; });
  }
  return loading;
}
export const arabicLoaded = () => !!AR;

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
  const en = EN[key];
  if (en === undefined) {
    // A missing key is a bug in the caller, not in the translation. Say which
    // key, in development, and render something readable rather than blank.
    if (typeof console !== "undefined" && console.warn) console.warn("i18n: no string for", key);
    return key;
  }
  let out = (lang === "ar" && AR && AR[key]) || en || "";
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

// coverage(), interfaceCoverage() and both() live in i18n/coverage.js: they
// need both languages at once, and only the suites call them.

// Direction and language move together — `setDir` is what the picker calls, and
// it is the only thing that publishes a change, so this keeps them in step
// without a second subscription for every component.
if (typeof window !== "undefined") {
  onDirChange(() => {
    setLang(getDir() === "rtl" ? "ar" : "en");
    // switched to Arabic by any route before it was loaded: load it, then
    // re-render once more so the screen changes language as well as direction
    if (lang === "ar" && !AR) loadArabic().then(refreshDir).catch(() => {});
  });
}
