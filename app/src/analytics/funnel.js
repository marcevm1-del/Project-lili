import * as remote from "../backend/remote.js";
import { getJSON, setJSON } from "../compliance/store.js";
import { fold } from "../discovery/text.js";

// ─────────────────────────────────────────────────────────────────────────────
//  THE FUNNEL
//
//  The consent sheet has asked every user since v2.7 to agree to analytics —
//  "Help us fix what's broken · Which screens get used and where the app falls
//  over". The answer was stored, audited, and made withdrawable in Legal
//  Centre. Nothing read it. There was no analytics of any kind in the app: no
//  SDK, no event bus, no screen tracking, no error reporting.
//
//  That is the same failure this project keeps deleting elsewhere — a control
//  that looks like a control — except this one asks permission first, which
//  makes it worse rather than better.
//
//  The launch plan's own option 10 said it plainly: "Gate screen → sign-up →
//  first listing → first message → first offer. Without it you will finish
//  launch week knowing nothing about where people stopped."
//
//  ── what this is not
//
//  Not a third-party SDK. No Firebase, no Amplitude, no Segment. Every one of
//  those ships a device graph and an advertising identifier to a company that
//  is not lili, which is a disclosure this app's privacy notice does not make
//  and a Play Store data-safety declaration it would then have to. Events go to
//  lili's own Postgres and nowhere else.
//
//  Not a session recorder. Not a heatmap. Not anything that reconstructs one
//  woman's evening.
//
//  ── the rules, and they are enforced, not described
//
//  1. Silent without consent. `enable(false)` drops the queue on the floor.
//  2. No free text, with exactly one exception: the term behind a search that
//     found nothing. Zero-result queries are the single most actionable thing a
//     small catalogue can collect — they are a shopping list written by the
//     people who wanted to buy — and Baymard's 2026 benchmark puts 64% of app
//     search experiences at mediocre or worse, mostly on that dead end. So it
//     is collected, under a rule tight enough to state: no digits, no "@", 40
//     characters at most. That drops phone numbers, emails, order references
//     and anything long enough to be a sentence about herself.
//  3. Nobody can read it back through the app. `lili_events` has no SELECT
//     policy for any client role.
//  4. Withdrawal erases. Switching the toggle off deletes the rows, because a
//     toggle that only stops future collection is not erasure under the PDPL.
//  5. Never blocks anything. Fire-and-forget, batched, bounded, and a failure
//     is a dropped batch — never an error a shopper sees.
// ─────────────────────────────────────────────────────────────────────────────

export const EVENTS = {
  APP_OPEN:        "app_open",
  GATE_SHOWN:      "gate_shown",
  GATE_PASSED:     "gate_passed",
  SIGNUP_DONE:     "signup_done",
  SCREEN:          "screen",
  SEARCH:          "search",
  SEARCH_EMPTY:    "search_empty",
  SEARCH_RECOVER:  "search_recover",
  FILTER_APPLIED:  "filter_applied",
  SORT_APPLIED:    "sort_applied",
  ITEM_OPENED:     "item_opened",
  ITEM_SAVED:      "item_saved",
  SELL_STARTED:    "sell_started",
  SELL_STEP:       "sell_step",
  SELL_BLOCKED:    "sell_blocked",
  SELL_ABANDONED:  "sell_abandoned",
  LISTING_LIVE:    "listing_live",
  MESSAGE_SENT:    "message_sent",
  OFFER_MADE:      "offer_made",
  PHOTO_ADVICE:    "photo_advice",
  LANGUAGE_SET:    "language_set",
  APP_ERROR:       "app_error",
};

const QUEUE_KEY = "lili.events.q.v1";
const SESSION_KEY = "lili.events.sid.v1";
const MAX_QUEUE = 200;      // beyond this the oldest go; a phone is not a store
const FLUSH_AT = 12;        // batch size that trades round-trips against loss
const FLUSH_MS = 20000;

let enabled = false;
let sessionId = null;
let queue = [];
let timer = null;
let appVersion = "";
// The language in force, carried on every event.
//
// Without it the funnel cannot answer "do Arabic users drop off where English
// users don't", and would not have been able to after launch week either —
// every number would be an average across two materially different
// experiences, one of which was broken. A two-letter tag and a direction are
// not personal data by any reading.
let lang = "";
let dir = "";

// setJSON returns a promise; a rejected one that nobody catches is an unhandled
// rejection, which on some Android WebViews is a crash. Analytics must never be
// the reason anything breaks.
const save = (k, v) => { try { Promise.resolve(setJSON(k, v)).catch(() => {}); } catch { /* non-fatal */ } };

/**
 * A session id, not a person id.
 *
 * Random per app launch. It ties a gate screen to the sign-up that followed it
 * — which is the whole question a funnel answers — and expires when the app
 * does, so it cannot become a long-lived handle on anybody.
 */
function newSession() {
  const r = (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return r.slice(0, 32).padEnd(16, "0");
}

export function init({ version = "" } = {}) {
  appVersion = String(version || "");
  if (!sessionId) sessionId = newSession();
  save(SESSION_KEY, sessionId);
  return sessionId;
}

export function setLanguage(code, direction) {
  lang = String(code || "").slice(0, 8);
  dir = direction === "rtl" ? "rtl" : "ltr";
}

export const sessionOf = () => sessionId;
export const isEnabled = () => enabled;

/**
 * Turn collection on or off.
 *
 * Off does three things, and the third is the one that makes the toggle mean
 * something: stop collecting, discard what is queued, and erase what was
 * already sent.
 */
export async function enable(on) {
  const was = enabled;
  enabled = !!on;
  if (!enabled) {
    queue = [];
    save(QUEUE_KEY, []);
    if (was) { try { await remote.eraseMyEvents(); } catch { /* best effort */ } }
    return;
  }
  if (!sessionId) init({ version: appVersion });
  try { queue = (await getJSON(QUEUE_KEY, [])) || []; } catch { queue = []; }
}

// ── the free-text rule ──────────────────────────────────────────────────────
//
// The only free text this module will carry, and the exact test it must pass.
// Written as one function so there is one place to read it and one place to
// change it, and so a test can assert on it directly.
//
// ── the hole this had, and why it is worth writing down
//
// The first version was /^[^\d@]{1,40}$/. In JavaScript `\d` is ASCII 0-9 and
// nothing else, so ٠٥٠١٢٣٤٥٦٧ — a Dubai mobile number, typed on the Arabic
// keyboard half this app's users have — sailed straight through the rule that
// exists to stop precisely that. A privacy rule written in a Latin frame of
// mind, in a bilingual product.
//
// So the test now runs on the folded form, where discovery/text.js has already
// mapped Arabic-Indic and Persian digits to ASCII, and the character class is
// spelled with \p{N} — every numeral in Unicode — rather than \d.

const NO_DIGITS_OR_AT = /^[^\p{N}@]{1,40}$/u;

export function termIsCollectable(term) {
  const t = String(term || "").trim();
  if (!t) return false;
  // Folded first: ٠١٢ become 012 and are then caught by \p{N}, and a query
  // padded with tashkeel cannot slip past a length cap either.
  if (!NO_DIGITS_OR_AT.test(t)) return false;
  return NO_DIGITS_OR_AT.test(fold(t));
}

/**
 * Strip anything that is not an enum, a number, a boolean, or a term that
 * passed the rule above. This runs on every event, so a careless call site
 * cannot leak: the guard is here, not at the call sites.
 */
function scrub(props) {
  const out = {};
  for (const [k, v] of Object.entries(props || {})) {
    if (typeof v === "number" && isFinite(v)) { out[k] = v; continue; }
    if (typeof v === "boolean") { out[k] = v; continue; }
    if (typeof v !== "string") continue;
    if (k === "term") { if (termIsCollectable(v)) out[k] = v.trim().toLowerCase(); continue; }
    // every other string must be short and enum-shaped: a screen name, a sort
    // key, a step number as text. Never a title, never a message.
    if (v.length <= 32 && !/[\p{N}@]{4,}/u.test(fold(v))) out[k] = v;
  }
  return out;
}

export function track(name, props = {}) {
  if (!enabled || !name) return;
  if (!sessionId) init({ version: appVersion });
  queue.push({ session_id: sessionId, name: String(name).slice(0, 48),
               props: scrub(props), app_version: appVersion,
               lang: lang || null, dir: dir || null });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  save(QUEUE_KEY, queue);
  if (queue.length >= FLUSH_AT) flush();
  else schedule();
}

function schedule() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; flush(); }, FLUSH_MS);
}

/**
 * Send what is waiting before the app goes away.
 *
 * Without this the last events of every session — which are the ones that say
 * where she stopped, the entire point of a funnel — sat in the queue until she
 * next opened the app, and were lost entirely if she never did. `pagehide` and
 * a hidden `visibilitychange` are the two the Android WebView actually fires;
 * `beforeunload` does not fire reliably on mobile at all.
 */
if (typeof document !== "undefined") {
  const onAway = () => { if (document.visibilityState === "hidden") flush(); };
  document.addEventListener("visibilitychange", onAway);
  window.addEventListener("pagehide", () => flush());
}

/**
 * Send what is queued.
 *
 * A failure keeps the batch — a shopper on the metro should not lose the funnel
 * — but the queue is capped, so a permanently unreachable server costs a fixed
 * amount of storage and never grows.
 */
export async function flush() {
  if (!enabled || !queue.length) return false;
  if (!remote.isConfigured()) return false;
  const batch = queue.slice(0, FLUSH_AT * 4);
  try {
    await remote.sendEvents(batch);
    queue = queue.slice(batch.length);
    save(QUEUE_KEY, queue);
    return true;
  } catch {
    return false;   // keep them; try again on the next flush
  }
}

// ── convenience wrappers ────────────────────────────────────────────────────
// Named so the call sites read as the funnel step they are, and so the set of
// things collected is enumerable by reading this file rather than by grepping
// the app.

export const screen = (name) => track(EVENTS.SCREEN, { name });

export const search = (query, resultCount) => {
  const words = String(query || "").trim().split(/\s+/).filter(Boolean).length;
  track(EVENTS.SEARCH, { words, results: resultCount });
  if (resultCount === 0) track(EVENTS.SEARCH_EMPTY, { words, term: query });
};

export const sellStep = (step, mode) => track(EVENTS.SELL_STEP, { step, mode });
export const error = (where) => track(EVENTS.APP_ERROR, { where });
