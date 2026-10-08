// ─────────────────────────────────────────────────────────────────────────────
//  TEXT NORMALISATION FOR SEARCH
//
//  Every search surface in the app used `String.includes` on a `.toLowerCase()`
//  copy. Four surfaces, four different field lists, one shared failure: a
//  woman typing عباية found nothing, because the only field carrying Arabic
//  (`titleAr`) was never searched; a woman typing "Hermes" found nothing,
//  because the listing says "Hermès"; and "chanel bag" found nothing anywhere
//  in the catalogue, because substring matching needs the words adjacent and
//  in that order.
//
//  The database already solves this properly — `lili_search` folds accents
//  through `unaccent`, bridges the two languages through a curated garment
//  vocabulary, and tolerates spelling. That RPC is wired in now. This file is
//  what happens when the server cannot be reached: the same rules, done on the
//  device, so an offline search is narrower but not wrong.
//
//  ── why these particular Arabic rules
//
//  Arabic is written with several characters that a reader treats as the same
//  letter and a keyboard produces inconsistently. The retrieval literature is
//  unambiguous about the fix: strip the diacritics and fold the alef-hamza
//  variants before matching. Hammo et al. (Springer, Information Retrieval
//  2008, "Towards enhancing retrieval effectiveness of search engines for
//  diacritisized Arabic documents") report that queries in full diacritised
//  form return *zero* matches for many terms, and that folding آ أ إ to ا alone
//  collapses the index by ~22.6% — that collapse is the measure of how many
//  spellings of the same word were being kept apart.
//
//  So: tashkeel removed, tatweel removed, alef family folded, ya/alef-maqsura
//  folded, ta-marbuta folded to ha, hamza carriers folded, Arabic-Indic digits
//  mapped to ASCII. Nothing here is clever; all of it is standard, and all of
//  it is the difference between finding a listing and not.
//
//  ── what is deliberately NOT here
//
//  No stemming. Arabic root extraction is a real win in the literature (the
//  same paper reports an 88.2% index reduction) and a real risk in a catalogue
//  of eighty pieces: an over-eager stemmer merges words a shopper meant to keep
//  apart, and with this little inventory a single wrong merge is a visibly
//  wrong page. The server can carry that when the catalogue justifies it.
// ─────────────────────────────────────────────────────────────────────────────

// Tashkeel (U+064B–U+0652), the hamza and maddah marks (U+0653–U+0655),
// superscript alef (U+0670), Quranic marks (U+06D6–U+06ED) and tatweel
// (U+0640, a purely typographic stretch).
//
// U+0653–U+0655 matter more than they look. NFD, applied a few lines below,
// decomposes أ into ا + hamza-above, ؤ into و + hamza-above and ئ into ي +
// hamza-above — so once those marks are stripped, the alef family has already
// folded to one letter and the hamza carriers to theirs. The first version of
// this file left them out and folded the *precomposed* characters instead,
// which NFD had already taken apart: أحذية and احذية stayed two different
// words, which is the exact failure the fold exists to prevent.
const ARABIC_MARKS = /[\u064B-\u0655\u0670\u06D6-\u06ED\u0640]/g;

const ARABIC_FOLD = [
  [/[آأإٱ]/g, "ا"], // آ أ إ ٱ → ا
  [/ى/g, "ي"],                     // ى → ي
  [/ة/g, "ه"],                     // ة → ه
  [/ؤ/g, "و"],                     // ؤ → و
  [/ئ/g, "ي"],                     // ئ → ي
];

// ٠١٢٣٤٥٦٧٨٩ and ۰۱۲۳۴۵۶۷۸۹ → 0-9. A shopper filtering to size ٣٨ and a
// listing that says 38 are looking for each other.
const arabicDigits = (s) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
                             .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

/**
 * One spelling for one word, in either language.
 *
 * "Hermès" → "hermes". "عَبَايَة" → "عبايه". "٣٨" → "38".
 *
 * NFD splits a letter from its accent so the accent can be dropped; the
 * combining range U+0300–U+036F is the Latin one, and stripping it is what
 * makes é and e the same key. This mirrors what `unaccent` does server-side,
 * which is the point — the same query must not mean two things depending on
 * whether the network was up.
 */
export function fold(input) {
  let s = String(input == null ? "" : input);
  s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  s = s.replace(ARABIC_MARKS, "");
  for (const [re, to] of ARABIC_FOLD) s = s.replace(re, to);
  s = arabicDigits(s);
  return s.toLowerCase().trim();
}

/**
 * Words, in a form that can be compared.
 *
 * Splitting on anything that is not a letter or a digit keeps Arabic and Latin
 * together in one rule and drops the punctuation people type without thinking
 * — "chanel, classic-flap!" is three words either way.
 */
export function tokens(input) {
  const folded = fold(input);
  if (!folded) return [];
  return folded.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * Edit distance, capped.
 *
 * The cap matters more than the algorithm. A full Levenshtein over every token
 * of every listing is fine at eighty pieces and wasteful at eight thousand;
 * bailing out as soon as the best possible remaining distance exceeds `max`
 * keeps it proportional to the tolerance rather than to the catalogue.
 */
export function editDistance(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}

/**
 * How much spelling tolerance a word of this length has earned.
 *
 * None below four characters: at three letters almost everything is within one
 * edit of everything else, and "bag" matching "bar" is not tolerance, it is
 * noise. One edit to six, two from seven — long words are where real typing
 * mistakes live, and where a wrong match is least likely.
 */
export const tolerance = (word) => (word.length < 4 ? 0 : word.length < 7 ? 1 : 2);

/** Does `needle` appear in `hay` as a whole word, allowing for typing slips? */
export function fuzzyIncludes(hayTokens, needle) {
  const tol = tolerance(needle);
  for (const t of hayTokens) {
    if (t === needle) return "exact";
    if (t.startsWith(needle) && needle.length >= 3) return "exact"; // "abay" → "abaya"
    if (tol && editDistance(t, needle, tol) <= tol) return "close";
  }
  return null;
}
