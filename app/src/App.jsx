import { useEffect } from "react";
import Marketplace from "./Marketplace.jsx";
import { ComplianceProvider } from "./compliance";
import { initNativeShell } from "./native";
import { loadLanguage, applyLanguage } from "./i18n/LanguagePicker.jsx";
import { initTheme, watchSystem } from "./theme/theme.js";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { initBackend } from "./data/repo.js";
import * as remote from "./backend/remote.js";

export default function App() {
  useEffect(() => {
    initNativeShell();
    // Sets <html lang> and dir, so RTL languages mirror the whole layout.
    loadLanguage().then(applyLanguage);
    initBackend();          // stays local unless a real session is available

    // Google hands control back through the custom scheme registered in the
    // native project. Catch it and turn the tokens into a session.
    let off;
    (async () => {
      try {
        const { App: CapApp } = await import("@capacitor/app");
        const h = await CapApp.addListener("appUrlOpen", ({ url }) => {
          if (url && url.includes("auth-callback")) {
            remote.completeOAuth(url).catch(() => {});
          }
        });
        off = () => h.remove();
      } catch { /* browser build — nothing to listen to */ }
      // the web equivalent: tokens arrive in the URL fragment
      if (typeof window !== "undefined" && window.location.hash.includes("access_token")) {
        remote.completeOAuth(window.location.hash).catch(() => {});
        window.history.replaceState({}, "", window.location.pathname);
      }
    })();
    initTheme();
    // Follow the phone if it flips to dark while the app is open.
    return watchSystem();
  }, []);
  // Nothing in the marketplace renders until market, age and consent are settled.
  // Two boundaries, not one. The inner catches a marketplace crash while
  // leaving the compliance gate intact; the outer is the last line of defence
  // if the provider itself fails. Either way the user sees lili, not white.
  return (
    <ErrorBoundary name="app">
      <ComplianceProvider>
        <ErrorBoundary name="marketplace">
          <Marketplace />
        </ErrorBoundary>
      </ComplianceProvider>
    </ErrorBoundary>
  );
}
