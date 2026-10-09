import { useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
//  FOCUS TRAP
//
//  axe-core found zero violations, and axe cannot check any of this. Automated
//  tools verify that controls have names; they cannot tell you that opening a
//  modal leaves focus stranded behind it, that Tab walks out of the dialog into
//  the page underneath, or that Escape does nothing.
//
//  For a keyboard or switch-control user, an untrapped modal is a dead end:
//  they can hear the dialog but cannot reach its buttons, and there is no way
//  out. This is the difference between passing an audit and being usable.
//
//  Four behaviours, all of them expected by anyone who uses a computer:
//    · focus moves into the dialog when it opens
//    · Tab and Shift+Tab cycle within it
//    · Escape closes it
//    · focus returns to whatever opened it
// ─────────────────────────────────────────────────────────────────────────────

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useFocusTrap(onClose, { active = true } = {}) {
  const ref = useRef(null);
  const returnTo = useRef(null);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    // remember where we came from, so it can be handed back
    returnTo.current = document.activeElement;

    const focusables = () =>
      [...node.querySelectorAll(FOCUSABLE)].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });

    // Move focus in — the heading if there is one, otherwise the first control.
    // Deliberately NOT the close button: landing on "dismiss" tells a screen
    // reader user the dialog is something to escape rather than read.
    const first = node.querySelector("[data-autofocus]") || focusables()[0];
    if (first) {
      try { first.focus({ preventScroll: true }); } catch { first.focus(); }
    }

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose && onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); return; }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault(); lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault(); firstEl.focus();
      } else if (!node.contains(document.activeElement)) {
        e.preventDefault(); firstEl.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      node.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keydown", onKeyDown);
      const back = returnTo.current;
      if (back && typeof back.focus === "function" && document.contains(back)) {
        try { back.focus({ preventScroll: true }); } catch { back.focus(); }
      }
    };
  }, [active, onClose]);

  return ref;
}

/** Props every dialog should carry so assistive tech announces it as one. */
export const dialogProps = (label) => ({
  role: "dialog",
  "aria-modal": true,
  "aria-label": label,
});
