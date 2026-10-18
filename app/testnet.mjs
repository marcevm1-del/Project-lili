// ─────────────────────────────────────────────────────────────────────────────
//  THE SUITES DO NOT TALK TO THE LIVE PROJECT
//
//  From v2.10.1 the app connects to Supabase on a cold start rather than
//  waiting for an account — which is the fix that makes browsing live for
//  everybody. The side effect showed up immediately: every headless suite
//  started opening real connections to the production project on every page
//  load. A hundred of them in one `npm run verify`, and the run timed out.
//
//  Three separate reasons that is wrong, and only the first is about speed:
//
//    · SLOW AND FLAKY. A visual regression suite that depends on a round trip
//      to Stockholm is measuring the network, not the layout.
//    · IT WRITES. Analytics events, rate-limit rows, auth attempts. A test run
//      should not appear in the funnel of a live product.
//    · IT HIDES THE THING BEING TESTED. Every one of these suites exists to
//      check the app's OWN behaviour — its offline fallbacks most of all. If
//      the server answers, the fallback path is never exercised, and the suite
//      quietly stops testing what it was written for.
//
//  So the default is offline, deliberately and in one place. `npm run
//  preflight` and `npm run funnel` are the tools that DO talk to the project,
//  and they say so in their names.
//
//  Set LILI_TEST_ONLINE=1 to let a suite through to the real backend, for the
//  rare case where that is the point.
// ─────────────────────────────────────────────────────────────────────────────

/** Everything the app might reach out to. Anything else is already refused
 *  by the page's own Content-Security-Policy. */
const BLOCKED = [
  "**://*.supabase.co/**",
  "**://*.supabase.in/**",
  "**://api.pwnedpasswords.com/**",
];

/**
 * Cut a Playwright context off from the network.
 *
 * Aborts rather than stubbing: the app is built to survive a backend that does
 * not answer, and that is exactly the state these suites should be checking.
 * A stub would test a fiction of the server instead.
 *
 * @param {import("playwright").BrowserContext} ctx
 * @returns {Promise<boolean>} true when the block is in place
 */
export async function offline(ctx) {
  if (process.env.LILI_TEST_ONLINE === "1") return false;
  for (const pattern of BLOCKED) {
    await ctx.route(pattern, (route) => route.abort("blockedbyclient"));
  }
  return true;
}

export default offline;
