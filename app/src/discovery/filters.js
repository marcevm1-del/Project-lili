// ─────────────────────────────────────────────────────────────────────────────
//  ONE FILTER PREDICATE
//
//  There were two. The home feed had its own filter expression; the filter
//  sheet had a second one, written out again, to compute the "Show N Results"
//  number on its own button. They did not agree — the sheet's copy ignored the
//  search box, so the count promised results the feed would not show — and any
//  fix to one of them silently left the other behind.
//
//  Worse, both ignored two of the seven controls the sheet offers. `size` and
//  `color` were written into `filters` and read by nothing, alongside `sort`.
//  Three of seven controls in that sheet did nothing at all.
//
//  Now the predicate lives once, and the count on the button is computed with
//  the same function that produces the grid, so it cannot promise a number the
//  next screen does not deliver.
// ─────────────────────────────────────────────────────────────────────────────

export const EMPTY_FILTERS = {
  category: "All", brand: "", condition: "", minPrice: 0, maxPrice: 999999,
  size: "", sort: "Newest First",
  // "My sizes": the sizes she wears, applied as one switch. One-size pieces
  // (bags, scarves) always pass — they fit everyone, and hiding them would
  // empty half the luxury catalogue for no reason.
  sizes: [],
  // How it runs against its label ("small" / "true" / "large"), and pieces
  // whose seller said there is nothing to point out. Both come from the
  // listing form; a listing that did not answer does not match.
  fit: "", noFlaws: false,
};

// v2.9: `color` is gone from the filter sheet, and this is the reason.
//
// The swatch row filtered on `item.color`, a hex string. The sell flow never
// asks for one — check the `form` initialiser in SellPage — so every listing a
// real seller publishes has `color === undefined`. The eight swatches matched
// the ten seed items and nothing a customer would ever list. On a real
// catalogue the control returned an empty grid, every time, silently.
//
// Two honest options: ask sellers for a colour, or drop the control. Asking
// costs every seller a step in a flow we are otherwise trying to shorten, for a
// filter nobody has asked for. If that changes, it comes back — with a question
// in the sell flow first, and this note deleted.

export function matchesFilters(item, f = {}) {
  if (!item) return false;
  const cat = f.category;
  if (cat && cat !== "All" && item.category !== cat) return false;
  if (f.brand && item.brand !== f.brand) return false;
  if (f.condition && item.condition !== f.condition) return false;
  if (f.size && String(item.size || "") !== String(f.size)) return false;
  if (Array.isArray(f.sizes) && f.sizes.length && String(item.size || "") !== "OS"
      && !f.sizes.map(String).includes(String(item.size || ""))) return false;
  if (f.fit && item.fit !== f.fit) return false;
  if (f.noFlaws && !(Array.isArray(item.flaws) && item.flaws.length === 0)) return false;
  const price = typeof item.price === "number" ? item.price : 0;
  if (price < (f.minPrice || 0)) return false;
  if (price > (f.maxPrice == null ? 999999 : f.maxPrice)) return false;
  return true;
}

/** How many controls are actually narrowing the results right now. */
export function activeCount(f = {}) {
  let n = 0;
  if (f.category && f.category !== "All") n++;
  if (f.brand) n++;
  if (f.condition) n++;
  if (f.size) n++;
  if (Array.isArray(f.sizes) && f.sizes.length) n++;
  if (f.fit) n++;
  if (f.noFlaws) n++;
  if (f.minPrice) n++;
  if (f.maxPrice != null && f.maxPrice !== 999999) n++;
  return n;
}
