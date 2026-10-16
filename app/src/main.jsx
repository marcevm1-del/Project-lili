import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { installGlobalHandlers, connectReporter } from "./ux/errorReport.js";
import * as remote from "./backend/remote.js";

installGlobalHandlers();
// Only the real app reports: on a phone (Capacitor), or a web build served
// from a real host. Tests and local development run on localhost in a plain
// browser, and their deliberate crashes must not land in production's log.
const reporting = (() => {
  try {
    const cap = window.Capacitor;
    if (cap && cap.isNativePlatform && cap.isNativePlatform()) return true;
    return !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
  } catch { return false; }
})();
if (reporting && remote.isConfigured()) connectReporter((entry) => remote.reportError(entry));

// Clear the old-WebView fallback now that we know the bundle parsed and ran.
const rootEl = document.getElementById("root");
const fallback = document.getElementById("boot-fallback");
if (fallback) fallback.remove();

createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
