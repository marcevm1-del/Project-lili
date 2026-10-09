import { t } from "../i18n/t.js";
// ─────────────────────────────────────────────────────────────────────────────
//  RANKING
//
//  Nothing in this app was sorted. Not the feed, not a category, not a shop
//  page, not search. Items arrived in whatever order the array held them —
//  seed order offline, `created_at desc` from one line of SQL when remote — and
//  the client could not influence it.
//
//  Meanwhile the filter sheet offered a Sort By control with four options, full
//  selected-state styling and a checkmark. `filters.sort` was written and never
//  read. A shopper picked "Price: Low to High", watched the tick appear, tapped
//  "Show Results", and got the identical unsorted grid back. That is the exact
//  thing this project has refused to ship everywhere else — a control that
//  looks like a control and is not one.
//
//  Two ways to fix that: delete the control, or make it work. Sorting a
//  filtered array is not hard, so the only option that was ever defensible is
//  this one.
// ─────────────────────────────────────────────────────────────────────────────

/** How long a piece counts as new. */
export const NEW_DAYS = 14;

/**
 * Is this a new arrival?
 *
 * It used to be `item.isNew`, a boolean the client set to `true` on every
 * publish and never cleared. Two things were wrong with that. It never expired,
 * so a piece listed in March was still "Just arrived" in August. And `isNew` is
 * not a column in `lili_items` and is not reconstructed in `fromRow`, so the
 * moment the backend went live every item came back with `isNew === undefined`
 * and the "New In" strip rendered its heading over an empty row — on day one,
 * for every user.
 *
 * `created_at` is written by the database, cannot be set by a seller, and is
 * already on every row. Deriving from it is both more honest and less code.
 */
export function isNewArrival(item, now = Date.now()) {
  if (!item) return false;
  const t = item.created_at || item.createdAt;
  // No timestamp means it did not come from the database and was not stamped
  // by bootstrap — there is nothing to derive from, and guessing "yes" is how
  // the old boolean made every piece permanently new.
  if (!t) return false;
  const age = now - new Date(t).getTime();
  return age >= 0 && age < NEW_DAYS * 86400000;
}

const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);
const when = (i) => {
  const t = i.created_at || i.createdAt;
  const ms = t ? new Date(t).getTime() : NaN;
  return isFinite(ms) ? ms : 0;
};

// The order in the sheet is the order a shopper reads. "Newest" first because
// it is the one that is true of the underlying data with no work at all, and
// the one a resale shopper checks most.
export const SORTS = {
  "Newest First":        (a, b) => when(b) - when(a),
  "Price: Low to High":  (a, b) => num(a.price) - num(b.price),
  "Price: High to Low":  (a, b) => num(b.price) - num(a.price),
  "Most Saved":          (a, b) => num(b.saves) - num(a.saves) || when(b) - when(a),
};

export const SORT_OPTIONS = Object.keys(SORTS);
export const DEFAULT_SORT = "Newest First";

/**
 * "Most Saved" needs a number the client does not have.
 *
 * `lili_saves` is row-level-secured to the person who saved — correctly, since
 * who wants what is nobody else's business. So a count cannot be assembled in
 * the browser, and the option would have been the second decorative control in
 * the same sheet.
 *
 * The count now arrives as `saves` on the row, maintained by a trigger
 * (migration `lili_item_save_counts`) and readable by everyone, because a total
 * discloses nothing about any individual. Offline there is no total, so the
 * option is hidden rather than shown sorting by zero.
 */
export const canSort = (key, items) =>
  key !== "Most Saved" || (items || []).some((i) => typeof i.saves === "number");

export function availableSorts(items) {
  return SORT_OPTIONS.filter((k) => canSort(k, items));
}

/** Sort a copy. Unknown or unavailable keys leave the order alone. */
export function applySort(items, key, { relevance = false } = {}) {
  const list = Array.isArray(items) ? items.slice() : [];
  // A search result set is already ordered by how well it answered the query.
  // Overriding that with "Newest" by default would bury the best answer.
  if (relevance && (!key || key === DEFAULT_SORT)) return list;
  const cmp = SORTS[key];
  if (!cmp || !canSort(key, list)) return list;
  return list.sort(cmp);
}

// ── taste ───────────────────────────────────────────────────────────────────
//
// The splash screen asks "What's your style?" over six categories, stores the
// answer in `picked`, and the button — which says "Show My Feed" — calls
// `onDone()`, which takes no arguments. `picked` was never read, never passed
// up, never persisted.
//
// Above the feed sat a header reading "For You · \u0644\u0643\u0650 / Curated to your style",
// with no strip of its own, over the same global array every user sees. And the
// consent sheet asked permission for personalisation — "Uses what you save and
// search so your feed looks like your taste" — that no code path consumed.
//
// A taste questionnaire, a consent toggle and a "curated" label, all over an
// unsorted global feed, in an app that elsewhere deletes invented review counts
// on principle. Either the claim goes or the feature arrives. Here is the
// feature; it is small, it is legible, and it only runs when she has said yes.

export const TASTE_KEY = "lili.taste.v1";

/**
 * Move pieces she is likely to want nearer the top. Do not hide anything.
 *
 * A filter would be wrong: she picked "Bags" at a splash screen in her first
 * ten seconds, not a permanent preference, and a catalogue this size cannot
 * afford to hide two thirds of itself over a tap. Re-ordering is recoverable;
 * removal is not.
 */
export function affinityOrder(items, taste, { enabled = true, sort } = {}) {
  const list = Array.isArray(items) ? items.slice() : [];
  const cats = (taste && taste.categories) || [];
  if (!enabled || !cats.length) return list;
  // An explicit choice beats an implicit one. She picked "Price: Low to High"
  // just now, on purpose; she picked "Bags" ten seconds into her first launch.
  // Reordering on top of her sort would put a AED 12,900 bag above a AED 260
  // abaya in a list she had just asked to be cheapest-first — the taste feature
  // quietly breaking the sort feature, which is how personalisation earns its
  // reputation. Taste only shapes the default order.
  if (sort && sort !== DEFAULT_SORT) return list;
  // The six tiles she is offered are not all categories: "Vintage" is an era.
  // Matching on category alone would have made that tile do nothing, which is
  // the failure this whole function exists to fix, one level down.
  const set = new Set(cats.map((c) => String(c).toLowerCase()));
  const hit = (i) => set.has(String(i.category || "").toLowerCase())
                  || set.has(String(i.era || "").toLowerCase());
  const rank = (i) => (hit(i) ? 0 : 1);
  return list.sort((a, b) => rank(a) - rank(b));
}

/** What the header may honestly say, given what we actually did. */
export function tasteLabel(taste, { enabled = true } = {}) {
  const cats = (taste && taste.categories) || [];
  if (!enabled || !cats.length) return null;
  const shown = cats.slice(0, 3).join(", ");
  return cats.length > 3 ? `${shown} and ${cats.length - 3} more` : shown;
}
