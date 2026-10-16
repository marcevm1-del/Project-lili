// ─────────────────────────────────────────────────────────────────────────────
//  AUTHENTICATION — the seam, and the reason it is empty
//
//  Nobody authenticates anything on lili. There is no partner, no in-house
//  expert, no model. This file is the shape of the workflow and a refusal in
//  every method until there is.
//
//  ── screening is not authentication, and the difference is the whole file
//
//  `compliance/listingRules.js` screens a listing: it looks at the brand, the
//  price, the words, and flags what a counterfeit LOOKS like — an Hermès bag at
//  AED 400, "100% authentic guaranteed", a model that does not exist. That is
//  useful and it is real and it runs on every publish.
//
//  It is not authentication. Screening reads a listing; authentication reads
//  the OBJECT. One is a heuristic about a description, the other is a person
//  holding a bag. Collapsing them is the single most tempting shortcut in
//  resale software and it is fraud in a nice font: a buyer who is told a piece
//  is authenticated has been told a human expert examined it.
//
//  ── what this replaced
//
//  Until v2.10 every listing detail rendered a tick and the word VERIFIED.
//  Unconditionally: no argument, no condition, nothing behind it. The listing
//  flow's own authentication step said plainly that verification was not
//  available — and two screens away the app stamped VERIFIED on everything.
//
//  ── the rules any implementation has to keep
//
//    1. A verdict has an AUTHOR. Who decided, when, and on what evidence. A
//       verdict with no author is an opinion with a badge on it.
//    2. "Inconclusive" is a first-class outcome and must be shown as itself.
//       An authenticator who cannot tell is the normal case for a photograph,
//       and rounding it to "authentic" is how the whole thing becomes
//       worthless.
//    3. lili never says "we verified this". It says who did. lili is not the
//       authenticator and must not inherit the claim.
//    4. A verdict is about ONE physical object at ONE moment. It does not
//       transfer to a relisting, and it does not survive the piece changing
//       hands.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} Authenticator
 * @property {string} name        who they are — shown to the buyer, by name
 * @property {string} basis       "physical inspection" | "photograph review"
 * @property {string} accountable a named person or company answerable for a verdict
 * @property {(args: {itemId: string, photos: string[], provenance: string[]})
 *            => Promise<Verdict>} assess
 */

/**
 * @typedef {object} Verdict
 * @property {"authentic"|"not-authentic"|"inconclusive"} outcome
 * @property {string} by          the authenticator's name
 * @property {string} at          ISO timestamp
 * @property {string} basis       what they actually looked at
 * @property {string} reasoning   in words a buyer can read
 */

export const OUTCOMES = {
  authentic: {
    key: "authentic",
    label: "Examined and found genuine",
    // Not "Verified". The badge says who and how, or it does not go up.
    needsAuthor: true,
  },
  "not-authentic": {
    key: "not-authentic",
    label: "Examined and found not genuine",
    needsAuthor: true,
    // A listing with this verdict does not stay up. That is a moderation
    // action, taken through compliance/moderation.js, with an audit row.
    removesListing: true,
  },
  inconclusive: {
    key: "inconclusive",
    label: "Examined, and could not be decided from what was available",
    needsAuthor: true,
    // The honest common case, and the one a system under commercial pressure
    // quietly stops reporting.
    showsAsItself: true,
  },
};

export const READINESS = [
  { id: "who",
    what: "A named authenticator — a company or a person — under contract",
    why: "A verdict has to be attributable to somebody who can be asked about it." },
  { id: "basis",
    what: "Whether they examine the object or only photographs, stated to the buyer",
    why: "These are different claims and a buyer prices them differently." },
  { id: "liability",
    what: "Who is liable when a verdict is wrong",
    why: "If it is lili, that is a business lili is not in. If it is the " +
         "authenticator, the buyer needs to know that before she relies on it." },
  { id: "inconclusive",
    what: "A commercial arrangement that does not punish 'inconclusive'",
    why: "Pay per verdict and inconclusive disappears within a month." },
  { id: "chain",
    what: "How a verdict is tied to one physical object",
    why: "A verdict that follows a listing rather than an item is a verdict " +
         "that can be relisted onto a different bag." },
  { id: "appeal",
    what: "What a seller can do about a wrong 'not genuine'",
    why: "It removes her listing and it is an accusation. She gets a route." },
];

let authenticator = null;

export function registerAuthenticator(impl) {
  const required = ["name", "basis", "accountable", "assess"];
  const missing = required.filter((k) => impl == null || impl[k] == null);
  if (missing.length) throw new Error(`Authenticator is missing: ${missing.join(", ")}`);
  authenticator = impl;
  return authenticator;
}

export const getAuthenticator = () => authenticator;

/** Is there anybody to do this? Every screen that mentions it must ask first. */
export const authenticationAvailable = () => !!authenticator;

/**
 * Submit a piece. Refuses while nobody is registered — loudly, because a
 * silent no-op here is a seller who thinks her bag is being examined.
 */
export async function submitForAuthentication({ itemId, photos = [], provenance = [] }) {
  if (!authenticator) {
    const err = new Error(
      "Nobody authenticates pieces on lili. Screening a listing for counterfeit " +
      "signals is not the same thing and must not be described as if it were."
    );
    err.code = "NO_AUTHENTICATOR";
    throw err;
  }
  const verdict = await authenticator.assess({ itemId, photos, provenance });
  return sealVerdict(verdict);
}

/**
 * Refuse to hand back a verdict that cannot be attributed.
 *
 * The check that matters: an implementation returning `{outcome: "authentic"}`
 * and nothing else is exactly the badge this file replaced. It does not get to
 * exist just because an adapter produced it.
 */
export function sealVerdict(v) {
  if (!v || !OUTCOMES[v.outcome]) throw new Error("Not a verdict: unknown outcome");
  if (!v.by || !v.at || !v.basis)
    throw new Error("A verdict must say who decided it, when, and on what basis");
  return Object.freeze({ ...v, platform: "lili is not the authenticator" });
}

/**
 * What a buyer is shown. Null while nobody authenticates anything, which is
 * the point: a component asks this and gets nothing to render, rather than
 * being trusted to remember that the feature does not exist.
 */
export function badgeFor(verdict) {
  if (!authenticator || !verdict) return null;
  const o = OUTCOMES[verdict.outcome];
  if (!o) return null;
  return { label: o.label, by: verdict.by, at: verdict.at, basis: verdict.basis };
}

export default {
  OUTCOMES, READINESS, registerAuthenticator, getAuthenticator,
  authenticationAvailable, submitForAuthentication, sealVerdict, badgeFor,
};
