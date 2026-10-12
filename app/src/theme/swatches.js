// ─────────────────────────────────────────────────────────────────────────────
//  CONTENT COLOURS — the one place outside palette.css that holds hex values
//
//  These are not theme colours. A shop banner she picked, the tint of a
//  category tile, the swatch behind a piece with no photograph: they are
//  content, they are stored or shown as chosen, and they do not change with
//  light or dark mode. Theme colours are CSS variables in palette.css, and a
//  component never writes either kind as a literal (research.test.mjs checks).
// ─────────────────────────────────────────────────────────────────────────────

/** Banner colours offered when a shop is opened. */
export const SHOP_BANNERS = ["#C4856A", "#7B6FA0", "#4A7B6F", "#C9A96E", "#B55A3A", "#5C4A3A"];

/** Banner colours offered in shop Settings. */
export const BANNER_CHOICES = ["#C4856A", "#D4B898", "#E8C4B8", "#C9A96E", "#B08D6E", "#9E6050"];

/** Tile tints on the search screen's category grid. */
export const CATEGORY_TINTS = {
  Luxury: "#C9A96E", Bags: "#D4B898", Dresses: "#E8C4B8",
  Abayas: "#EDE0D0", Shoes: "#C4A882", Vintage: "#C4856A",
};

/** The swatch behind a piece that has no colour of its own. */
export const SWATCH_FALLBACK = "#E8D5C6";
