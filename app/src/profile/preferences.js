// ─────────────────────────────────────────────────────────────────────────────
//  MY PREFERENCES
//
//  What she wears and likes, kept on this phone and nowhere else: sizes for
//  each kind of piece, styles, favourite brands, the conditions she'll accept,
//  and the most she wants to spend. lili's servers never receive any of it;
//  it is stored under TASTE_KEY next to the rest of her taste, and account
//  deletion clears it (LegalCenter DeleteView).
//
//  ── why sizes are per kind of piece
//
//  Until v2.12 "your sizes" was one list mixing S with 38, and the filter
//  compared every listing against all of it — so a woman who wears shoes in 38
//  saw size-38 dresses as "her size". A size only means something next to the
//  kind of piece it's on, so each group carries the listing categories it
//  covers, and a listing is compared only with the group it belongs to.
//
//  Pure: no React, no storage. The screen is ProfilePreferences.jsx.
// ─────────────────────────────────────────────────────────────────────────────

const LETTERS = ["XS", "S", "M", "L", "XL"];

export const SIZE_GROUPS = [
  { key: "tops",    label: "Tops & jackets",     labelAr: "التوبات والجاكيتات",
    categories: ["Tops", "Jackets"],   options: LETTERS },
  { key: "dresses", label: "Dresses & abayas",   labelAr: "الفساتين والعبايات",
    categories: ["Dresses", "Abayas"], options: LETTERS },
  { key: "bottoms", label: "Trousers & skirts",  labelAr: "البناطيل والتنانير",
    categories: ["Bottoms", "Skirts"], options: LETTERS },
  { key: "shoes",   label: "Shoes (EU)",         labelAr: "الأحذية",
    categories: ["Shoes"], options: ["35", "36", "37", "38", "39", "40", "41", "42"] },
];

/** Bags, accessories and jewellery are one size and always pass. */
export const ONE_SIZE_NOTE = "Bags, accessories and jewellery are one size, so they always show.";

export const STYLE_OPTIONS = ["Luxury", "Dresses", "Bags", "Abayas", "Shoes", "Vintage"];

/** Highest-first, so "accept Good" means Good or better. */
export const CONDITION_LADDER = ["Like New", "Excellent", "Good", "Fair"];

export const EMPTY_PREFERENCES = Object.freeze({
  categories: [], sizeBy: {}, brands: [], minCondition: "", maxPrice: null,
});

const isShoeSize = (s) => /^\d{2}(\.5)?$/.test(String(s || ""));

/** The size group a listing belongs to, or null if it's one size / unknown. */
export function groupFor(item) {
  if (!item) return null;
  const size = String(item.size || "");
  if (!size || size === "OS") return null;
  const byCat = SIZE_GROUPS.find((g) => g.categories.includes(item.category));
  if (byCat) return byCat;
  // Categories like "Luxury" hold anything; read the label instead.
  if (isShoeSize(size)) return SIZE_GROUPS.find((g) => g.key === "shoes");
  return null;
}

/**
 * Brings any stored taste up to the current shape. The v2.11 shape was
 * { categories, sizes: ["S","38"] }: letters go to every clothing group and
 * numbers to shoes, which is what that list meant in practice.
 */
export function normalise(taste) {
  const t = taste && typeof taste === "object" ? taste : {};
  let sizeBy = t.sizeBy && typeof t.sizeBy === "object" ? { ...t.sizeBy } : null;
  if (!sizeBy) {
    sizeBy = {};
    const flat = Array.isArray(t.sizes) ? t.sizes.map(String) : [];
    for (const g of SIZE_GROUPS) {
      const mine = flat.filter((s) => g.options.includes(s));
      if (mine.length) sizeBy[g.key] = mine;
    }
  }
  for (const g of SIZE_GROUPS) {
    const v = Array.isArray(sizeBy[g.key]) ? sizeBy[g.key].filter((s) => g.options.includes(String(s))) : [];
    if (v.length) sizeBy[g.key] = v; else delete sizeBy[g.key];
  }
  const maxPrice = Number(t.maxPrice);
  return {
    categories: Array.isArray(t.categories) ? t.categories.filter((c) => STYLE_OPTIONS.includes(c)) : [],
    sizeBy,
    brands: Array.isArray(t.brands) ? [...new Set(t.brands.map(String))].slice(0, 30) : [],
    minCondition: CONDITION_LADDER.includes(t.minCondition) ? t.minCondition : "",
    maxPrice: Number.isFinite(maxPrice) && maxPrice > 0 ? Math.round(maxPrice) : null,
    // Kept so anything still reading the old flat list sees the same sizes.
    sizes: [...new Set(Object.values(sizeBy).flat())],
    at: t.at || null,
  };
}

export const hasSizes = (p) => Object.values((p && p.sizeBy) || {}).some((v) => v && v.length);

export const isEmpty = (p) => {
  const n = normalise(p);
  return !n.categories.length && !hasSizes(n) && !n.brands.length && !n.minCondition && !n.maxPrice;
};

/**
 * Does this listing fit her? One-size pieces always do, and so does any kind
 * of piece she hasn't given a size for: an empty group narrows nothing.
 */
export function fitsMySizes(item, sizeBy) {
  const g = groupFor(item);
  if (!g) return true;
  const mine = (sizeBy && sizeBy[g.key]) || [];
  return !mine.length || mine.map(String).includes(String(item.size));
}

export function meetsCondition(item, minCondition) {
  if (!minCondition) return true;
  const need = CONDITION_LADDER.indexOf(minCondition);
  const has = CONDITION_LADDER.indexOf(item && item.condition);
  return has !== -1 && has <= need;
}

export function withinBudget(item, maxPrice) {
  if (!maxPrice) return true;
  const price = typeof (item && item.price) === "number" ? item.price : Number(item && item.price);
  return Number.isFinite(price) && price <= maxPrice;
}

/** The one-tap "For me" filter on the feed: sizes, condition and budget she set. */
export function fitsMe(item, prefs) {
  const p = normalise(prefs);
  return fitsMySizes(item, p.sizeBy) && meetsCondition(item, p.minCondition) && withinBudget(item, p.maxPrice);
}

/** Short summary for the chip and the profile row, e.g. "S · 38 · under AED 2,000". */
export function summary(prefs) {
  const p = normalise(prefs);
  const parts = [];
  const letters = [...new Set(["tops", "dresses", "bottoms"].flatMap((k) => p.sizeBy[k] || []))];
  if (letters.length) parts.push(letters.join("/"));
  if (p.sizeBy.shoes && p.sizeBy.shoes.length) parts.push(`shoes ${p.sizeBy.shoes.join("/")}`);
  if (p.minCondition) parts.push(`${p.minCondition} or better`);
  if (p.maxPrice) parts.push(`under AED ${p.maxPrice.toLocaleString("en-US")}`);
  return parts.join(" · ");
}
