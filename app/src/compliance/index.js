// ─────────────────────────────────────────────────────────────────────────────
//  THE COMPLIANCE BARREL — data and rules only, deliberately no screens
//
//  v2.10. This file used to re-export five COMPONENTS as well: LegalCenter,
//  ReportDialog, ModerationQueue, ListingScreen and AgreementSheet. Marketplace
//  imports `useCompliance` from here, so importing one hook made every one of
//  those screens statically reachable — and a module that is statically
//  reachable is in the entry chunk no matter how many `lazy()` calls point at
//  it. Every lazy boundary around them was decorative.
//
//  LegalCenter alone is 30 kB of source in the bundle of a woman who is
//  looking at dresses. The rule now: this barrel exports rules, constants and
//  hooks. A screen is imported from its own file, by the one component that
//  shows it, through lazy().
// ─────────────────────────────────────────────────────────────────────────────
export { ComplianceProvider } from "./ComplianceProvider.jsx";
export { useCompliance, ComplianceContext } from "./context.js";
export { MARKETS, getMarket, listMarkets, POLICY_VERSION } from "./markets.js";
export { record, readLog, exportAll } from "./audit.js";
export { SELLER_TYPES, SoldBy, PLATFORM_ROLE, SAFE_HARBOUR, traderReviewDue } from "./intermediary.js";
// NOT re-exported here: listingRules.js. It pulls in data/resaleValue.js —
// 23 kB of brand tiers, condition factors and model floors — and Rollup will
// not shake a re-export chain whose modules it cannot prove side-effect free.
// So one `import { useCompliance } from "./compliance"` in Marketplace put the
// whole resale-value model in the first paint. The two files that actually
// screen a listing import it directly.
export { KYC_TIERS, requiredTier, tierGap, PAYMENT_POSTURE, taxPosition,
         SHIPPING, DISPUTE_STAGES, disputeRoute, ADVERTISING, screenAdCopy } from "./sellerRules.js";
export { ACCEPT, ACKNOWLEDGE, SELLER_AGREEMENT, AGREEMENT_VERSION,
         sellerClausesFor } from "./agreements.js";
