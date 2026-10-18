// ── durable key/value ──────────────────────────────────────────────────────
// Capacitor Preferences on device (survives WebView storage eviction),
// localStorage in a browser so `npm run dev` still works.
import { Preferences } from "@capacitor/preferences";
import { Capacitor } from "@capacitor/core";

const native = () => Capacitor.isNativePlatform();

export async function get(key) {
  try {
    if (native()) return (await Preferences.get({ key })).value;
    return window.localStorage.getItem(key);
  } catch { return null; }
}

export async function set(key, value) {
  try {
    if (native()) await Preferences.set({ key, value });
    else window.localStorage.setItem(key, value);
  } catch { /* storage full or blocked — non-fatal */ }
}

export async function remove(key) {
  try {
    if (native()) await Preferences.remove({ key });
    else window.localStorage.removeItem(key);
  } catch { /* non-fatal */ }
}

export async function getJSON(key, fallback = null) {
  const raw = await get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export const setJSON = (key, value) => set(key, JSON.stringify(value));
