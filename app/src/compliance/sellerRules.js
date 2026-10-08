import { getMarket } from "./markets.js";
import { SELLER_TYPES } from "./intermediary.js";
import { COLLECTION_LIVE } from "../data/fees.js";

// ─────────────────────────────────────────────────────────────────────────────
//  SELLER VERIFICATION (KYC)
//
//  Verification is tiered against risk, not applied flat. Asking a woman
//  selling one dress for a trade licence kills the marketplace; letting someone
//  move AED 500k a year unverified is how a platform ends up in an AML file.
//  The tier escalates with what the seller is actually doing.
// ─────────────────────────────────────────────────────────────────────────────

export const KYC_TIERS = {
  0: {
    tier: 0, name: "Browsing",
    needs: [],
    can: ["Browse", "Save items", "Message sellers"],
  },
  1: {
    tier: 1, name: "Casual seller",
    trigger: "Listing anything at all",
    needs: ["Verified mobile number", "Verified email"],
    can: ["List items", "Receive offers"],
    payoutCap: 10000,   // AED per rolling year before tier 2 is required
  },
  2: {
    tier: 2, name: "Identity verified",
    trigger: "First payout, or AED 10,000 in sales",
    needs: [
      "Government ID (Emirates ID or passport)",
      "Selfie match against the ID",
      "Bank account or payout details in the seller's own name",
    ],
    can: ["Receive payouts", "Sell above the casual cap"],
    payoutCap: 100000,
    note:
      "Name on the payout account must match the ID. Paying a third party is " +
      "the classic money-laundering pattern and the one the bank will ask about.",
  },
  3: {
    tier: 3, name: "Business seller",
    trigger: "Declared as a business, or crosses the trader review threshold",
    needs: [
      "Trade licence or e-trader licence for the market",
      "VAT registration number, where the seller is registered",
      "Registered business address",
      "Beneficial owner details",
    ],
    can: ["Trade at volume", "Appear as a business seller", "Run promoted listings"],
    payoutCap: null,
    note:
      "This is the tier that carries consumer-law duties. The buyer gets returns " +
      "and warranties from a tier-3 seller that a tier-1 seller does not owe.",
  },
};

export function requiredTier({ sellerType, salesLast12m = 0, valueLast12m = 0, wantsPayout }) {
  if (sellerType === SELLER_TYPES.trader.key) return 3;
  if (valueLast12m >= 100000 || salesLast12m >= 50) return 3;   // trading in fact
  if (wantsPayout || valueLast12m >= 10000) return 2;
  return 1;
}

export function tierGap(currentTier, needed) {
  if (currentTier >= needed) return null;
  return {
    from: KYC_TIERS[currentTier], to: KYC_TIERS[needed],
    missing: KYC_TIERS[needed].needs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  PAYMENTS
//
//  The single rule that keeps lili out of payment-services licensing: we never
//  hold the money. A licensed processor holds it and pays the seller. We take a
//  commission on our own invoice, which is a service fee, not a transfer.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
//  WHAT IS ACTUALLY TRUE TODAY, AND WHAT IS THE PLAN
//
//  v2.9. This is the most serious thing found in this pass, and it was found by
//  grepping for one phrase.
//
//  PAYMENT_POSTURE below describes the design correctly: a licensed processor
//  holds the buyer's money and releases it on delivery. It is a plan. There is
//  no processor, no escrow, no trade licence, no shipping integration and no
//  tracking — `fees.COLLECTION_LIVE` is false and says so.
//
//  Four buyer-facing surfaces narrated that plan in the present tense:
//
//    · the acknowledgement she taps to sign up — "we hold the payment until it
//      arrives and step in if it goes wrong"
//    · Help Centre, first answer — the same
//    · Legal Centre → How lili works — "we ... hold the payment until the item
//      lands ... and can hold or reverse the payment"
//    · Help Centre on a fake — "You get your money back"
//
//  while messages/MeetSafely.jsx told her, correctly, "lili does not hold your
//  money, so the moment to be sure is before it leaves your hand."
//
//  A woman who read the first four and then met a stranger in a mall car park
//  with cash believed there was a refund behind her. There was not. That is not
//  a copy inconsistency; it is the app telling her she is protected when she is
//  not, which is the one failure this project has been built to avoid.
//
//  So: one source, branched on the flag, and every surface reads from it. When
//  a processor is live, `COLLECTION_LIVE` flips and all four change together.
//  They cannot drift apart again, because there is only one of them.
// ─────────────────────────────────────────────────────────────────────────────

export const PAYMENTS_LIVE = COLLECTION_LIVE;

export const HOW_MONEY_WORKS = PAYMENTS_LIVE ? {
  live: true,
  holder: "A licensed payment processor",
  short: "You pay the processor. It releases the money to her once the piece reaches you.",
  liliRole: "We list, introduce, and enforce the rules. We never hold your money and never own the item.",
  ifWrong: "Message her first — most of it is a misunderstanding about condition. If that stalls, raise it with us: we read the listing, the messages and the tracking, and decide with reasons. A refund is issued by the processor against your original payment.",
  delivery: "The seller ships. lili supplies the label, the tracking and the clock.",
  refundFromLili: true,
} : {
  live: false,
  holder: "Nobody — you pay her directly",
  short: "lili doesn't handle your money at all. You and she agree a price here, meet, and you pay her in person.",
  liliRole: "We list, introduce, and enforce the rules. Your money never passes through lili, and we never own the item.",
  ifWrong: "Check the piece before you hand anything over — that is the moment, and it is the only one. lili holds no money, so there is nothing for us to refund. What we can do is act on the seller: report her here and we read the listing and, if you attach it, your conversation, and we can remove the listing and close the shop.",
  delivery: "There is no shipping yet. You arrange to meet her somewhere public and busy, and the piece changes hands there.",
  refundFromLili: false,
};

/** One sentence, for a screen that only has room for one. */
export const moneyLine = () => HOW_MONEY_WORKS.short;

export const PAYMENT_POSTURE = {
  // The plan, not the present tense. `live` says which it is; every buyer-
  // facing screen reads HOW_MONEY_WORKS above rather than this object.
  live: PAYMENTS_LIVE,
  model: "processor-held escrow",
  liliHoldsFunds: false,
  liliIsMerchantOfRecord: false,
  flow: [
    "Buyer pays the processor, not lili",
    "Processor holds until delivery is confirmed or the window closes",
    "Processor pays the seller and pays lili its commission separately",
    "Refunds are issued by the processor against the original payment",
  ],
  redLines: [
    "Never take buyer funds into a lili bank account and pay sellers from it",
    "Never net a refund off a future payout — refund the original payment",
    "Never let a seller nominate a payout account in someone else's name",
  ],
  candidates: {
    AE: ["Telr", "Network International", "Checkout.com", "Stripe Connect"],
    EU: ["Stripe Connect", "Adyen for Platforms", "Mangopay"],
    GB: ["Stripe Connect", "Adyen for Platforms"],
    US: ["Stripe Connect", "Adyen for Platforms"],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
//  VAT & TAX
//
//  Two separate questions, constantly conflated:
//    1. VAT on lili's COMMISSION — almost certainly yes once registered.
//    2. VAT on the SELLER'S SALE — depends on deemed-supplier rules, and in
//       several markets the platform owes it even though it didn't sell.
// ─────────────────────────────────────────────────────────────────────────────

export function taxPosition(marketCode) {
  const m = getMarket(marketCode);
  return {
    market: m.code,
    commissionVAT: m.vatRate != null
      ? `${(m.vatRate * 100).toFixed(0)}% on lili's commission once registered`
      : "Confirm locally",
    registrationThreshold: m.vatThreshold
      ? `${m.vatThreshold.toLocaleString()} ${m.currency} annual turnover`
      : "Confirm locally",
    deemedSupplier: m.deemedSupplierVAT === true
      ? "Yes — the platform is liable for VAT on the seller's sale in defined cases"
      : m.deemedSupplierVAT === "review"
        ? "Unsettled — agent vs principal turns on the seller agreement wording. Get this in writing."
        : "No, on current reading",
    sellerReporting: m.sellerIncomeReporting
      ? `Seller earnings reported under ${m.sellerIncomeReporting}`
      : "No platform reporting obligation identified",
    warning:
      "Being the intermediary does not exempt the platform from tax. In several " +
      "markets it is precisely what creates the obligation.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  SHIPPING & DELIVERY
// ─────────────────────────────────────────────────────────────────────────────

export const SHIPPING = {
  // Planned. Nothing here is wired: there is no carrier account, no label, no
  // tracking number and no clock. `HOW_MONEY_WORKS.delivery` is what a buyer is
  // shown until there is.
  live: false,
  responsibleParty: "seller",
  liliProvides: "the label, the tracking, and the clock",
  rules: [
    "Seller dispatches within 3 working days of the sale",
    "Tracking is mandatory — an untracked parcel is an undefendable dispute",
    "Risk passes to the buyer on delivery, not on dispatch",
    "The payment stays with the processor until delivery or 14 days, whichever first",
  ],
  crossBorder: {
    allowed: false,
    reason:
      "Cross-border resale drags in customs, duty, prohibited-import lists and " +
      "CITES for exotic materials. Launch domestic; open corridors deliberately.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
//  DISPUTES
//
//  Escalating, and it never removes the buyer's statutory route. A platform
//  process that pretends to be the only route is itself a consumer-law problem.
// ─────────────────────────────────────────────────────────────────────────────

export const DISPUTE_STAGES = [
  { key: "direct", label: "Talk to the seller", window: "3 days",
    detail: "Most of it is a misunderstanding about condition or delivery." },
  { key: "mediated", label: "Bring lili in", window: "5 days",
    detail: "We read the listing, the messages and the tracking, and decide." },
  { key: "resolved", label: "Outcome", window: "—",
    detail: "Refund, partial refund, return, or the sale stands. Reasons given." },
];

export function disputeRoute(marketCode) {
  const m = getMarket(marketCode);
  return {
    stages: DISPUTE_STAGES,
    // Branched, like everything else that describes money. Rendered in Legal
    // Centre; in the present tense it was the seventh place claiming an escrow
    // that does not exist.
    holdFunds: PAYMENTS_LIVE
      ? "The processor holds the payment while a dispute is open"
      : "There is no payment for anyone to hold — you paid her directly. What lili can do is take the listing down and close the shop, and tell you what it decided and why.",
    externalRoute: m.disputeBody || "Local consumer protection authority",
    statutoryNote:
      "Using lili's process does not remove the buyer's right to go to " +
      (m.disputeBody || "the local authority") + " or to court.",
    cooloff: m.cooloffDays > 0
      ? `${m.cooloffDays}-day right of withdrawal applies to business sellers`
      : "No general cooling-off period — condition disputes only",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  ADVERTISING
//
//  The UAE regulates paid influencer promotion specifically, and it is the rule
//  a fashion resale app is most likely to break without noticing.
// ─────────────────────────────────────────────────────────────────────────────

export const ADVERTISING = {
  rules: [
    "A promoted listing carries a visible 'Promoted' label — always, not on hover",
    "Never present a paid placement as an editorial pick or a staff favourite",
    "Price claims must be true at the moment shown, including 'was' prices",
    "'Authentic' may only appear where authentication actually happened",
    "No health, slimming or medical claims on any garment",
  ],
  influencers: {
    note:
      "Paid creator promotion in the UAE requires the creator to hold a media " +
      "licence. That is the creator's obligation, but a platform that pays " +
      "unlicensed promoters carries the reputational and regulatory exposure.",
    required: ["Written disclosure in the post", "Creator licence checked before payment"],
  },
  prohibitedClaims: [
    /\b100%\s*(authentic|genuine|real)\b/i,
    /\bguaranteed\s*(authentic|profit|resale)\b/i,
    /\b(investment|appreciates|guaranteed\s*return)\b/i,
  ],
};

export function screenAdCopy(text = "") {
  return ADVERTISING.prohibitedClaims
    .filter((re) => re.test(text))
    .map((re) => ({ code: "ad.claim", reason: `Unsupportable claim: ${re.source}` }));
}
