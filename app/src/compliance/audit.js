// ── audit trail ────────────────────────────────────────────────────────────
// Consent decisions, reports, and erasure requests have to be *evidenced*, not
// just honoured — a regulator asking "prove this user consented on this date to
// this policy version" needs an answer.
//
// This writes locally. That is enough to prove the flow works and to let a user
// see their own history, but it is not a compliance record: it lives on one
// device and the user can wipe it. When the backend lands, mirror every entry
// server-side with a server timestamp — that copy is the one that counts.
import { getJSON, setJSON, getJSON as g } from "./store.js";

const KEY = "lili.audit.v1";
const MAX = 500;

export async function record(type, detail = {}) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    at: new Date().toISOString(),
    detail,
    synced: false,      // flips true once the backend has its own copy
  };
  const log = await getJSON(KEY, []);
  log.unshift(entry);
  await setJSON(KEY, log.slice(0, MAX));
  return entry;
}

export const readLog = () => getJSON(KEY, []);

export async function clearLog() { await setJSON(KEY, []); }

/** Everything this device holds about the user, for a data-access request. */
export async function exportAll() {
  return {
    exportedAt: new Date().toISOString(),
    note:
      "Generated on-device. Once accounts exist, the server holds the " +
      "authoritative copy and this export must be produced there.",
    consent: await g("lili.consent.v1", null),
    age: await g("lili.age.v1", null),
    market: await g("lili.market.v1", null),
    blockedSellers: await g("lili.blocked.v1", []),
    activity: await readLog(),
  };
}
