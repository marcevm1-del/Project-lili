// ─────────────────────────────────────────────────────────────────────────────
//  THE SCALE
//
//  Not a redesign. A tidying of distinctions nobody can see.
//
//  ── what was measured
//
//  `npm run uxlaws` opens the built app in a real browser and reads the
//  computed style of everything on the glass. It found **eighteen distinct
//  type sizes on a single screen**, and thirty across the source:
//
//      8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5,
//      15, 16, 17, 18, 19, 20, 21, 22, 24, 26, 28, 30, 34, 36, 44, 100
//
//  Half of those are half-steps. The difference between 11px and 11.5px is not
//  a difference a person can perceive — it is a difference the eye has to
//  resolve and fails to, which is Miller's Law working against you: every
//  extra distinction is load, and a distinction that carries no information is
//  load with nothing bought for it.
//
//  ── the rule this was collapsed under
//
//  NOTHING MOVES BY MORE THAN 1px, and almost everything by 0.5px or less. The
//  app looks the same. That was the whole brief: apply the laws, keep the
//  look. A type scale you can see being imposed is a redesign, and this is not
//  one.
//
//  ── the scale
//
//  Eleven sizes for interface text, then the display sizes, which are one-off
//  and not part of a rhythm — a splash logo is not "text at a size".
//
//  9   micro-labels, all caps       · CONDITION, SIZE, BRAND
//  10  captions, timestamps
//  11  secondary text               · the most-used size in the app
//  12  body                         · the second most-used
//  13  emphasised body, list titles
//  14  section headings, buttons
//  15  card titles
//  16  screen headings, inputs      · 16 stops iOS zooming a focused field
//  18  page titles
//  20  large numbers
//  22  hero
//  24  display
//
//  ── the 16px rule, which is not aesthetic
//
//  Safari on iOS zooms the page when a focused input has text below 16px, and
//  the zoom does not undo itself. Any input's font size stays at or above 16.
// ─────────────────────────────────────────────────────────────────────────────

/** Interface type. Anything larger is display, and listed separately. */
export const TYPE = [9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24];

/**
 * Display sizes, which are not type.
 *
 * A logotype is drawn at whatever size the composition wants; it is not a step
 * on a reading scale, and forcing it onto one would be applying a rule where
 * it does not belong. 28 and 56 are the two sizes the wordmark is set at — the
 * gate header and the splash — and they are listed so the measurement can tell
 * a deliberate display size from a stray one.
 */
export const DISPLAY = [26, 28, 30, 36, 44, 56, 100];

export const SCALE = [...TYPE, ...DISPLAY];

/**
 * Spacing rhythm.
 *
 * A 4px base, with 2px half-steps permitted where a component is genuinely
 * dense — a condition pill, a row of chips. Below 8px the value is an optical
 * nudge rather than layout and is left to judgement; at 8px and above it lands
 * on the grid.
 *
 * The measured state before this: 8.25, 9, 11, 13 and 15 all in use as layout
 * spacing, none of them chosen, each within a pixel of a neighbour that was.
 * Nothing moved by more than 1px to fix it.
 */
export const SPACE = 4;
export const HALF_STEP = 2;

/**
 * Snap a size to the scale.
 *
 * Exported for anything computing a size at runtime rather than writing a
 * literal. Returns the nearest scale step, never something between two.
 */
export const type = (n) =>
  SCALE.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), SCALE[0]);

/** Snap a spacing value to the 4px rhythm. Negative offsets are deliberate
 *  overlaps — an avatar pulled up over a banner — and are left alone. */
export const space = (n) => (n < 0 ? n : Math.round(n / SPACE) * SPACE);

export default { TYPE, DISPLAY, SCALE, SPACE, type, space };
