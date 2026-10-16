// ─────────────────────────────────────────────────────────────────────────────
//  HOLIDAY MODE (migration 37)
//
//  A seller away until a date: her pieces leave the feed and search, new
//  offers and orders wait (the database refuses them), and her shop and pieces
//  say when she is back. The date passing reopens everything; nothing has to
//  be switched back on.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_AWAY_DAYS = 90;   // lili.shop_away_guard

/** Is this shop away right now? */
export function isAway(shop, now = Date.now()) {
  const t = shop && (shop.awayUntil || shop.away_until);
  return !!t && new Date(t).getTime() > now;
}

/** "24 Oct", in UAE time, for the date she is back. */
export function backOn(shop) {
  const t = shop && (shop.awayUntil || shop.away_until);
  if (!t) return "";
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Dubai" });
}

/** The set of shop ids that are away, for filtering a feed in one pass. */
export function awayShopIds(shops, now = Date.now()) {
  return new Set((shops || []).filter((s) => isAway(s, now)).map((s) => s.id));
}

/** A date picked on the phone (yyyy-mm-dd) → the end of that day in Dubai, as ISO. */
export function untilEndOf(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ""))) return null;
  return new Date(`${dateStr}T23:59:00+04:00`).toISOString();
}
