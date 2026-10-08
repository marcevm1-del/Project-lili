import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Clear the old-WebView fallback now that we know the bundle parsed and ran.
const rootEl = document.getElementById("root");
const fallback = document.getElementById("boot-fallback");
if (fallback) fallback.remove();

createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
