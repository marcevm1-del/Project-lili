import { APP_VERSION } from "../version.js";

// ─────────────────────────────────────────────────────────────────────────────
//  CRASH REPORTS
//
//  A crash on a phone used to stay on the phone. This sends a short, scrubbed
//  description to lili_report_error, which appends it to a table nobody but
//  the owner can read (see lili.recent_errors). The server rate-limits it.
//
//  What leaves the phone: the error message and stack (with emails, long
//  numbers and URLs' query strings removed), the screen name, the app version
//  and the platform. Never her listings, messages or anything she typed.
//  At most 20 reports per app session, and the same error once.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_PER_SESSION = 20;
const seen = new Set();
let sent = 0;
let sender = null;           // set once the backend is ready; reports wait until then
const waiting = [];

export function scrub(text, max) {
  return String(text == null ? "" : text)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\?[^\s)'"]*/g, "?…")
    .replace(/\d{6,}/g, "[number]")
    .slice(0, max);
}

function platform() {
  try {
    const cap = typeof window !== "undefined" && window.Capacitor;
    return (cap && cap.getPlatform && cap.getPlatform()) || "web";
  } catch { return "web"; }
}

export function report(kind, error, screen = "app") {
  const message = scrub(error && (error.message || error.reason || error), 500);
  if (!message || sent >= MAX_PER_SESSION) return;
  const key = `${kind}|${message}`;
  if (seen.has(key)) return;
  seen.add(key);
  sent++;
  const entry = {
    p_kind: kind, p_message: message,
    p_stack: scrub(error && error.stack, 4000) || null,
    p_screen: scrub(screen, 60), p_version: APP_VERSION, p_platform: platform(),
  };
  if (sender) sender(entry); else waiting.push(entry);
}

/** Give the reporter a way to send. Called when the backend is configured. */
export function connectReporter(send) {
  sender = (entry) => { Promise.resolve(send(entry)).catch(() => {}); };
  while (waiting.length) sender(waiting.shift());
}

/** Catch what nothing else catches. */
export function installGlobalHandlers() {
  if (typeof window === "undefined" || window.__liliReporting) return;
  window.__liliReporting = true;
  window.addEventListener("error", (e) => report("error", e.error || e.message));
  window.addEventListener("unhandledrejection", (e) => report("rejection", e.reason));
}
