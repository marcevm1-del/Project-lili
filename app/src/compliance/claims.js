// ─────────────────────────────────────────────────────────────────────────────
//  THE CLAIMS REGISTER
//
//  Every promise this app makes to a buyer or a seller, and the thing that
//  makes it true.
//
//  ── why this file exists
//
//  Seven separate surfaces claimed lili holds the buyer's payment. They were
//  found one at a time, over three releases, each by accident: four in v2.9
//  while auditing the fee schedule, the cart in v2.9.4 while chasing an
//  asymmetric dictionary entry, and the seller agreement and the dispute route
//  in the same afternoon only because that discovery prompted a proper grep.
//
//  Finding the eighth by accident is not a plan. So: one list, and a rule.
//
//  ── the rule
//
//  A claim may appear in the interface only if it is in this list, and it may
//  be in this list only if `enforcedBy` names a real symbol in a real file that
//  makes it true. `npm run research` reads every entry, opens every file, and
//  fails the build if a named symbol has gone. A promise whose enforcement is
//  deleted therefore breaks the build rather than becoming a lie quietly.
//
//  `state` is the honest part:
//
//    · "enforced"  — something in the code or the database makes this happen.
//    · "intended"  — this is the design and it is NOT built. Nothing in the
//                    interface may say it in the present tense. These entries
//                    exist so the plan is written down somewhere that is
//                    audited, rather than remembered.
//
//  ── and the other half
//
//  `NEVER_CLAIM` is the list of sentences that must not appear anywhere, in
//  either language, while the thing behind them does not exist. The research
//  suite runs those patterns over every source file and every dictionary
//  string. This file is excluded from that scan, and it has to be: an earlier
//  honesty grep in this project matched its own advice and failed on the
//  comment explaining it.
// ─────────────────────────────────────────────────────────────────────────────

import { PAYMENTS_LIVE } from "./sellerRules.js";

/**
 * @typedef {object} Claim
 * @property {string} id
 * @property {"buyer"|"seller"|"both"} to     who is told
 * @property {string} says                    the promise, in the words she reads
 * @property {"enforced"|"intended"} state
 * @property {{file: string, symbol: string}[]} enforcedBy
 * @property {string} how                     what actually makes it true
 */

/** @type {Claim[]} */
export const CLAIMS = [
  // ── money ────────────────────────────────────────────────────────────────
  {
    id: "no-money-held",
    to: "both",
    says: "lili does not handle your money. You pay her in person when you meet.",
    state: "enforced",
    enforcedBy: [
      { file: "src/compliance/sellerRules.js", symbol: "HOW_MONEY_WORKS" },
      { file: "src/compliance/sellerRules.js", symbol: "PAYMENTS_LIVE" },
    ],
    how: "There is no processor, no account and no code path that moves money. " +
         "Every screen that mentions payment reads HOW_MONEY_WORKS, which is one " +
         "object branched on a single flag, so the surfaces cannot drift apart.",
  },
  {
    id: "no-refund-from-lili",
    to: "buyer",
    says: "lili holds no money, so there is nothing for us to refund.",
    state: "enforced",
    enforcedBy: [{ file: "src/compliance/sellerRules.js", symbol: "ifWrong" }],
    how: "Stated on the same object as the sentence above. What lili can do " +
         "instead — remove a listing, close a shop — is enforced, and listed below.",
  },
  {
    id: "seller-fee-9",
    to: "seller",
    says: "lili takes 9% of the sale price.",
    state: "intended",
    enforcedBy: [
      { file: "src/data/fees.js", symbol: "COMMISSION_BANDS" },
      { file: "src/data/fees.js", symbol: "COLLECTION_LIVE" },
    ],
    how: "The rate is defined and the payout arithmetic is tested, but nothing " +
         "charges it, because there are no payouts. The listing flow shows it as " +
         "what she WOULD receive. It must never be phrased as money already taken.",
  },

  {
    id: "no-shipping",
    to: "both",
    says: "There is no shipping. You arrange to meet, and the piece changes hands there.",
    state: "enforced",
    enforcedBy: [{ file: "src/compliance/sellerRules.js", symbol: "SHIPPING" }],
    how: "SHIPPING.live is false: no carrier account, no label, no tracking " +
         "number, no clock, no returns window. Added in v2.10 after the register " +
         "found the Legal Centre still telling a buyer the seller 'packs and " +
         "ships it, and handles the return' — the eighth false claim, and the " +
         "first one found on purpose rather than by accident.",
  },

  // ── moderation ───────────────────────────────────────────────────────────
  {
    id: "reports-are-read",
    to: "both",
    says: "Report a listing or a seller and a person reads it.",
    state: "enforced",
    enforcedBy: [
      { file: "src/compliance/moderation.js", symbol: "enqueue" },
      { file: "src/backend/remote.js", symbol: "myCases" },
    ],
    how: "A report is a row. It lands in a queue a moderator opens, and the " +
         "reporter can see her own cases — and only her own, by policy, not by " +
         "a filter in the client.",
  },
  {
    id: "listing-screen",
    to: "seller",
    says: "Some listings are held for review before they appear.",
    state: "enforced",
    enforcedBy: [{ file: "src/compliance/listingRules.js", symbol: "screenListing" }],
    how: "screenListing runs on every publish and can return a review verdict. " +
         "The seller is told which rule, in words, at the moment it happens.",
  },
  {
    id: "shop-can-be-closed",
    to: "seller",
    says: "Breaking the selling rules can get a listing removed or a shop closed.",
    state: "enforced",
    enforcedBy: [
      { file: "src/compliance/moderation.js", symbol: "ACTIONS" },
      { file: "src/compliance/moderation.js", symbol: "decide" },
    ],
    how: "The actions exist, a moderator can take them, and each writes an " +
         "audited row rather than only changing what is on screen.",
  },

  // ── her data ─────────────────────────────────────────────────────────────
  {
    id: "export-my-data",
    to: "both",
    says: "You can get a copy of everything lili holds about you.",
    state: "enforced",
    enforcedBy: [{ file: "src/backend/remote.js", symbol: "exportMe" }],
    how: "A SECURITY DEFINER function reads every table that carries her id and " +
         "returns it as one document. PDPL art. 15.",
  },
  {
    id: "delete-my-account",
    to: "both",
    says: "You can delete your account, and it is actually deleted.",
    state: "enforced",
    enforcedBy: [
      { file: "src/backend/remote.js", symbol: "eraseMe" },
      { file: "src/data/repo.js", symbol: "reset" },
    ],
    how: "Erasure covers every table, not one of them, and the receipt names the " +
         "row counts. The device copy is cleared in the same action, which it " +
         "was not before v2.9. PDPL art. 16.",
  },
  {
    id: "no-tracking-without-consent",
    to: "both",
    says: "Nothing about how you use the app is collected unless you agree to it.",
    state: "enforced",
    enforcedBy: [
      { file: "src/analytics/funnel.js", symbol: "termIsCollectable" },
      { file: "src/analytics/funnel.js", symbol: "track" },
    ],
    how: "Every event passes a consent gate before it is queued, and a search " +
         "term carrying a digit or an @ is refused outright in either script — " +
         "a phone number typed into a search box is not analytics.",
  },

  // ── the catalogue ────────────────────────────────────────────────────────
  {
    id: "prices-are-hers",
    to: "buyer",
    says: "The price you see is the price she set.",
    state: "enforced",
    enforcedBy: [{ file: "src/backend/remote.js", symbol: "SERVER_OWNED" }],
    how: "Counts and derived columns are owned by the server through column-level " +
         "GRANTs, so a client writing to them is REFUSED rather than silently " +
         "ignored. The price column belongs to the seller and to nobody else.",
  },
  {
    id: "offers-expire",
    to: "both",
    says: "An offer expires if it isn't answered.",
    state: "enforced",
    enforcedBy: [{ file: "src/backend/remote.js", symbol: "makeOffer" }],
    how: "Expiry is a database column and a pg_cron job that sweeps hourly. It " +
         "does not depend on either phone being open.",
  },
  {
    id: "block-removes-everywhere",
    to: "buyer",
    says: "Block a seller and you stop seeing her, everywhere in the app.",
    state: "enforced",
    enforcedBy: [{ file: "src/compliance/ComplianceProvider.jsx", symbol: "blockSeller" }],
    how: "One list on the compliance context, read by every surface that renders " +
         "a listing, asserted by the functional suite across the feed, search and " +
         "shops.",
  },

  // ── meeting ──────────────────────────────────────────────────────────────
  {
    id: "meet-advice-only",
    to: "both",
    says: "Meet somewhere public and busy. These are the qualities to look for.",
    state: "enforced",
    enforcedBy: [{ file: "src/meet/places.js", symbol: "CRITERIA" }],
    how: "Criteria and kinds of place, never a named address and never an " +
         "endorsement. There is no Dubai Police safe-exchange-zone programme — " +
         "this was checked — so nothing may imply one exists.",
  },
];

/**
 * Sentences that must not appear anywhere while the thing behind them does not
 * exist. Run over every source file and every dictionary string by the research
 * suite. Each one is here because it was found in the interface, not because it
 * seemed possible.
 */
export const NEVER_CLAIM = [
  { id: "holds-payment", re: /\b(we|lili|the platform)\s+(hold|holds|will hold)\s+(your|the)\s+(payment|money|funds)/i,
    because: "Found on seven surfaces across three releases. There is no processor." },
  { id: "money-back", re: /\b(you (will )?get your money back|money[- ]back guarantee|full refund from (us|lili))/i,
    because: "lili holds nothing, so it can refund nothing." },
  { id: "we-ship", re: /\b(we|lili)\s+(ship|ships|will ship|deliver|delivers)\b/i,
    because: "There is no shipping integration, no label and no carrier." },
  { id: "tracking", re: /\b(tracking number|with tracking|track your (order|parcel|delivery))/i,
    because: "Nothing generates a tracking number." },
  { id: "order-placed", re: /\border placed\b|\bseller has been notified\b/i,
    because: "The cart said this while writing nothing and telling nobody." },
  { id: "authenticated", re: /\b(every item is|all items are|items are)\s+(authenticated|verified as authentic)/i,
    because: "There is no authenticator. Screening for counterfeit signals is not authentication." },
  { id: "verified-badge", re: /\bVERIFIED\b(?!\s*(&|and)\s*payouts)/,
    because: "Rendered on every listing detail until v2.10 with nothing behind it. " +
             "A badge with no author is the most expensive false claim a resale app can make." },
  { id: "police-zone", re: /\b(police[- ](approved|endorsed|designated)|safe[- ]exchange zone)/i,
    because: "Verified: no such programme exists in Dubai." },
  { id: "returns", re: /\b(free returns|no[- ]quibble returns|return it within|returns? (are|is) accepted)\b/i,
    because: "There is no returns window and nothing to enforce one with." },
  { id: "escrow-present-tense", re: /\bpayment is held in escrow\b|\bfunds are held\b/i,
    because: "Escrow is the design, not the present tense." },

  // v2.11.3. `verified-badge` above is deliberately case-sensitive, because the
  // badge it was written to kill rendered the word in capitals. That let the
  // lower-case form live on: three pills on the listing detail page reading
  // "Buyer Protection · Secure Payment · Verified Seller", and a store listing
  // promising "verified seller shops with ratings and reviews". The pills were
  // two lines above the notice saying lili is not the merchant.
  { id: "seller-verified", re: /\bverified sellers?\b|\bverified seller shops?\b|\bseller (is verified|verification is)\b/i,
    because: "Nobody verifies a seller. trust/authentication.js refuses to issue " +
             "a badge while no authenticator is registered — and a pill in a row " +
             "of pills was issuing one anyway." },
  { id: "reviews-that-do-not-exist", re: /\bratings and reviews\b|\bwith ratings\b|\bread reviews\b/i,
    because: "There are no reviews. The fabricated 4.9 from '2,000+ reviews' came " +
             "out in v2.8; the store copy was still promising them three years of " +
             "releases later." },
  { id: "buy-outright", re: /\bbuy (it )?outright\b|\bbuy now and\b|\bcheckout securely\b/i,
    because: "You cannot buy. The payments seam refuses every call while no " +
             "processor is registered, so any sentence with a completed purchase " +
             "in it describes something that cannot happen." },
];

/**
 * A claim in the interface with nothing behind it. Should always be empty; the
 * research suite asserts it, and this function is what a person can call to
 * check by hand.
 */
export const unenforced = () =>
  CLAIMS.filter((c) => c.state === "enforced" && c.enforcedBy.length === 0);

/** What she is promised right now, in the state the app is actually in. */
export const liveClaims = (to) =>
  CLAIMS.filter((c) => c.state === "enforced" && (c.to === "both" || c.to === to));

/**
 * The plan, kept separate from the present tense on purpose. `PAYMENTS_LIVE`
 * decides whether the money entries have moved from one list to the other, so
 * this cannot report a payout system that isn't switched on.
 */
export const intendedClaims = () =>
  CLAIMS.filter((c) => c.state === "intended" && !(c.id === "seller-fee-9" && PAYMENTS_LIVE));

export default CLAIMS;
