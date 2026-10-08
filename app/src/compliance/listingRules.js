import { getMarket } from "./markets.js";
import {
  pricePlausibility,
  priceIsPlausible as bandPriceIsPlausible,
  BRAND_FLOORS as DERIVED_BRAND_FLOORS,
  referenceBand,
} from "../data/resaleValue.js";

// ─────────────────────────────────────────────────────────────────────────────
//  LISTING SCREENING  —  prohibited items · counterfeit signals · IP
//
//  Runs before a listing goes live. Three outcomes, deliberately not two:
//
//    block   — will not publish. Illegal, or banned in this market.
//    review  — publishes only after a human looks. Counterfeit risk.
//    warn    — publishes, seller is told what to fix.
//
//  A marketplace that auto-approves everything is not an intermediary in the
//  eyes of a regulator, it is a channel for whatever gets uploaded. A
//  marketplace that auto-rejects on keywords drives its sellers away. The
//  middle tier is the whole point.
//
//  ── what changed in v2.8, and why ──────────────────────────────────────────
//
//  v2.7 screened counterfeits with two independent keyword lists and one
//  category-blind price floor per brand. Any single hit sent the listing to
//  review. That design has a measurable failure mode.
//
//  The Leipzig study on semi-automatic identification of counterfeit offers
//  (2015) tested exactly this class of rule against real marketplace data. It
//  found price the only indicator that survived contact with reality — seller
//  rating and country of origin "cannot be used as reliable" on eBay — and a
//  price-led score still landed at roughly 54–63% precision. About one flag in
//  two was an honest seller.
//
//  A counterfeit accusation is not a neutral outcome. It is delivered to a
//  woman who has done nothing wrong, about the one thing nobody wants to be
//  accused of, at the moment she is deciding whether to use this app at all.
//  So v2.8 makes the screen a SCORE with a threshold, not a set of independent
//  tripwires:
//
//    · price below the band contributes 1 point — never enough on its own
//    · price under a THIRD of the band contributes 3 — enough on its own,
//      because at that distance the innocent explanations run out
//    · otherwise a second, independent signal is what turns a cheap price
//      into a review
//
//  Signals that do not reach the threshold are still shown to the seller — as
//  advice, in her interest. A listing that reads as suspect to a machine reads
//  as suspect to a buyer too.
//
//  The hard blocks are unchanged and still absolute: they describe things that
//  are unlawful or unlistable, not things that are suspicious.
// ─────────────────────────────────────────────────────────────────────────────

// Terms that make an item unlawful or unlistable rather than merely suspicious.
const HARD_BLOCK = [
  { re: /\b(replica|counterfeit|fake|copy|clone|dupe|mirror\s*quality|1:1|aaa\s*grade|unauthorized\s*authentic)\b/i,
    reason: "Describes the item as a copy of a brand", code: "counterfeit.self_declared" },
  { re: /\b(ivory|tortoiseshell|python|crocodile|alligator|shahtoosh)\b/i,
    reason: "Protected species material — needs CITES paperwork we can't verify",
    code: "cites" },
  { re: /\b(gun|firearm|ammo|ammunition|knife|dagger|taser|pepper\s*spray)\b/i,
    reason: "Weapon", code: "weapons" },
  { re: /\b(tramadol|xanax|viagra|steroid|supplement|prescription)\b/i,
    reason: "Regulated medicine or supplement", code: "pharma" },
  { re: /\b(alcohol|whisky|vodka|wine|vape|e-?cigarette|shisha|tobacco)\b/i,
    reason: "Alcohol, tobacco or vape", code: "restricted.substance" },
  { re: /\b(used\s+(underwear|panties|lingerie|swimwear|socks)|worn\s+underwear)\b/i,
    reason: "Used intimate apparel", code: "hygiene" },
];

// ── scored signals ──────────────────────────────────────────────────────────
// Weight is what this signal is worth towards a human review. Nothing under 3
// reaches review on its own — that is the entire point of scoring.
export const REVIEW_THRESHOLD = 3;

const SCORED_SIGNALS = [
  { re: /\b(inspired\s*by|style\s*of|similar\s*to|looks\s*like|comparable\s*to)\b/i,
    weight: 2, code: "counterfeit.lookalike",
    reason: "Describes itself relative to a brand rather than as one",
    fix: "If it is the real brand, name it plainly. If it isn't, list it under its own label." },

  { re: /\b(factory\s*direct|wholesale|bulk|moq|stock\s*available|multiple\s*available)\b/i,
    weight: 2, code: "trader.undeclared",
    reason: "Reads as bulk trade, not a personal wardrobe",
    fix: "Selling as a business? Switch the shop to a business seller — the buyer's rights depend on it." },

  { re: /\b(unauthenticated|no\s*receipt|no\s*box|no\s*dustbag|no\s*papers|street\s*bought)\b/i,
    weight: 1, code: "provenance.missing",
    reason: "No provenance stated",
    fix: "Photograph whatever you do have — card, receipt, dust bag, serial. Any of it helps." },

  // Over-assertion. A heuristic from marketplace trust teams rather than a
  // published finding, so it carries the lowest weight and can never flag a
  // listing by itself.
  { re: /(100\s*%\s*(authentic|genuine|original)|guaranteed\s*authentic|real\s*not\s*fake)/i,
    weight: 1, code: "counterfeit.over_assertion",
    reason: "Insists on authenticity in the wording rather than showing it",
    fix: "A photo of the serial, card or receipt does this better than the words do." },
];

// Kept for compatibility with anything importing the v2.7 shape. The floors
// are now DERIVED from the band model in ../data/resaleValue.js — one number
// per brand for a BAG, which is what the old flat floors were always really
// describing. Scarves, sunglasses and card holders no longer inherit a
// handbag's floor.
export { DERIVED_BRAND_FLOORS as BRAND_FLOORS, referenceBand };

/**
 * v2.7 signature, v2.8 behaviour. With no item detail it assumes a bag, which
 * is how the old flat floors were being read anyway.
 */
export function priceIsPlausible(price, brand, extra = {}) {
  return bandPriceIsPlausible(price, brand, extra);
}

/**
 * @returns {{verdict:"ok"|"warn"|"review"|"block", findings:Array, score:number}}
 */
export function screenListing({ title = "", description = "", brand = "",
                                price = 0, marketCode = "AE", sellerType = "private",
                                hasAuthentication = false, category = "",
                                condition = "Excellent", subtitle = "" }) {
  const market = getMarket(marketCode);
  const text = `${title} ${description} ${brand}`;
  const findings = [];
  let score = 0;

  for (const rule of HARD_BLOCK) {
    if (rule.re.test(text)) {
      findings.push({ level: "block", reason: rule.reason, code: rule.code });
    }
  }

  for (const rule of SCORED_SIGNALS) {
    if (rule.re.test(text)) {
      score += rule.weight;
      findings.push({
        level: "signal", weight: rule.weight, code: rule.code,
        reason: rule.reason, fix: rule.fix,
      });
    }
  }

  // ── price ────────────────────────────────────────────────────────────────
  // Authentication in hand removes the price signal entirely rather than
  // reducing it: the question the price was standing in for has been answered
  // by something better.
  const plausible = pricePlausibility({ price, brand, title, subtitle, category, condition });
  if (!plausible.ok && !hasAuthentication) {
    const weight = plausible.severity === "extreme" ? 3 : 1;
    score += weight;
    findings.push({
      level: "signal", weight, code: `counterfeit.price_${plausible.severity}`,
      reason: plausible.reason,
      fix: plausible.severity === "extreme"
        ? "Add authentication or a receipt, or check the price is right."
        : "If the piece has wear the photos don't show, say so — that explains the price.",
      band: plausible.band,
    });
  }

  if (market.minListingPrice && price > 0 && price < market.minListingPrice) {
    findings.push({
      level: "warn", code: "price.below_minimum",
      reason: `Below the ${market.currency} ${market.minListingPrice} minimum for this market.`,
    });
  }

  if (sellerType === "private" && /\b(invoice|vat|tax\s*receipt|business)\b/i.test(text)) {
    findings.push({
      level: "warn", code: "trader.signals",
      reason: "Reads like a business listing but the shop is registered as private.",
      fix: "If you're trading, switch the shop to a business seller — the buyer's rights depend on it.",
    });
  }

  const reachesReview = score >= REVIEW_THRESHOLD;
  const resolved = findings.map((f) =>
    f.level === "signal" ? { ...f, level: reachesReview ? "review" : "warn" } : f
  );

  const verdict = resolved.some((f) => f.level === "block") ? "block"
    : resolved.some((f) => f.level === "review") ? "review"
    : resolved.some((f) => f.level === "warn") ? "warn"
    : "ok";

  return { verdict, findings: resolved, score, threshold: REVIEW_THRESHOLD, market: market.code };
}

// ── repeat infringement ────────────────────────────────────────────────────
// Safe harbour is conditional on removing sellers who keep doing it. A policy
// nobody enforces is worse than no policy — it's evidence you knew.
export const STRIKE_POLICY = {
  window: "12 months rolling",
  thresholds: [
    { strikes: 1, action: "Listing removed, seller told why" },
    { strikes: 2, action: "Listing removed, selling paused 7 days" },
    { strikes: 3, action: "Shop closed, payouts held pending review" },
  ],
  counterNotice:
    "A seller can contest a strike. Contested strikes don't count until decided " +
    "— required under the EU DSA and fair everywhere else.",
};

export function strikeOutcome(strikes) {
  const t = [...STRIKE_POLICY.thresholds].reverse().find((x) => strikes >= x.strikes);
  return t ? t.action : "No action";
}
