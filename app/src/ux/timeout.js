// ─────────────────────────────────────────────────────────────────────────────
//  BOUNDED WAITS
//
//  Every network call this app makes on a user's behalf has to end. Dubai
//  mobile data, hotel wifi that accepts a connection and then blackholes it, a
//  phone that has drifted out of signal — none of those produce an error. They
//  produce silence, and a promise that never settles.
//
//  repo.js already knew this and gave the feed a 1,200 ms budget: "never block
//  the first paint on the network". The screens added in v2.8 did not, and it
//  showed the moment one ran without a reachable server — the notifications
//  sheet sat on "Loading…" forever, with nothing to tap and nothing to read.
//
//  A spinner with no end is the least honest state in an interface. It says
//  "nearly there" indefinitely.
// ─────────────────────────────────────────────────────────────────────────────

/** How long to wait before admitting we cannot reach lili. */
export const BUDGET = {
  // She tapped something and is watching. Long enough for a slow 3G round trip,
  // short enough that she is not left guessing.
  interactive: 6000,
  // Background refresh. Nobody is waiting, so fail fast and try again later.
  background: 4000,
  // She has finished an action and is waiting to be told it worked, on a path
  // where failure is NOT fatal — the device copy already holds it. Acknowledge
  // fast and be honest about what has not reached us yet.
  acknowledge: 2500,
};

export class TimeoutError extends Error {
  constructor(ms) {
    super(`No answer within ${ms}ms`);
    this.name = "TimeoutError";
    this.code = "TIMEOUT";
  }
}

/**
 * Resolve with the promise, or reject with a TimeoutError. The underlying
 * request is not cancelled — it may still land — but the interface stops
 * waiting for it, which is the part the person can see.
 */
export function withTimeout(promise, ms = BUDGET.interactive) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new TimeoutError(ms)), ms); }),
  ]);
}

export const isTimeout = (e) => !!e && (e.code === "TIMEOUT" || e.name === "TimeoutError");

/**
 * Is this the server saying "slow down"?
 *
 * Postgres raises 53400 (configuration_limit_exceeded) from the rate-limit
 * triggers, and the message is already written for a person to read — see
 * migration lili_abuse_limits. Showing it beats replacing it with something
 * vaguer, so this only identifies the case; the caller shows `e.message`.
 */
export const isRateLimited = (e) =>
  !!e && (e.code === "53400" || /a lot of (messages|listings|reports|offers|conversations)/i.test(String(e.message || "")));

/** Already reported, and still being looked at. */
export const isDuplicate = (e) =>
  !!e && (e.code === "23505" || /already reported this/i.test(String(e.message || "")));
