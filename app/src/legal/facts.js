// ─────────────────────────────────────────────────────────────────────────────
//  THE NUMBERS THE POLICIES QUOTE
//
//  Every figure a policy states lives here and nowhere else in the policy text.
//  `research.test.mjs` checks each one against the code or SQL that actually
//  enforces it, so a policy cannot promise 48 hours while the database expires
//  offers at 24, or promise deletion after 24 months while nothing deletes.
//
//  No imports: this file is read by the app, by the test, and by
//  `policies-build.mjs`, which writes the public HTML pages.
// ─────────────────────────────────────────────────────────────────────────────

/** Who runs lili. Null until the company exists; the policies say so plainly. */
export const OPERATOR = {
  legalName: null,          // e.g. "lili Marketplace FZ-LLC"
  licence: null,            // licensing authority and number
  address: null,            // registered address
  privacyEmail: null,       // a monitored inbox for privacy requests
  rightsEmail: null,        // brand owners' takedown inbox
  governingLaw: "the laws of the United Arab Emirates as applied in the Emirate of Dubai",
};

export const POLICY_VERSION = "2026-10-09";

/** Reviewed by UAE-qualified counsel? The app says so on every policy until it is. */
export const LEGALLY_REVIEWED = false;

export const MARKET = { name: "the United Arab Emirates", currency: "AED" };

export const MIN_AGE = 18;                 // markets.js AE.minAge
export const MIN_PRICE = 200;              // markets.js AE.minListingPrice; lili_items CHECK
export const OFFER_EXPIRY_HOURS = 48;      // data/offers.js EXPIRY_HOURS; lili_offers.expires_at
export const REVIEW_WINDOW_DAYS = 14;      // lili_leave_review, lili_reviews_owed
export const APPEAL_WINDOW_DAYS = 14;      // compliance/moderation.js appealWindowDays
export const NOTICE_DAYS = 30;             // notice before a change to the terms takes effect

/**
 * What lili_moderation_decide does. Strikes are added by the decision and do
 * not expire; three in total closes the shop. compliance/listingRules.js
 * STRIKE_POLICY says the same and the test compares them.
 */
export const STRIKES = {
  ladder: [
    { decision: "Listing removed (with or without a warning)", strikes: 1 },
    { decision: "Seller suspended, so selling is paused until a moderator lifts it", strikes: 2 },
    { decision: "Shop closed", strikes: 3 },
  ],
  closeAt: 3,
};

/** lili_rate_ok(action, limit, window) calls in supabase/migrations */
export const LIMITS = [
  { key: "item.create",  limit: 40,  per: "24 hours", what: "new listings" },
  { key: "offer.make",   limit: 60,  per: "24 hours", what: "offers" },
  { key: "message.send", limit: 60,  per: "1 hour",   what: "messages" },
  { key: "convo.open",   limit: 30,  per: "1 hour",   what: "new conversations" },
  { key: "report.file",  limit: 20,  per: "24 hours", what: "reports" },
  { key: "review",       limit: 20,  per: "1 day",    what: "reviews" },
  { key: "save",         limit: 300, per: "24 hours", what: "saves" },
  { key: "follow",       limit: 100, per: "24 hours", what: "follows" },
  { key: "save_search",  limit: 30,  per: "1 day",    what: "saved searches" },
  { key: "appeal",       limit: 5,   per: "24 hours", what: "appeals" },
];

/**
 * How long things are kept. `sql` names the interval the retention job uses in
 * supabase/pending/20261008_needs_owner_approval.sql, so the test can find it.
 */
export const RETENTION = [
  { what: "Usage analytics (only if you allowed them)", keep: "13 months", sql: "13 months" },
  { what: "Notifications you have read", keep: "90 days after you read them", sql: "90 days" },
  { what: "Crash reports", keep: "90 days", sql: "90 days" },
  { what: "Moderation decisions and the evidence behind them", keep: "24 months from the decision", sql: "24 months" },
  { what: "Rate-limit counters", keep: "7 days", sql: null },
  { what: "Everything else in your account", keep: "Until you delete it or delete your account", sql: null },
];

/** Who processes data for lili. */
export const PROCESSORS = [
  { name: "Supabase", role: "Database, sign-in and photo storage", where: "European Union (Stockholm, Sweden)" },
  { name: "Google", role: "Sign-in, only if you choose “Continue with Google”", where: "Google's own infrastructure" },
];
