// ─────────────────────────────────────────────────────────────────────────────
//  DIRECTION
//
//  `applyLanguage` set `document.documentElement.dir = "rtl"` and nothing else.
//  Every layout in this app is written with physical left/right — 87 of them
//  across 20 files, and exactly one logical property in the whole codebase — so
//  that single line did not make the app Arabic. It made the text flip and left
//  the chrome where it was.
//
//  Four of those were not cosmetic:
//
//    · the chat bubble aligned by marginLeft/marginRight, so in Arabic you
//      could not tell your own messages from hers;
//    · the consent toggles moved their knob with translateX(18px), so every
//      privacy switch read inverted;
//    · every back arrow is a literal "←" and pointed the wrong way;
//    · the tab-bar badge is centred with right:50% and a negative marginRight,
//      which does not mirror — it drifts off the icon entirely.
//
//  Shipping `dir="rtl"` over that is the "control that looks like a control"
//  failure this project has spent three releases deleting, applied to half the
//  intended market.
//
//  ── why not logical CSS properties
//
//  `marginInlineStart` and `insetInlineStart` are the correct answer and cannot
//  be used here. The manifest declares minSdkVersion 23 and vite.config.js
//  transpiles to chrome58 for exactly that reason; logical properties landed in
//  Chrome 87. On the devices this app promises to support they resolve to
//  nothing, which means no margin at all rather than a mirrored one.
//
//  So: helpers that emit physical properties for the direction in force. They
//  work on every WebView, they are explicit at the call site about which edge
//  is meant, and `oldwebview.test.mjs` keeps them honest.
// ─────────────────────────────────────────────────────────────────────────────

let dir = "ltr";
const listeners = new Set();

export const getDir = () => dir;
export const isRTL = () => dir === "rtl";

/**
 * Set the direction and tell everything that is listening.
 *
 * The second half is what was missing. `applyLanguage` wrote to the DOM and
 * published nothing, there is no context, and `LanguagePicker`'s own `onChange`
 * prop was never passed — so no component in the tree re-rendered when the
 * language changed. The picker was a control that could not control anything.
 */
export function setDir(next) {
  const value = next === "rtl" ? "rtl" : "ltr";
  if (value === dir) return dir;
  dir = value;
  if (typeof document !== "undefined") document.documentElement.dir = value;
  listeners.forEach((fn) => { try { fn(value); } catch { /* a listener must not break the switch */ } });
  return dir;
}

export function onDirChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ── the helpers ─────────────────────────────────────────────────────────────
//
// Named for the edge that MEANS something — start is where reading begins —
// rather than for a side of the screen.

/** `{ marginInlineStart: n }` for browsers that have never heard of it. */
export const marginStart = (n) => (isRTL() ? { marginRight: n } : { marginLeft: n });
export const marginEnd   = (n) => (isRTL() ? { marginLeft: n }  : { marginRight: n });
export const padStart    = (n) => (isRTL() ? { paddingRight: n } : { paddingLeft: n });
export const padEnd      = (n) => (isRTL() ? { paddingLeft: n }  : { paddingRight: n });

/** Absolute positioning against the reading edge. */
export const insetStart = (n) => (isRTL() ? { right: n } : { left: n });
export const insetEnd   = (n) => (isRTL() ? { left: n }  : { right: n });

/** textAlign, where "start" is not supported. */
export const alignStart = () => (isRTL() ? "right" : "left");
export const alignEnd   = () => (isRTL() ? "left" : "right");

/**
 * The back arrow.
 *
 * A back arrow points against the reading direction. In Arabic that is right.
 * Every one of these in the app was a hardcoded "←", including the one in the
 * shared Shell used by Legal Centre, Help, Settings, Auth — and by the language
 * picker itself, so the screen where she chooses Arabic had an arrow pointing
 * the wrong way the moment she chose it.
 */
export const backArrow = () => (isRTL() ? "→" : "←");
export const forwardArrow = () => (isRTL() ? "←" : "→");
export const chevron = () => (isRTL() ? "‹" : "›");

/**
 * A translateX that means "toward the end".
 *
 * The consent toggles are the reason this exists: `translateX(18px)` moves the
 * knob right, so with the track mirrored the "on" position sat at the start —
 * every privacy switch in the app read inverted in Arabic. Whether a woman
 * believes she turned analytics off is not a cosmetic question.
 */
export const shiftEnd = (n) => `translateX(${isRTL() ? -n : n}px)`;

/**
 * Money, in the order the language puts it.
 *
 * `formatPrice` in ux/input.js has known since v2.7 that Arabic puts the
 * currency after the number, and it has never been called from anywhere in the
 * app: nineteen bare `toLocaleString()` calls with a hardcoded "AED " prefix
 * instead. This is the one place that should format a price.
 */
export function money(amount, { currency = "AED", locale } = {}) {
  const n = Number(amount);
  if (!isFinite(n)) return "";
  const loc = locale || (isRTL() ? "ar-AE" : "en-AE");
  let digits;
  try { digits = n.toLocaleString(loc, { maximumFractionDigits: 0 }); }
  catch { digits = Math.round(n).toLocaleString(); }
  const AR_CURRENCY = { AED: "درهم" };
  return isRTL()
    ? `${digits} ${AR_CURRENCY[currency] || currency}`
    : `${currency} ${digits}`;
}

/** A date, in the language in force. */
export function when(value, opts = {}) {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  const loc = isRTL() ? "ar-AE" : "en-AE";
  try { return d.toLocaleDateString(loc, opts); }
  catch { return d.toLocaleDateString(); }
}
