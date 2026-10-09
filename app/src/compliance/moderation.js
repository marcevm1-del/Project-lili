import { getJSON, setJSON } from "./store.js";
import { record } from "./audit.js";
import { strikeOutcome, STRIKE_POLICY } from "./listingRules.js";
import * as remote from "../backend/remote.js";

// ─────────────────────────────────────────────────────────────────────────────
//  v2.8 — this queue now reads the SERVER when you are a moderator.
//
//  It did not. Every function below read a device store, so the real cases —
//  the ones a trigger files when a listing is screened out, and the ones a
//  woman creates when she reports something — sat in `lili_moderation_cases`
//  where nothing in the app could see them. Setting the moderator claim on your
//  account, exactly as the go-live checklist instructs, would have opened a
//  screen showing your own phone's copy and nothing else.
//
//  The device path is unchanged and still right for a build with no backend.
//  The server path is gated by `lili_is_moderator()`, which reads a claim only
//  the service role can write, so this file cannot grant itself anything: if it
//  asked for cases it is not entitled to, the RPC raises 42501.
// ─────────────────────────────────────────────────────────────────────────────
let serverQueue = false;

/** Set once at boot: are we connected AND does the server call us a moderator? */
export async function initQueueSource() {
  try {
    serverQueue = remote.isConfigured() && (await remote.isModerator());
  } catch { serverQueue = false; }
  return serverQueue;
}
export const isServerQueue = () => serverQueue;

// The server's columns, in the shape the screen already knows how to render.
// `state` needs no translation — lili_moderation_claim writes 'reviewing' and
// lili_moderation_decide writes 'dismissed' or 'upheld', all of which are
// already in STATES.
const fromServer = (r) => ({
  id: r.id,
  kind: r.kind,
  source: r.source,
  targetId: r.target_item_id,
  shopId: r.shop_id,
  title: r.kind === "conversation" ? "A reported conversation"
       : r.kind === "listing" ? "A listing" : "A shop",
  reasons: r.reasons || [],
  reason: (r.reasons || [])[0],
  detail: r.detail,
  state: r.state,
  slaHours: r.sla_hours,
  createdAt: new Date(r.created_at).getTime(),
  dueAtMs: r.due_at ? new Date(r.due_at).getTime() : null,
  serverOverdue: r.overdue,
  reportCount: 1,          // the RPC groups by case; one row is one case
  decision: r.decision || null,
  remote: true,
});

let lastServerList = [];

// ─────────────────────────────────────────────────────────────────────────────
//  MODERATION QUEUE
//
//  Until now reports were captured and read by nobody, which is worse than
//  having no report button — it is a written record that you were told and did
//  not act.
//
//  This is the queue, its state machine, and the decision rules. It runs on the
//  device against local storage. That is deliberately a seam, not a shortcut:
//  every function here is async and goes through `read`/`write`, so swapping
//  those two for API calls moves the whole thing server-side without touching
//  any caller. See SERVER_CONTRACT at the bottom for the endpoints it expects.
//
//  What makes this a real queue rather than a list:
//    · every item has an SLA clock, and breaching it is visible
//    · every decision carries a reason that goes back to BOTH parties
//    · every decision can be appealed, and an appealed strike does not count
//    · strikes accumulate per seller and escalate automatically
// ─────────────────────────────────────────────────────────────────────────────

const KEY = "lili.moderation.v1";

export const STATES = {
  pending:   { key: "pending",   label: "Waiting",      terminal: false },
  reviewing: { key: "reviewing", label: "Being read",   terminal: false },
  upheld:    { key: "upheld",    label: "Upheld",       terminal: true  },
  dismissed: { key: "dismissed", label: "Dismissed",    terminal: true  },
  appealed:  { key: "appealed",  label: "Under appeal", terminal: false },
  overturned:{ key: "overturned",label: "Overturned",   terminal: true  },
};

// Hours to first decision. Counterfeit and stolen goods are the categories
// where delay creates actual legal exposure, so they get the tight clock.
export const SLA_HOURS = {
  counterfeit: 24, stolen: 24, scam: 24, prohibited: 24,
  harassment: 48, offensive: 48,
  miscategorised: 120, other: 120,
  _default: 72,
};

export const ACTIONS = {
  remove_listing: {
    key: "remove_listing", label: "Remove the listing", strike: 1,
    reporterMsg: "We removed the listing. Thank you for flagging it.",
    sellerMsg: "Your listing was removed because it broke a marketplace rule.",
  },
  remove_and_warn: {
    key: "remove_and_warn", label: "Remove and warn the seller", strike: 1,
    reporterMsg: "We removed the listing and warned the seller.",
    sellerMsg: "Your listing was removed and this counts as a strike on your shop.",
  },
  suspend_seller: {
    key: "suspend_seller", label: "Remove and pause the shop", strike: 2,
    reporterMsg: "We removed the listing and paused the seller.",
    sellerMsg: "Your listing was removed and selling is paused while we review your shop.",
  },
  close_shop: {
    key: "close_shop", label: "Close the shop, hold payouts", strike: 3,
    reporterMsg: "We closed the seller's shop.",
    sellerMsg: "Your shop is closed and payouts are held pending review.",
  },
  dismiss: {
    key: "dismiss", label: "No action needed", strike: 0,
    reporterMsg: "We looked at this and it doesn't break our rules. Here's why.",
    sellerMsg: null,   // a dismissed report is not told to the seller
  },
};

// ── storage seam ───────────────────────────────────────────────────────────
// Replace these two with fetch() against the endpoints in SERVER_CONTRACT and
// nothing else in this file, or any caller, has to change.
const read = () => getJSON(KEY, []);
const write = (items) => setJSON(KEY, items);

// ── queue operations ───────────────────────────────────────────────────────

export async function enqueue({ source, kind, targetId, title, shopId, shopName,
                                reason, detail, reportedBy = "buyer", marketCode }) {
  const items = await read();
  const now = Date.now();
  const slaHours = SLA_HOURS[reason] ?? SLA_HOURS._default;

  // One open case per target — ten reports of the same fake bag is one job,
  // but the report count is what tells a moderator which job matters.
  const existing = items.find(
    (i) => i.targetId === targetId && !(STATES[i.state] || {}).terminal
  );
  if (existing) {
    existing.reportCount += 1;
    existing.reasons = Array.from(new Set([...existing.reasons, reason]));
    existing.slaHours = Math.min(existing.slaHours, slaHours);
    existing.updatedAt = now;
    await write(items);
    await record("moderation.report_merged", { caseId: existing.id, reason });
    return existing;
  }

  const item = {
    id: `case-${now}-${Math.random().toString(36).slice(2, 7)}`,
    source, kind, targetId, title, shopId, shopName,
    reasons: [reason], detail, reportedBy, marketCode,
    reportCount: 1,
    state: "pending",
    slaHours,
    createdAt: now,
    updatedAt: now,
    decision: null,
    appeal: null,
  };
  items.unshift(item);
  await write(items);
  await record("moderation.enqueued", { caseId: item.id, reason, targetId });
  return item;
}

/**
 * The cases this person filed. Never the queue.
 *
 * Falls back to the device copy filtered the same way, so a report made offline
 * still appears — and so the screen means the same thing in both modes.
 */
export async function myReports() {
  if (remote.isConfigured()) {
    try { return (await remote.myCases()).map(fromServer); }
    catch (e) { console.warn("my reports fell back to the device:", e && e.message); }
  }
  const items = await read();
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function listQueue({ state, overdueOnly } = {}) {
  if (serverQueue) {
    try {
      const rows = await remote.listCases(state || null);
      let items = (rows || []).map(fromServer);
      // The queue rows carry no decision. An appealed case needs the decision
      // under appeal and the seller's grounds, or there is nothing to weigh.
      if (items.some((i) => i.state === "appealed")) {
        const appeals = await remote.moderationAppeals().catch(() => []);
        const byId = new Map(appeals.map((a) => [a.id, a]));
        items = items.map((i) => {
          const a = byId.get(i.id);
          return a ? { ...i, decision: { ...(a.decision || {}), decidedBy: a.decided_by },
                       appeal: a.appeal || null } : i;
        });
      }
      if (overdueOnly) items = items.filter(isOverdue);
      lastServerList = items;
      return items;              // the RPC already sorts overdue-first
    } catch (e) {
      console.warn("moderation queue fell back to the device:", e && e.message);
    }
  }
  let items = await read();
  if (state) items = items.filter((i) => i.state === state);
  if (overdueOnly) items = items.filter(isOverdue);
  // Overdue first, then most-reported, then oldest.
  return items.sort((a, b) =>
    (isOverdue(b) - isOverdue(a)) ||
    (b.reportCount - a.reportCount) ||
    (a.createdAt - b.createdAt)
  );
}

export function dueAt(item) {
  return item.dueAtMs || (item.createdAt + item.slaHours * 3600e3);
}
export function isOverdue(item) {
  // An unknown state must not crash the queue. It would have: STATES[state] was
  // read without a guard, so one unfamiliar value from the server would take
  // the whole screen down with "cannot read properties of undefined".
  const st = STATES[item.state];
  if (st && st.terminal) return false;
  if (typeof item.serverOverdue === "boolean") return item.serverOverdue;
  return Date.now() > dueAt(item);
}
export function hoursLeft(item) {
  return Math.round((dueAt(item) - Date.now()) / 3600e3);
}

export async function claim(caseId, moderator = "moderator") {
  if (serverQueue) {
    await remote.claimCase(caseId);
    await record("moderation.claimed", { caseId, remote: true });
    return { id: caseId, state: "reviewing" };
  }
  return patch(caseId, (i) => {
    i.state = "reviewing";
    i.claimedBy = moderator;
  }, "moderation.claimed");
}

/**
 * The decision. Produces a statement of reasons for both sides — the EU DSA
 * requires one, and every other market benefits from the same discipline: a
 * decision you cannot explain in a sentence is usually the wrong decision.
 */
export async function decide(caseId, actionKey, note, sellerStrikesBefore = 0) {
  const action = ACTIONS[actionKey];
  if (!action) throw new Error(`Unknown moderation action: ${actionKey}`);

  if (serverQueue) {
    // The server composes the statement of reasons, applies the strike, updates
    // the listing and the shop, and writes the audit row — all in one
    // transaction. It also refuses a reason under ten characters, because that
    // statement is delivered to both parties and is the point of the process.
    const res = await remote.decideCase(caseId, actionKey, note || "");
    await record("moderation.decided", { caseId, action: actionKey, remote: true });
    return {
      id: caseId,
      state: actionKey === "dismiss" ? "dismissed" : "upheld",
      decision: {
        action: actionKey,
        label: (res && res.decision && res.decision.label) || action.label,
        note: (note || "").slice(0, 2000),
        at: Date.now(),
        strikeApplied: action.strike,
        statementToReporter: res && res.statement_of_reasons && res.statement_of_reasons.to_reporter,
        statementToSeller:  res && res.statement_of_reasons && res.statement_of_reasons.to_seller,
        appealable: action.strike > 0,
        appealWindowDays: 14,
      },
    };
  }

  const strikesAfter = sellerStrikesBefore + action.strike;
  const decision = {
    action: actionKey,
    label: action.label,
    note: (note || "").slice(0, 2000),
    at: Date.now(),
    strikeApplied: action.strike,
    strikesAfter,
    consequence: action.strike ? strikeOutcome(strikesAfter) : "No action",
    statementToReporter: action.reporterMsg + (note ? ` ${note}` : ""),
    statementToSeller: action.sellerMsg ? action.sellerMsg + (note ? ` ${note}` : "") : null,
    appealable: action.strike > 0,
    appealWindowDays: 14,
  };

  return patch(caseId, (i) => {
    i.state = actionKey === "dismiss" ? "dismissed" : "upheld";
    i.decision = decision;
  }, "moderation.decided", { action: actionKey, strikesAfter });
}

/**
 * Counter-notice. On the server only the person the decision is about can
 * appeal (lili_moderation_appeal); the device copy keeps the old behaviour.
 */
export async function appeal(caseId, grounds) {
  if (serverQueue) return remote.appealDecision(caseId, grounds);
  return patch(caseId, (i) => {
    i.state = "appealed";
    i.appeal = { grounds: (grounds || "").slice(0, 2000), at: Date.now(), outcome: null };
  }, "moderation.appealed");
}

export async function resolveAppeal(caseId, uphold, note) {
  if (serverQueue) {
    // A moderator other than the one who decided; overturning removes the
    // strike and restores what it took (lili_moderation_resolve_appeal).
    const res = await remote.resolveAppeal(caseId, !uphold, note || "");
    await record("moderation.appeal_resolved", { caseId, uphold, remote: true });
    return { id: caseId, state: uphold ? "upheld" : "overturned", remote: true, res };
  }
  return patch(caseId, (i) => {
    i.state = uphold ? "upheld" : "overturned";
    i.appeal = { ...(i.appeal || {}), outcome: uphold ? "upheld" : "overturned",
                 note, resolvedAt: Date.now() };
    if (!uphold && i.decision) {
      i.decision.strikeApplied = 0;
      i.decision.strikesAfter = Math.max(0, i.decision.strikesAfter - 1);
      i.decision.consequence = "Reversed on appeal";
    }
  }, "moderation.appeal_resolved", { uphold });
}

/** Strikes that actually count: upheld, not overturned, not under appeal. */
export async function sellerStrikes(shopId) {
  const items = await read();
  return items.filter(
    (i) => i.shopId === shopId && i.state === "upheld" && i.decision?.strikeApplied > 0
  ).length;
}

export async function sellerStanding(shopId) {
  const strikes = await sellerStrikes(shopId);
  return { shopId, strikes, consequence: strikeOutcome(strikes),
           window: STRIKE_POLICY.window };
}

export async function caseById(id) {
  if (serverQueue) {
    const found = lastServerList.find((i) => i.id === id);
    if (found) return found;
    const fresh = await listQueue({});
    return fresh.find((i) => i.id === id) || null;
  }
  return (await read()).find((i) => i.id === id) || null;
}

/**
 * The conversation a reporter chose to attach, if she attached one.
 *
 * Reading it writes an audit row on the server. That is deliberate and it is
 * why this is not folded into caseById — opening a case should not silently
 * count as reading someone's private messages.
 */
export async function caseTranscript(id) {
  if (!serverQueue) return { attached: false };
  try { return await remote.caseTranscript(id); }
  catch (e) { return { attached: false, error: e && e.message }; }
}

export async function queueStats() {
  const items = serverQueue ? (lastServerList.length ? lastServerList : await listQueue({}))
                            : await read();
  const open = items.filter((i) => !(STATES[i.state] || {}).terminal);
  return {
    total: items.length,
    open: open.length,
    overdue: open.filter(isOverdue).length,
    pending: items.filter((i) => i.state === "pending").length,
    appealed: items.filter((i) => i.state === "appealed").length,
    decided: items.filter((i) => (STATES[i.state] || {}).terminal).length,
  };
}

async function patch(caseId, mutate, event, extra = {}) {
  const items = await read();
  const item = items.find((i) => i.id === caseId);
  if (!item) throw new Error(`No moderation case ${caseId}`);
  mutate(item);
  item.updatedAt = Date.now();
  await write(items);
  await record(event, { caseId, state: item.state, ...extra });
  return item;
}

// ─────────────────────────────────────────────────────────────────────────────
//  SERVER CONTRACT
//
//  Swap `read` and `write` for these and the queue becomes real. Everything
//  else in this file is already the right shape.
// ─────────────────────────────────────────────────────────────────────────────
export const SERVER_CONTRACT = {
  "POST /moderation/cases": "enqueue — returns the case, merging duplicates by targetId",
  "GET  /moderation/cases": "listQueue — filter by state, sort overdue first",
  "POST /moderation/cases/:id/claim": "claim — assigns a moderator, prevents double work",
  "POST /moderation/cases/:id/decide": "decide — writes the decision and notifies both parties",
  "POST /moderation/cases/:id/appeal": "appeal — seller counter-notice",
  "POST /moderation/cases/:id/appeal/resolve": "resolveAppeal",
  "GET  /sellers/:shopId/standing": "sellerStrikes — strikes that count",
  notes: [
    "Decisions must be immutable once written. Correct by adding a new record.",
    "The server timestamp is authoritative — never trust the device clock for SLA.",
    "Notifications to reporter and seller are the server's job, not the client's.",
    "Moderator identity must come from an authenticated session, not a parameter.",
  ],
};
