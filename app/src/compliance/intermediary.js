import { createElement as h } from "react";
import { C } from "./ui.js";

// ─────────────────────────────────────────────────────────────────────────────
//  INTERMEDIARY POSTURE
//
//  lili is the marketplace, not the merchant. The seller sells; we introduce,
//  host and take a cut. That is a legal position, not a slogan, and it is
//  CONDITIONAL — a platform loses intermediary protection by behaving like the
//  seller. The conditions are listed in SAFE_HARBOUR below and every one of
//  them has cost a real marketplace a real court case.
//
//  Two things the middleman position does NOT get you out of, which is where
//  most founders are caught out:
//
//    • TAX. Marketplace-facilitator and deemed-supplier rules make the platform
//      liable to collect and remit on sales it did not make. Being the
//      intermediary is often what *triggers* the obligation.
//    • MONEY. Taking the buyer's payment and paying the seller later is money
//      transmission. Doing that as an intermediary needs a licence in most
//      markets, or a processor who holds the funds under theirs.
// ─────────────────────────────────────────────────────────────────────────────

export const PLATFORM_ROLE = {
  merchantOfRecord: false,   // the seller is
  holdsStock: false,
  setsPrices: false,         // the seller does
  handlesDelivery: false,
  contractIsBetween: "buyer and seller",
  liliProvides: "the listing, the introduction, the payment rail, and the rules",
};

// Lose any of these and the "we're just the middleman" defence weakens.
export const SAFE_HARBOUR = [
  "Name the seller on every listing, at checkout, and on the receipt",
  "Never let lili branding imply lili is selling the item",
  "Act on a valid takedown notice fast, and log when you did",
  "Don't edit a seller's listing content beyond removing it",
  "Don't set or cap the sale price",
  "Don't take possession of stock or fulfil the order",
  "Publish who sells, who ships, who refunds — before the buyer pays",
];

// ── seller classification ──────────────────────────────────────────────────
// The EU requires this distinction outright, and it changes the buyer's rights
// underneath the same listing. A private seller owes far less than a trader —
// so the buyer must be told which one they're dealing with BEFORE they pay.
export const SELLER_TYPES = {
  private: {
    key: "private",
    label: "Selling from my own wardrobe",
    labelAr: "من خزانتي الخاصة",
    badge: "Private seller",
    badgeAr: "بائعة شخصية",
    consumerRightsApply: false,
    note:
      "Statutory returns and warranties generally do not apply to a private " +
      "sale. The buyer sees this before they pay.",
    requiresLicence: false,
  },
  trader: {
    key: "trader",
    label: "Selling as a business",
    labelAr: "كنشاط تجاري",
    badge: "Business seller",
    badgeAr: "بائعة تجارية",
    consumerRightsApply: true,
    note:
      "Consumer law applies in full: returns, warranties, and a trading " +
      "licence in the market you sell into.",
    requiresLicence: true,
  },
};

/**
 * Volume can make someone a trader whether they call themselves one or not.
 * Regulators look at frequency and value, not the label a person picked. This
 * is a prompt to re-ask, never an automatic reclassification — getting it wrong
 * in either direction has consequences.
 */
export function traderReviewDue({ salesLast12m = 0, valueLast12m = 0, market }) {
  const saleTrigger = 30;
  const valueTrigger = market?.code === "AE" ? 100000 : 2000;
  return salesLast12m >= saleTrigger || valueLast12m >= valueTrigger;
}

// ── the line the buyer must see ────────────────────────────────────────────
export function SoldBy({ shopName, sellerType = "private", compact }) {
  const t = SELLER_TYPES[sellerType] || SELLER_TYPES.private;
  return h("div", {
    style: {
      display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      background: C.sand, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: compact ? "8px 11px" : "11px 13px",
      fontSize: compact ? 11 : 12, color: C.inkLt, lineHeight: 1.5,
    },
  },
    h("span", null,
      "Sold by ",
      h("b", { style: { color: C.ink } }, shopName || "this seller"),
      " — not by lili."
    ),
    h("span", {
      style: {
        background: t.consumerRightsApply ? C.terra : C.white,
        color: t.consumerRightsApply ? C.white : C.inkLt,
        border: `1px solid ${t.consumerRightsApply ? C.terra : C.border}`,
        borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 700,
        whiteSpace: "nowrap",
      },
    }, t.badge)
  );
}
