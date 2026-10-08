import { fold, tokens, fuzzyIncludes } from "./text.js";

// ─────────────────────────────────────────────────────────────────────────────
//  ON-DEVICE SEARCH
//
//  The server's `lili_search` is the real one and is called first. This is the
//  fallback, and it exists because a Dubai shopper on the metro loses signal
//  for ninety seconds at a time. The old fallback matched a raw substring
//  against `title` and `brand`; this one applies the same three rules the
//  server does, so the two disagree in coverage but never in meaning.
//
//  ── the garment vocabulary
//
//  `lili_search_terms` in the database holds the bridge between the two
//  languages: عباية ↔ abaya, شنطة ↔ bag, and the misspellings people actually
//  type (3abaya, galabeya, kaftaan). No stemmer knows those are the same word;
//  somebody has to write them down.
//
//  The list below is a mirror of that table, and a mirror drifts. So it is a
//  *seed*, not the source: `hydrate()` replaces it with the server's copy the
//  first time the app can reach the server, and the seed is only what a phone
//  searches with before it has ever been online. The server table stays the one
//  place a term is added.
// ─────────────────────────────────────────────────────────────────────────────

// Mirrors public.lili_search_terms as of 2026-08-30. Kept small on purpose:
// every row here is a claim that two words mean the same thing to a shopper,
// and a wrong claim shows up as a baffling search result.
export const SEED_TERMS = [
  { english: "abaya",     arabic: "عباية",   aliases: ["abayah", "abbaya", "abaia", "3abaya"] },
  { english: "jalabiya",  arabic: "جلابية",  aliases: ["jalabiyah", "galabeya", "jellabiya"] },
  { english: "kaftan",    arabic: "قفطان",   aliases: ["caftan", "kaftaan"] },
  { english: "hijab",     arabic: "حجاب",    aliases: ["hijaab", "scarf", "shayla", "شيلة"] },
  { english: "dress",     arabic: "فستان",   aliases: ["dresses", "gown", "فساتين"] },
  { english: "bag",       arabic: "حقيبة",   aliases: ["bags", "handbag", "purse", "حقائب", "شنطة"] },
  { english: "shoes",     arabic: "أحذية",   aliases: ["shoe", "heels", "sandals", "حذاء", "كعب"] },
  { english: "jacket",    arabic: "جاكيت",   aliases: ["jackets", "coat", "blazer", "معطف"] },
  { english: "skirt",     arabic: "تنورة",   aliases: ["skirts", "تنانير"] },
  { english: "top",       arabic: "توب",     aliases: ["tops", "blouse", "shirt", "بلوزة", "قميص"] },
  { english: "trousers",  arabic: "بنطلون",  aliases: ["pants", "jeans", "بناطيل", "جينز"] },
  { english: "jewellery", arabic: "مجوهرات", aliases: ["jewelry", "necklace", "earrings", "ring", "خاتم", "قلادة"] },
  { english: "watch",     arabic: "ساعة",    aliases: ["watches", "ساعات"] },
  { english: "sunglasses",arabic: "نظارات",  aliases: ["glasses", "shades", "نظارة"] },
  { english: "vintage",   arabic: "فينتاج",  aliases: ["retro", "قديم"] },
  { english: "luxury",    arabic: "فاخر",    aliases: ["designer", "فخم"] },
  { english: "new",       arabic: "جديد",    aliases: ["brandnew", "bnwt", "unworn", "جديدة"] },
  { english: "worn once", arabic: "لبسة وحدة", aliases: ["barely worn", "like new", "شبه جديد"] },
];

let TERMS = SEED_TERMS;
let index = null;

/** Replace the built-in mirror with the server's list. */
export function hydrate(rows) {
  if (!Array.isArray(rows) || !rows.length) return false;
  TERMS = rows;
  index = null;
  return true;
}

export const termCount = () => TERMS.length;

/**
 * word → every other word that means the same thing.
 *
 * Built once, lazily, and thrown away when the vocabulary is replaced. Each
 * entry maps a folded token to the folded tokens of its whole synonym group,
 * itself excluded — so expanding a query never re-adds the word already in it.
 */
function synonymIndex() {
  if (index) return index;
  index = new Map();
  for (const row of TERMS) {
    const group = [row.english, row.arabic, ...(row.aliases || [])]
      .filter(Boolean).flatMap((t) => tokens(t));
    const uniq = [...new Set(group)];
    for (const w of uniq) {
      const others = uniq.filter((o) => o !== w);
      if (!others.length) continue;
      index.set(w, [...new Set([...(index.get(w) || []), ...others])]);
    }
  }
  return index;
}

/** The words a query should also look for, and which language they came from. */
export function expand(queryTokens) {
  const idx = synonymIndex();
  const out = [];
  for (const t of queryTokens) for (const s of idx.get(t) || []) if (!queryTokens.includes(s)) out.push(s);
  return [...new Set(out)];
}

// Where a match counts for most. A brand hit is the strongest signal a resale
// shopper gives — she types "Bottega" because she wants Bottega — and a hit
// buried in the description is the weakest, because descriptions mention
// everything ("perfect with jeans" is not a listing for jeans).
const FIELD_WEIGHT = { title: 6, titleAr: 6, brand: 7, category: 4, subtitle: 3, shop: 3, condition: 2, desc: 1 };

const fieldsOf = (item, shopName) => ({
  title: item.title, titleAr: item.titleAr, brand: item.brand,
  category: item.category, subtitle: item.subtitle,
  shop: shopName, condition: item.condition, desc: item.desc,
});

/**
 * Score one listing against one query.
 *
 * Returns null when a query word is missing from the listing entirely — every
 * word must land somewhere. That is the AND a shopper expects: "chanel bag"
 * should not return every bag and every Chanel piece, which is what OR does and
 * what makes a small catalogue feel like it is not listening.
 *
 * `kind` says how the last, weakest link was made, and it is shown to her:
 *   exact      — her word is in the listing
 *   translated — her word reached it through the other language
 *   close      — near enough that we think she mistyped
 */
export function scoreItem(item, query, shopName = "") {
  const qt = tokens(query);
  if (!qt.length) return null;

  const fields = fieldsOf(item, shopName);
  const toks = {};
  for (const [k, v] of Object.entries(fields)) toks[k] = v ? tokens(v) : [];

  const idx = synonymIndex();
  let score = 0;
  let kind = "exact";

  for (const word of qt) {
    let best = null;      // { weight, kind }
    for (const [field, weight] of Object.entries(FIELD_WEIGHT)) {
      const hit = fuzzyIncludes(toks[field] || [], word);
      if (hit && (!best || weight > best.weight)) best = { weight, kind: hit };
    }
    if (!best) {
      // not present as written — try the other language
      for (const syn of idx.get(word) || []) {
        for (const [field, weight] of Object.entries(FIELD_WEIGHT)) {
          const hit = fuzzyIncludes(toks[field] || [], syn);
          // a translated hit is worth less than the shopper's own word
          if (hit && (!best || weight * 0.7 > best.weight)) best = { weight: weight * 0.7, kind: "translated" };
        }
      }
    }
    if (!best) return null;                       // this word landed nowhere
    score += best.weight;
    if (best.kind !== "exact" && kind === "exact") kind = best.kind;
    else if (best.kind === "close") kind = "close";
  }

  // A short title that is almost entirely the query is a better answer than a
  // long one that happens to contain it. Small nudge, not a reordering force.
  const titleLen = (toks.title || []).length || 1;
  score += Math.min(2, qt.length / titleLen);
  return { score, kind };
}

/**
 * Search a list of listings on the device.
 *
 * `shopName` is resolved through `shopFor` rather than passed in, because three
 * of the four old call sites forgot to search the shop name at all and the
 * fourth searched only the shop name.
 */
export function searchLocal(items, query, { shopFor = () => "", limit = 60 } = {}) {
  if (!fold(query)) return [];
  const out = [];
  for (const item of items || []) {
    const r = scoreItem(item, query, shopFor(item) || "");
    if (r) out.push({ ...item, _score: r.score, matchKind: item.matchKind || r.kind });
  }
  out.sort((a, b) => b._score - a._score);
  return out.slice(0, limit);
}

// ── zero-result recovery ────────────────────────────────────────────────────
//
// Baymard's 2026 search benchmark (170+ sites, 10,000+ ratings) puts 56% of
// commerce search experiences at "mediocre or worse", and app search worst of
// the three at 64%. The failure it measures is not the ranking — it is the
// dead end: a query that returns nothing and offers nothing.
//
// So when a search finds nothing, we do not stop at "No results". We say what
// went wrong in terms of her own words, and hand her something to tap.

/**
 * Which of her words is the one that killed the search?
 *
 * Dropping each word in turn and re-running is O(words × catalogue) and the
 * catalogue is small. The answer is worth it: "no pieces match **beige**, but
 * there are 4 for *chanel bag*" is a recovery; "no results" is a wall.
 */
export function diagnose(items, query, opts = {}) {
  const qt = tokens(query);
  if (qt.length < 2) return null;
  for (let i = 0; i < qt.length; i++) {
    const without = qt.filter((_, j) => j !== i);
    const hits = searchLocal(items, without.join(" "), opts);
    if (hits.length) return { drop: qt[i], keep: without.join(" "), count: hits.length };
  }
  return null;
}

/**
 * Real alternatives, drawn from what is actually in stock.
 *
 * Never a hardcoded list. A suggestion for a brand nobody is selling is the
 * same dead end one tap further along.
 */
export function suggestions(items, query, max = 6) {
  const qt = tokens(query);
  const counts = new Map();
  for (const item of items || []) {
    for (const v of [item.brand, item.category].filter(Boolean)) {
      counts.set(v, (counts.get(v) || 0) + 1);
    }
  }
  const scored = [...counts.entries()].map(([label, n]) => {
    // prefer something that at least shares a few letters with what she typed
    const lt = tokens(label);
    const near = qt.some((w) => lt.some((l) => l.startsWith(w.slice(0, 3)) || w.startsWith(l.slice(0, 3))));
    return { label, n, near };
  });
  scored.sort((a, b) => (b.near - a.near) || (b.n - a.n));
  return scored.slice(0, max).map((s) => s.label);
}
