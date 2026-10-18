// ─────────────────────────────────────────────────────────────────────────────
//  MARKET REGISTRY
//
//  One entry per country. `status` is the switch that decides whether the app
//  opens at all:
//
//    "live"    — counsel has cleared it, licences held, app fully available
//    "waitlist"— rules mapped, not yet cleared. App shows a waitlist screen.
//    "blocked" — will not serve. App shows a closed screen.
//
//  NOTHING here is legal advice, and none of it is a substitute for local
//  counsel. It is an engineering surface: it makes each market's rules a
//  configuration value instead of an assumption buried in the UI, so when a
//  lawyer tells you a number, there is exactly one place to change it.
//
//  Every market starts at "waitlist". Flip one to "live" only when the
//  `readiness` list below it is genuinely all true.
// ─────────────────────────────────────────────────────────────────────────────

export const POLICY_VERSION = "2026-08-12";   // bump to re-prompt every user

const base = {
  status: "waitlist",
  minAge: 18,
  currency: "USD",
  locales: ["en"],
  requiresLocalLanguage: false,
  consent: { model: "opt-in", granular: true, preTickedAllowed: false },
  cooloffDays: 0,
  dataResidency: null,
  crossBorderTransfer: "restricted",
  breachNotifyHours: 72,
  escrowByPlatform: false,

  // ── intermediary-specific ────────────────────────────────────────────────
  deemedSupplierVAT: false,   // does the platform owe tax on the seller's sale?
  sellerIncomeReporting: null,// must we report seller earnings to a tax body?
  traderVerification: false,  // must we verify business sellers' identity?
  privateSellersAllowed: true,
  platformLicenceActivity: null,

  // consumer protection
  returnWindowDays: 0,          // statutory, business sellers
  warrantyMonths: 0,
  minListingPrice: null,

  readiness: [],
};

export const MARKETS = {
  // ── UNITED ARAB EMIRATES ──────────────────────────────────────────────────
  AE: {
    ...base,
    code: "AE",
    name: "United Arab Emirates",
    nameLocal: "الإمارات العربية المتحدة",
    status: "waitlist",           // ← flip to "live" once readiness is true
    currency: "AED",
    locales: ["en", "ar"],
    requiresLocalLanguage: true,  // consumer terms need Arabic
    minAge: 18,
    privacyRegime: "PDPL — Federal Decree-Law No. 45 of 2021",
    consent: { model: "opt-in", granular: true, preTickedAllowed: false },
    // The PDPL treats consent as the default lawful basis, unlike GDPR's
    // legitimate-interest route. Practical effect: nothing non-essential runs
    // until the user actively says yes.
    cooloffDays: 0,               // no general C2C cooling-off; verify per case
    returnWindowDays: 14,         // business sellers, faulty/not-as-described
    warrantyMonths: 0,            // second-hand goods sold as-seen
    minListingPrice: 200,         // AED — the prototype's own floor
    dataResidency: "prefer-ae",
    crossBorderTransfer: "adequacy-or-scc",
    breachNotifyHours: 72,
    vatRate: 0.05,
    vatThreshold: 375000,         // AED, annual
    escrowByPlatform: false,      // holding float may need a CBUAE licence
    deemedSupplierVAT: "review",  // agent-vs-principal turns on the contract terms
    traderVerification: true,     // business sellers need their own licence
    privateSellersAllowed: true,  // individuals may need a DED e-trader licence
    platformLicenceActivity:
      "Electronic marketplace / intermediary services — NOT retail trading. " +
      "The activity on the licence should describe operating a platform, " +
      "because we are not the ones selling the goods.",
    paymentNote:
      "Route funds through a CBUAE-licensed processor. Do not hold buyer " +
      "money on platform balance without payment-services advice.",
    ipRegime: "Federal Decree-Law No. 36 of 2021 (Trademarks)",
    counterfeitPosture: "strict",
    disputeBody: "Dubai Department of Economy & Tourism — Consumer Protection",
    disputeContact: "https://www.dubaideconomy.gov.ae",
    ecommerceLaw: "Federal Decree-Law No. 14 of 2023 (trade by modern technological means)",
    prohibited: [
      "counterfeit or replica goods",
      "items bearing religious text or imagery",
      "alcohol, tobacco, vape products",
      "weapons, blades, replica firearms",
      "medicines, supplements, cosmetics without registration",
      "used undergarments, swimwear, worn hosiery",
      "ivory, exotic skins without CITES paperwork",
      "anything depicting nudity or sexual content",
    ],
    imageryGuidance:
      "Listing photos must not contain nudity or sexually suggestive posing. " +
      "Modelled shots should be modest. Flat-lay is always safe.",
    readiness: [
      "Platform trade licence for marketplace/intermediary activity — not retail",
      "Written position on VAT agent vs principal, confirmed by a UAE tax adviser",
      "VAT on the COMMISSION at minimum; deemed-supplier question settled in writing",
      "Payments via a CBUAE-licensed processor that holds the float, not lili",
      "Seller agreement making the seller the merchant of record",
      "Business sellers evidence their own trade or e-trader licence at onboarding",
      "Platform Terms (lili↔user) and Seller Terms (seller↔buyer) drafted separately",
      "Arabic and English for both, since consumer terms need Arabic",
      "Counterfeit takedown route with a named responsible person and a response clock",
      "PDPL records of processing and a data-subject-request channel",
    ],
  },

  // ── SAUDI ARABIA ──────────────────────────────────────────────────────────
  SA: {
    ...base,
    code: "SA",
    name: "Saudi Arabia",
    nameLocal: "المملكة العربية السعودية",
    currency: "SAR",
    locales: ["en", "ar"],
    requiresLocalLanguage: true,
    privacyRegime: "PDPL (SDAIA)",
    dataResidency: "in-country",   // stricter than UAE — plan for this early
    cooloffDays: 3,
    vatRate: 0.15,
    counterfeitPosture: "strict",
    ecommerceLaw: "Saudi E-Commerce Law (2019) + implementing regulations",
    readiness: [
      "In-country data storage or an SDAIA-approved transfer basis",
      "Maroof registration for the platform",
      "Arabic-first interface, not Arabic-as-secondary",
    ],
  },

  // ── EUROPEAN UNION ────────────────────────────────────────────────────────
  EU: {
    ...base,
    code: "EU",
    name: "European Union",
    currency: "EUR",
    locales: ["en"],
    privacyRegime: "GDPR",
    consent: { model: "opt-in", granular: true, preTickedAllowed: false },
    cooloffDays: 14,               // right of withdrawal — trader sales
    returnWindowDays: 14,
    warrantyMonths: 12,            // reduced period permitted for second-hand
    dataResidency: "eea-or-adequacy",
    crossBorderTransfer: "adequacy-or-scc",
    breachNotifyHours: 72,
    counterfeitPosture: "strict",
    ecommerceLaw: "Digital Services Act + Omnibus Directive",
    dsaTraderTraceability: true,   // must collect + verify trader identity
    dsaNoticeAndAction: true,      // reporting flow with reasoned decisions
    deemedSupplierVAT: true,       // platform owes VAT on some third-party sales
    sellerIncomeReporting: "DAC7", // report seller earnings to tax authorities
    traderVerification: true,
    readiness: [
      "DSA notice-and-action with statements of reasons and an appeal route",
      "Trader identity collection and verification (DSA Art. 30)",
      "14-day withdrawal for professional sellers, clearly disclosed",
      "GDPR lawful-basis register, DPO assessment, EU representative",
      "Distinguish consumer sellers from traders in the listing flow",
      "DAC7 reporting of seller identity and earnings, annually",
      "Deemed-supplier VAT assessed — the platform can owe tax on others' sales",
    ],
  },

  // ── UNITED KINGDOM ────────────────────────────────────────────────────────
  GB: {
    ...base,
    code: "GB",
    name: "United Kingdom",
    currency: "GBP",
    privacyRegime: "UK GDPR + Data Protection Act 2018",
    cooloffDays: 14,
    returnWindowDays: 14,
    warrantyMonths: 6,
    dataResidency: "uk-or-adequacy",
    counterfeitPosture: "strict",
    ecommerceLaw: "Consumer Rights Act 2015 + Online Safety Act",
    sellerIncomeReporting: "HMRC digital platform reporting",
    traderVerification: true,
    readiness: [
      "Online Safety Act duties assessed for user-to-user content",
      "HMRC digital platform reporting on seller earnings, annually",
      "ICO registration",
      "Private-vs-business seller status shown on every listing",
    ],
  },

  // ── UNITED STATES ─────────────────────────────────────────────────────────
  US: {
    ...base,
    code: "US",
    name: "United States",
    currency: "USD",
    privacyRegime: "State patchwork — CCPA/CPRA, VCDPA, and others",
    consent: { model: "opt-out", granular: true, preTickedAllowed: true },
    cooloffDays: 0,
    counterfeitPosture: "strict",
    ecommerceLaw: "INFORM Consumers Act",
    informConsumersAct: true,      // verify high-volume sellers, disclose them
    deemedSupplierVAT: true,       // marketplace facilitator — platform collects
    sellerIncomeReporting: "1099-K",
    traderVerification: true,
    readiness: [
      "INFORM Act verification for high-volume third-party sellers",
      "1099-K reporting for seller payouts",
      "State-by-state privacy: do-not-sell link, opt-out signals",
      "Marketplace facilitator registration — the platform collects and remits " +
        "sales tax on the seller's sale, in most states",
      "Seller bank and contact details verified and disclosed under the INFORM Act",
    ],
  },
};

export const DEFAULT_MARKET = "AE";

export function getMarket(code) {
  return MARKETS[code] || MARKETS[DEFAULT_MARKET];
}

export function isOpen(code) {
  return getMarket(code).status === "live";
}

/** Markets we will serve, for the "where are you?" picker. */
export function listMarkets() {
  return Object.values(MARKETS).filter((m) => m.status !== "blocked");
}
