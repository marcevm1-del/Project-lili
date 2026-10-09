// ─────────────────────────────────────────────────────────────────────────────
//  LANGUAGES
//
//  The UAE is one of the most linguistically mixed places on earth. Emiratis
//  are a minority of the residents; the largest communities are South Asian,
//  and English is the working lingua franca rather than anyone's first language.
//  A resale app that ships English and Arabic only is asking most of its
//  potential sellers to trade in their third language.
//
//  Ordered roughly by community size in the UAE.
//
//  `status` is deliberately honest and there are only three values:
//
//    "ready"   — real strings exist, written or professionally translated
//    "partial" — some strings exist, the rest fall back to English
//    "planned" — nothing translated. Shown in the picker so we learn what
//                people actually want, never presented as if it works.
//
//  Nothing here is machine-translated into "ready". A marketplace's listing
//  rules, refund terms and seller agreement are the last text on earth that
//  should be run through a translation engine and shipped unread.
// ─────────────────────────────────────────────────────────────────────────────

export const LANGUAGES = [
  {
    code: "en", name: "English", native: "English",
    dir: "ltr", numerals: "latn", status: "ready",
    note: "The working language of business and most of the app today.",
  },
  {
    // v2.9.1: moved from "ready" to "partial", which is what this file's own
    // scheme means by the word.
    //
    // "ready" says real strings exist. An audit counted roughly 150 bilingual
    // labels against 600+ English strings — under a quarter — and every one of
    // them is a heading. No body copy anywhere in the app is in Arabic: not the
    // Legal Centre (thirteen Arabic strings, all of them subtitles), not the
    // Help Centre answers, not the report reasons a woman picks from to say a
    // listing is counterfeit, not a single error message or empty state.
    //
    // The layout is mirrored properly now and the input, matching and money
    // layers are genuinely bilingual. The reading layer is not, and calling it
    // ready would be the fabricated claim this project has spent three releases
    // removing — in the language of the market it is launching into.
    code: "ar", name: "Arabic", native: "العربية",
    dir: "rtl", numerals: "latn", altNumerals: "arab", status: "partial",
    note: "Official language. Consumer terms must be available in Arabic, and " +
          "the Arabic text prevails over the English. The interface mirrors " +
          "right-to-left, search, prices and dates are Arabic, and about an " +
          "eighth of the wording is — measured by npm run i18n, not estimated. " +
          "The rest, including the terms, is being translated by a person " +
          "rather than a machine.",
  },
  {
    code: "hi", name: "Hindi", native: "हिन्दी",
    dir: "ltr", numerals: "latn", altNumerals: "deva", status: "planned",
  },
  {
    code: "ml", name: "Malayalam", native: "മലയാളം",
    dir: "ltr", numerals: "latn", altNumerals: "mlym", status: "planned",
    note: "The Keralite community in the UAE is large and long-established — " +
          "often underserved by apps that stop at Hindi.",
  },
  {
    code: "ur", name: "Urdu", native: "اردو",
    dir: "rtl", numerals: "latn", altNumerals: "arabext", status: "planned",
    note: "Right-to-left, like Arabic. Layout work is shared with Arabic.",
  },
  {
    code: "bn", name: "Bengali", native: "বাংলা",
    dir: "ltr", numerals: "latn", altNumerals: "beng", status: "planned",
  },
  {
    code: "tl", name: "Filipino", native: "Filipino",
    dir: "ltr", numerals: "latn", status: "planned",
    note: "Latin script, so the cheapest of these to add well.",
  },
  {
    code: "ta", name: "Tamil", native: "தமிழ்",
    dir: "ltr", numerals: "latn", altNumerals: "tamldec", status: "planned",
  },
  {
    code: "fa", name: "Persian", native: "فارسی",
    dir: "rtl", numerals: "latn", altNumerals: "arabext", status: "planned",
  },
  {
    code: "ru", name: "Russian", native: "Русский",
    dir: "ltr", numerals: "latn", status: "planned",
    note: "Significant resident and visitor population, and a strong luxury " +
          "resale audience specifically.",
  },
  {
    code: "ne", name: "Nepali", native: "नेपाली",
    dir: "ltr", numerals: "latn", altNumerals: "deva", status: "planned",
  },
  {
    code: "zh", name: "Chinese", native: "中文",
    dir: "ltr", numerals: "latn", status: "planned",
  },
];

export const DEFAULT_LANGUAGE = "en";

export const getLanguage = (code) =>
  LANGUAGES.find((l) => l.code === code) || LANGUAGES[0];

export const isRTL = (code) => getLanguage(code).dir === "rtl";

export const readyLanguages = () => LANGUAGES.filter((l) => l.status === "ready");
export const plannedLanguages = () => LANGUAGES.filter((l) => l.status === "planned");
/**
 * Languages with real strings in them — "ready" or "partial".
 *
 * The distinction that matters for offering a language is "is any of it
 * translated", not "is all of it". Arabic moved to "partial" in v2.9.1 and this
 * is what keeps it a language the app serves rather than one it only lists.
 */
export const servedLanguages = () => LANGUAGES.filter((l) => l.status !== "planned");

/** Best guess from the device, limited to languages we actually serve. */
export function guessLanguage() {
  try {
    const prefs = navigator.languages || [navigator.language || ""];
    for (const p of prefs) {
      const base = String(p).split("-")[0].toLowerCase();
      const hit = LANGUAGES.find((l) => l.code === base);
      // v2.9.1: this was `status === "ready"`, and reclassifying Arabic as
      // "partial" therefore sent every Arabic phone to English — losing the
      // mirrored layout and Arabic search, which DO work, to protect her from
      // untranslated body copy, which she would meet either way.
      //
      // The honest-fallback rule below is unchanged and is what it was written
      // for: "planned" means nothing is translated at all, and a Malayalam
      // phone still gets English rather than a shell.
      if (hit && hit.status !== "planned") return hit.code;
    }
    // Someone whose phone is in Malayalam gets English rather than a broken
    // half-translation — but we record the preference so it can be prioritised.
    for (const p of prefs) {
      const base = String(p).split("-")[0].toLowerCase();
      if (LANGUAGES.some((l) => l.code === base)) return DEFAULT_LANGUAGE;
    }
  } catch { /* fall through */ }
  return DEFAULT_LANGUAGE;
}

/**
 * What a language actually costs to add properly. Useful when deciding the
 * order — the answer is rarely "whichever has the most speakers".
 */
export const TRANSLATION_EFFORT = {
  ltrLatinScript: ["tl", "ru"],
  ltrOwnScript: ["hi", "ml", "bn", "ta", "ne", "zh"],
  rtlFullMirror: ["ur", "fa"],
  notes: [
    "RTL languages need the layout mirrored, not just the strings swapped. " +
      "Arabic already forced that work, so Urdu and Persian are cheaper than " +
      "they look.",
    "Legal text — Platform Terms, Seller Agreement, Privacy Notice — must be " +
      "professionally translated. Machine output is not adequate for a document " +
      "a regulator may read.",
    "Interface strings can start machine-assisted with human review. Legal " +
      "text cannot.",
  ],
};
