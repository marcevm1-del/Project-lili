import * as remote from "../backend/remote.js";
import { ESTIMATED_RATES } from "./carriers.js";

// Courier fees from the database, or the seeded estimates when it can't be
// reached within a few seconds. Asked once per launch.
let cached = null;
export function loadRates() {
  if (!cached) {
    const live = remote.isConfigured()
      ? Promise.race([remote.deliveryRates(), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 6000))])
      : Promise.reject(new Error("offline"));
    cached = live.then((r) => (r && r.length ? r : ESTIMATED_RATES)).catch(() => {
      // use the estimates now, and ask the database again in a minute
      setTimeout(() => { cached = null; }, 60000);
      return ESTIMATED_RATES;
    });
  }
  return cached;
}
