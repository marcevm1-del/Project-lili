import { Capacitor } from "@capacitor/core";
import * as store from "../compliance/store.js";
import { record } from "../compliance/audit.js";

// ─────────────────────────────────────────────────────────────────────────────
//  THEME
//
//  Three modes, because two is the wrong number: most people want the app to
//  follow the phone, and the ones who don't want to override it. Defaulting to
//  "system" means someone who reads in bed with their phone in dark mode gets a
//  dark app without ever finding a setting.
//
//  A NAMING NOTE, deliberately left rather than papered over: the palette key
//  `C.white` now resolves to a dark card surface in dark mode. The name lies.
//  Renaming all 515 references to `C.surface` is the correct fix and a
//  mechanical one — but doing it in the same change as introducing theming
//  would make both impossible to review. Semantic aliases are exported below
//  and new code should use those.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = "lili.theme.v1";

export const MODES = [
  { key: "system", label: "Match my phone", labelAr: "حسب الجهاز",
    note: "Follows your phone's own light or dark setting." },
  { key: "light",  label: "Light", labelAr: "فاتح",
    note: "Peach and cream, whatever your phone is doing." },
  { key: "dark",   label: "Dark", labelAr: "داكن",
    note: "Warm near-black. Easier at night and on OLED screens." },
];

export const DEFAULT_MODE = "system";

export const getMode = async () => (await store.get(KEY)) || DEFAULT_MODE;

/** What the user will actually see right now, resolving "system". */
export function resolve(mode) {
  if (mode !== "system") return mode;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export async function applyTheme(mode = DEFAULT_MODE, { persist = true } = {}) {
  const effective = resolve(mode);
  try {
    document.documentElement.setAttribute("data-theme", mode);
    // The browser chrome and the pull-down notification shade read this.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", effective === "dark" ? "#16110E" : "#FFF8F2");
  } catch { /* no document under test */ }

  if (persist) await store.set(KEY, mode);
  await syncStatusBar(effective);
  return effective;
}

/**
 * The status bar has to be told separately — it is native chrome, not part of
 * the web view. Getting this wrong gives you dark icons on a dark bar, which
 * is the single most obvious sign an app's dark mode was an afterthought.
 */
async function syncStatusBar(effective) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: effective === "dark" ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color: effective === "dark" ? "#16110E" : "#FFF8F2" });
  } catch { /* unavailable on some devices — non-fatal */ }
}

export async function setMode(mode) {
  const effective = await applyTheme(mode);
  await record("theme.changed", { mode, effective });
  return effective;
}

/** In "system" mode, follow the phone if it changes while the app is open. */
export function watchSystem(onChange) {
  try {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = async () => {
      if ((await getMode()) === "system") {
        const effective = await applyTheme("system", { persist: false });
        onChange && onChange(effective);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  } catch {
    return () => {};
  }
}

export async function initTheme() {
  return applyTheme(await getMode(), { persist: false });
}

// ── semantic aliases ───────────────────────────────────────────────────────
// What the tokens mean, rather than what colour they happen to be in one
// theme. New components should use these.
export const T = {
  page:        "var(--c-bg)",
  surface:     "var(--c-white)",
  surfaceAlt:  "var(--c-cream)",
  fill:        "var(--c-sand)",
  line:        "var(--c-border)",
  text:        "var(--c-ink)",
  textMuted:   "var(--c-ink-lt)",
  accent:      "var(--c-terra)",
  accentText:  "var(--c-terra-tx)",
  positive:    "var(--c-green-tx)",
  negative:    "var(--c-red-tx)",
  shadow:      "var(--c-shadow)",
};
