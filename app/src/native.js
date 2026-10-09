// ── thin Capacitor wrapper ────────────────────────────────────────────────
// Everything here degrades to a no-op in a normal browser, so `npm run dev`
// and `npm run preview` keep working without a device.
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";

export const isNative = () => Capacitor.isNativePlatform();

/**
 * Wire the Android hardware / gesture back button to in-app navigation.
 * `handler` returns true if it consumed the press; false minimises the app.
 */
export function useAndroidBack(handler, deps = []) {
  useEffect(() => {
    if (!isNative()) return;
    let remove;
    CapApp.addListener("backButton", () => {
      const consumed = handler();
      if (!consumed) CapApp.minimizeApp();
    }).then((h) => {
      remove = h.remove.bind(h);
    });
    return () => { if (remove) remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Called once on boot: paint the status bar and dismiss the native splash. */
export async function initNativeShell() {
  if (!isNative()) return;
  try {
    await StatusBar.setStyle({ style: Style.Light });   // dark icons on light bg
    await StatusBar.setBackgroundColor({ color: "#FFF8F2" });   // the page ground (cream), so the bar and the header meet without a seam
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch { /* status bar unavailable on some devices — non-fatal */ }
  try {
    await SplashScreen.hide();
  } catch { /* no splash configured — non-fatal */ }
}
