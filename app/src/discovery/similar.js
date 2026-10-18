// ─────────────────────────────────────────────────────────────────────────────
//  SIMILAR PIECES
//
//  Under a piece, other sellers' pieces of the same kind, so a buyer who likes
//  this one but not its price, size or seller has somewhere to go next.
//
//  Ranked by things the listings actually say — the same category, the same
//  size, the same brand, a price nearby — and nothing else. No "people also
//  viewed" (nobody counts views) and no "recommended for you" (it isn't). A
//  piece shares at least its category or its brand to be shown at all, and
//  when nothing does, the section is not drawn.
// ─────────────────────────────────────────────────────────────────────────────

const live = (i) => !i.status || i.status === "live";

/** Up to `limit` live pieces like `item`, from other shops, best match first. */
export function similarPieces(item, items, limit = 8) {
  if (!item || !Array.isArray(items)) return [];
  const price = Number(item.price) || 0;
  const brand = String(item.brand || "").toLowerCase();
  const scored = [];
  for (const i of items) {
    if (!i || i.id === item.id || i.shopId === item.shopId || !live(i) || i.reserved) continue;
    const sameCategory = !!item.category && i.category === item.category;
    const sameBrand = !!brand && String(i.brand || "").toLowerCase() === brand;
    if (!sameCategory && !sameBrand) continue;
    let score = (sameCategory ? 3 : 0) + (sameBrand ? 2 : 0)
              + (item.size && i.size === item.size ? 1.5 : 0);
    const p = Number(i.price) || 0;
    if (price > 0 && p > 0) score -= Math.min(2, Math.abs(Math.log(p / price)));   // 0 when equal, 2 at ~7×
    scored.push({ i, score });
  }
  return scored.sort((a, b) => b.score - a.score || String(a.i.id).localeCompare(String(b.i.id)))
    .slice(0, limit).map((x) => x.i);
}
