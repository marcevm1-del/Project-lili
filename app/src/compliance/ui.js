import { createElement as h } from "react";
import { backArrow, alignStart } from "../i18n/direction.js";

// Same tokens as the marketplace — these screens should feel like lili,
// not like a legal wall someone bolted on.
// Same tokens as the marketplace — one source of truth in theme/palette.css.
export const C = {
  peach: "var(--c-peach)", cream: "var(--c-cream)",
  terra: "var(--c-terra)", terraDk: "var(--c-terra-dk)",
  ink: "var(--c-ink)", inkLt: "var(--c-ink-lt)",
  sand: "var(--c-sand)", gold: "var(--c-gold)",
  white: "var(--c-white)", border: "var(--c-border)",
  green: "var(--c-green)", red: "var(--c-red)",
  shadow: "var(--c-shadow)",
  rose: "var(--c-rose)", bg: "var(--c-bg)",

  // v2.8: these three were read by this file (Button, Shell) and by the
  // compliance screens, and defined in neither C object. See the longer note
  // in Marketplace.jsx — the CSS variables were always there, the JS map just
  // never exposed them, so the styles resolved to undefined and vanished.
  terraTx: "var(--c-terra-tx)",
  btn: "var(--c-accent-btn)", onBtn: "var(--c-on-accent)",
  goldTx: "var(--c-gold-tx)", greenTx: "var(--c-green-tx)", redTx: "var(--c-red-tx)",
};

export function Shell({ title, subtitle, children, onBack }) {
  return h("div", {
    className: "full-height safe-shell",
    style: {
      // These screens are opened OVER the page you were on, so they must cover
      // it. Rendered in normal flow they stacked underneath instead: tapping
      // Settings from the profile put it 1,065px down the page, where it looked
      // like the button simply did nothing. Fixed, scrollable, and above the
      // tab bar.
      position: "fixed", top: 0, right: 0, bottom: 0, left: 0,
      zIndex: 600, overflowY: "auto", WebkitOverflowScrolling: "touch",
      background: C.peach, maxWidth: 430, margin: "0 auto",
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      display: "flex", flexDirection: "column",
    },
  },
    onBack && h("button", {
      onClick: onBack,
      className: "tap-target",
      style: { background: "none", border: "none", color: C.ink, fontSize: 20,
               padding: 0, marginBottom: 14, alignSelf: "flex-start", cursor: "pointer",
               display: "flex", alignItems: "center", justifyContent: "center" },
      // The one back arrow used by Legal Centre, Help, Settings, Auth and the
      // language picker — so in Arabic the screen where she CHOOSES Arabic had
      // an arrow pointing the wrong way the moment she chose it.
    }, backArrow()),
    h("div", { style: { fontFamily: "Georgia,serif", fontWeight: 700, fontSize: 26,
                        color: C.ink, letterSpacing: -0.5, lineHeight: 1.2 } }, title),
    subtitle && h("div", { style: { fontFamily: "Georgia,serif", fontStyle: "italic",
                                    fontSize: 14, color: C.terraTx, marginTop: 5,
                                    marginBottom: 22 } }, subtitle),
    h("div", { style: { flex: 1 } }, children)
  );
}

export function Btn({ children, onClick, disabled, tone = "solid" }) {
  const solid = tone === "solid";
  return h("button", {
    onClick, disabled,
    style: {
      width: "100%", marginTop: 14, padding: "16px 0", borderRadius: 30,
      fontWeight: 700, fontSize: 15, cursor: disabled ? "default" : "pointer",
      border: solid ? "none" : `1.5px solid ${C.terra}`,
      background: disabled ? C.sand : solid ? C.btn : "transparent",
      color: disabled ? C.inkLt : solid ? C.onBtn : C.terraTx,
      boxShadow: disabled || !solid ? "none" : `0 4px 16px ${C.shadow}`,
      transition: "background .15s",
    },
  }, children);
}

export function GhostBtn({ children, onClick }) {
  return h("button", {
    onClick,
    style: {
      width: "100%", padding: "12px 16px", marginBottom: 8, borderRadius: 12,
      background: C.white, border: `1px solid ${C.border}`, textAlign: alignStart(),
      fontSize: 13, color: C.ink, cursor: "pointer",
    },
  }, children);
}

/**
 * The shared text field — now with a direction.
 *
 * `rtl` forces right-to-left for a field that is FOR Arabic whatever the
 * interface language is: the Arabic-title input is the obvious one. Without it
 * Arabic is bidi-rendered inside a left-to-right box, so punctuation and any
 * Latin brand name jump to the wrong end of what she typed, in the field the
 * sell flow specifically asks her to fill in.
 *
 * Settings.jsx had solved this privately in a local copy of `Field` since v2.7
 * and the fix never reached the primitive — which is why every other Arabic
 * input in the app still had it wrong.
 */
export function Field({ value, onChange, placeholder, inputMode, maxLength, multiline, rtl, ariaLabel }) {
  const style = {
    width: "100%", padding: "14px 16px", borderRadius: 12, fontSize: 16,
    background: C.white, border: `1px solid ${C.border}`, color: C.ink,
    outline: "none", marginBottom: 12, fontFamily: "inherit",
    direction: rtl ? "rtl" : undefined,
    textAlign: rtl ? "right" : alignStart(),
  };
  return h(multiline ? "textarea" : "input", {
    value, placeholder, inputMode, maxLength,
    dir: rtl ? "rtl" : undefined,
    "aria-label": ariaLabel || placeholder,
    rows: multiline ? 4 : undefined,
    onChange: (e) => onChange(e.target.value),
    style: multiline ? { ...style, resize: "vertical", lineHeight: 1.5 } : style,
  });
}

export function Note({ children }) {
  return h("div", {
    style: { fontSize: 11, color: C.inkLt, lineHeight: 1.6, marginTop: 16,
             paddingTop: 14, borderTop: `1px solid ${C.border}` },
  }, children);
}
