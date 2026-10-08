// ─────────────────────────────────────────────────────────────────────────────
//  POSTEL'S LAW — "be liberal in what you accept"
//
//  The app rejected ١٩٩٦. An Arabic keyboard is the default on a large share of
//  phones in this market, and every numeric field in the app was built on
//  /^\d{4}$/ and Number(), both of which understand Latin digits only. A woman
//  in Dubai typing her year of birth on her own keyboard was told she'd got it
//  wrong.
//
//  That is not an edge case for a bilingual app targeting the GCC. It is the
//  main case for some of its users.
//
//  Related: TESLER'S LAW — complexity is conserved, so someone absorbs it.
//  Either the user retypes in the "right" digits, or the system converts them.
//  These functions move that work to the system, where it belongs.
// ─────────────────────────────────────────────────────────────────────────────

// Every numeral system spoken in the UAE, not only Arabic. A Malayali seller
// and a Bengali buyer typing their own digits both mean 12,900.
//
// Each entry is the code point of that script's ZERO. Digits 1-9 follow
// consecutively in all of them, which is what makes this table so short.
const NUMERAL_ZEROS = {
  arab:    0x0660,  // Arabic-Indic    (Arabic)
  arabext: 0x06f0,  // Extended Arabic (Persian, Urdu)
  deva:    0x0966,  // Devanagari      (Hindi, Nepali, Marathi)
  beng:    0x09e6,  // Bengali
  guru:    0x0a66,  // Gurmukhi        (Punjabi)
  gujr:    0x0ae6,  // Gujarati
  orya:    0x0b66,  // Odia
  tamldec: 0x0be6,  // Tamil
  telu:    0x0c66,  // Telugu
  knda:    0x0ce6,  // Kannada
  mlym:    0x0d66,  // Malayalam
  sinh:    0x0de6,  // Sinhala
  thai:    0x0e50,  // Thai
};

const DIGIT_MAP = {};
for (const zero of Object.values(NUMERAL_ZEROS)) {
  for (let i = 0; i <= 9; i++) DIGIT_MAP[String.fromCharCode(zero + i)] = String(i);
}

// Matches a digit in any script above. Built from the table so adding a
// numeral system is one line, not two places that can drift apart.
const NON_LATIN_DIGIT = new RegExp(
  "[" + Object.values(NUMERAL_ZEROS)
    .map((z) => "\\u" + z.toString(16).padStart(4, "0") +
                "-\\u" + (z + 9).toString(16).padStart(4, "0"))
    .join("") + "]", "g");

// Invisible characters that arrive with a paste and break every comparison.
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Any script's digits → Latin. Everything else untouched. */
export function normaliseDigits(input = "") {
  return String(input).replace(NON_LATIN_DIGIT, (d) => DIGIT_MAP[d] ?? d);
}

/** Strip the characters people paste without meaning to. */
export const clean = (input = "") =>
  String(input).replace(INVISIBLE, "").replace(/\s+/g, " ").trim();

/**
 * A price, however it was typed. Accepts Arabic-Indic digits, thousands
 * separators (Latin comma, Arabic ٬, apostrophe, space), the Arabic decimal
 * mark ٫, and a currency word or symbol anywhere in the string.
 *
 * Returns null rather than NaN, so callers must handle "not a number"
 * deliberately instead of letting NaN leak into a listing.
 */
export function parsePrice(input) {
  if (input === null || input === undefined) return null;
  let s = normaliseDigits(clean(input));
  s = s.replace(/aed|dhs?|درهم|د\.إ|\$|€|£/gi, "");   // currency words and symbols
  s = s.replace(/\u066C|,|'|\u00A0|\s/g, "");          // thousands separators
  s = s.replace(/\u066B/g, ".");                       // Arabic decimal separator
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** A four-digit year in any script. Returns null if it isn't one. */
export function parseYear(input) {
  const s = normaliseDigits(clean(input)).replace(/\D/g, "");
  if (s.length !== 4) return null;
  const y = Number(s);
  const now = new Date().getFullYear();
  return y >= now - 120 && y <= now ? y : null;
}

/**
 * A UAE mobile number, however it was typed: 0501234567, 501234567,
 * +971 50 123 4567, 00971501234567, with dashes, spaces or Arabic digits.
 * Returns E.164, or null.
 */
export function parsePhoneAE(input) {
  let s = normaliseDigits(clean(input)).replace(/[\s\-()]/g, "");
  s = s.replace(/^00/, "+");
  if (s.startsWith("+971")) s = s.slice(4);
  else if (s.startsWith("971")) s = s.slice(3);
  else if (s.startsWith("0")) s = s.slice(1);
  if (!/^5\d{8}$/.test(s)) return null;      // UAE mobiles are 5x + 7 digits
  return `+971${s}`;
}

/** Display formatting — grouped, and in the reader's own numerals. */
export function formatPrice(amount, { locale = "en", currency = "AED" } = {}) {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return "";
  const n = Number(amount);
  const grouped = n.toLocaleString(locale === "ar" ? "ar-AE" : "en-AE", {
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  });
  return locale === "ar" ? `${grouped} ${currency}` : `${currency} ${grouped}`;
}

/**
 * Names and free text: collapse whitespace, strip invisibles, cap length.
 * Deliberately does NOT strip punctuation or non-Latin script — a name is
 * whatever its owner says it is.
 */
export const normaliseText = (input = "", max = 200) => clean(input).slice(0, max);

/** Emails: trim and lowercase the domain only. The local part is case-sensitive. */
export function normaliseEmail(input = "") {
  const s = clean(input).replace(INVISIBLE, "");
  const at = s.lastIndexOf("@");
  if (at < 1) return s;
  return s.slice(0, at) + "@" + s.slice(at + 1).toLowerCase();
}
