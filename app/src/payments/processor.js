// ─────────────────────────────────────────────────────────────────────────────
//  THE PAYMENT SEAM
//
//  There is no payment processor. This file is the shape of the hole where one
//  goes, and a refusal in every method until one exists.
//
//  ── why build a seam for something that is not built
//
//  Because the alternative is what this project has spent three releases
//  undoing. Seven surfaces claimed lili holds the buyer's payment; the cart ran
//  a whole checkout that wrote nothing anywhere. Every one of those existed
//  because somebody built the SCREEN for a payment system before the payment
//  system, and a screen with nothing behind it is indistinguishable from a lie.
//
//  So this is the opposite order. The integration surface is defined, every
//  method refuses, and NOTHING IN THE INTERFACE IMPORTS THIS FILE. A research
//  check asserts that last part, because the day someone wires a button to
//  `authorize()` "just to see the flow" is the day the eighth false claim is
//  born.
//
//  ── what flipping the switch actually does
//
//  `COLLECTION_LIVE` in data/fees.js is the one flag. It already drives
//  HOW_MONEY_WORKS, PAYMENT_POSTURE, disputeRoute() and the merchant-of-record
//  clause a seller signs — so on the day it flips, every screen changes its
//  wording together and none of them can be forgotten. What was missing was
//  anything for it to flip TO. That is this file.
//
//  Flipping it with no processor registered is a mistake the code can catch,
//  and `readiness()` below is what catches it.
//
//  ── the red lines, restated because they are load-bearing
//
//  PAYMENT_POSTURE.redLines says it and this repeats it, because it is the
//  difference between a marketplace and an unlicensed money transmitter:
//
//    · buyer funds NEVER enter a lili bank account
//    · lili NEVER pays a seller out of its own balance
//    · a refund goes back against the ORIGINAL payment, never netted off a
//      future payout
//
//  Holding a float in the UAE is a Central Bank licensing question, not an
//  engineering one. Any implementation of the interface below that keeps money
//  even briefly is the wrong implementation.
// ─────────────────────────────────────────────────────────────────────────────

import { COLLECTION_LIVE } from "../data/fees.js";

/**
 * What a processor adapter has to be able to do.
 *
 * Written as documentation rather than a class because there is nothing to
 * subclass yet, and an abstract base class with one null implementation is
 * more ceremony than the problem has earned.
 *
 * @typedef {object} Processor
 * @property {string} name                 who it is, for the audit trail
 * @property {string} licensedIn           the market whose regulator licensed them
 *
 * @property {(args: {amount: number, currency: string, buyerUid: string,
 *                    itemId: string, sellerUid: string}) => Promise<{id: string}>} authorize
 *   Reserve the money on the buyer's card. Does not move it. Fails loudly —
 *   an authorization that silently does nothing is the whole problem.
 *
 * @property {(id: string) => Promise<void>} capture
 *   Take the reserved money. Called when the piece changes hands, never at
 *   checkout: this is a resale marketplace where the seller may not have the
 *   item any more.
 *
 * @property {(id: string) => Promise<void>} release
 *   Pay the seller and pay lili its commission SEPARATELY. Two movements, not
 *   one net figure — a net payout is lili receiving the buyer's money.
 *
 * @property {(id: string, amount?: number) => Promise<void>} refund
 *   Against the original payment. Never off a future payout.
 *
 * @property {(payload: string, signature: string) => boolean} verifyWebhook
 *   Signature check. A webhook endpoint that trusts its body is a way to mark
 *   any order paid from the internet.
 */

/**
 * Everything that has to be true before COLLECTION_LIVE may be flipped.
 *
 * Deliberately not a checklist in a document. A document does not fail a build.
 * `npm run preflight` reads this, and `blockers()` is empty only when a real
 * adapter has been registered and every line below has been answered by a
 * person who can be named.
 */
export const READINESS = [
  { id: "processor-contract",
    what: "A signed contract with a payment processor licensed in the market",
    why: "Without one there is no lawful way to take a card payment at all." },
  { id: "no-float",
    what: "Confirmation in writing that funds never touch a lili account",
    why: "Holding a float is a Central Bank of the UAE licensing question. " +
         "Getting this wrong is not a bug, it is operating unlicensed." },
  { id: "merchant-of-record",
    what: "Who is the merchant of record for a sale — settled, and written into the seller agreement",
    why: "The seller agreement already says lili is not. If a processor " +
         "requires otherwise, the agreement changes BEFORE the flag flips." },
  { id: "webhook-endpoint",
    what: "A signed webhook endpoint, with replay protection",
    why: "Payment state must come from the processor, never from the phone. " +
         "A client that can tell the server it paid is a client that will." },
  { id: "refund-route",
    what: "A refund path that a person can actually operate, with an SLA",
    why: "disputeRoute() promises the buyer something. It has to be true the " +
         "day it starts saying so." },
  { id: "kyc-tiers",
    what: "KYC enforced at the tiers in sellerRules.js, before any payout",
    why: "requiredTier() decides what is asked for. Until money moves it is " +
         "advisory; after, it is the anti-money-laundering control." },
  { id: "vat-invoice",
    what: "A VAT invoice for lili's commission, and a decision on deemed supplier",
    why: "taxPosition() names both questions. The second one can make the " +
         "platform liable for VAT on a sale it did not make." },
  { id: "dispute-window",
    what: "The hold period and the dispute window, agreed with the processor",
    why: "SHIPPING.rules names 14 days. That number has to be the processor's " +
         "number, not an aspiration." },
];

let adapter = null;

/**
 * Register a processor adapter. Called once, at startup, by whoever builds the
 * integration. Refuses anything that does not implement the whole interface —
 * a half-implemented adapter is how `release()` becomes a no-op that reports
 * success.
 */
export function registerProcessor(impl) {
  const required = ["name", "licensedIn", "authorize", "capture", "release", "refund", "verifyWebhook"];
  const missing = required.filter((k) => impl == null || impl[k] == null);
  if (missing.length) throw new Error(`Processor is missing: ${missing.join(", ")}`);
  adapter = impl;
  return adapter;
}

export const getProcessor = () => adapter;

/** True only when a real adapter exists AND the flag says money may move. */
export const paymentsUsable = () => !!adapter && COLLECTION_LIVE;

/**
 * Why payments are not usable, in words. Empty means they are.
 *
 * Both halves matter, and they fail differently:
 *   · flag on, no adapter  → every screen now claims a payment system that
 *     cannot take a payment. This is the dangerous one.
 *   · adapter, flag off    → nothing claims anything. Harmless, and the normal
 *     state during an integration.
 */
export function blockers() {
  const out = [];
  if (!adapter) out.push("No payment processor is registered.");
  if (!COLLECTION_LIVE) out.push("COLLECTION_LIVE is false — no screen claims money moves.");
  if (COLLECTION_LIVE && !adapter)
    out.push("DANGEROUS: the flag is on with no processor behind it. Every screen " +
             "now describes an escrow that cannot take a payment. Turn it back off.");
  return out;
}

/**
 * The refusal every method funnels through.
 *
 * It says which of the two states it is in, because "payments are not
 * available" is not actionable and "the flag is on but nothing is registered"
 * is a five-minute fix by the person reading the log.
 */
const refuse = (method) => {
  const err = new Error(
    `payments.${method}() — there is no payment processor. ${blockers().join(" ")}`
  );
  err.code = "PAYMENTS_NOT_LIVE";
  return err;
};

const guard = (method) => (...args) => {
  if (!paymentsUsable()) return Promise.reject(refuse(method));
  return adapter[method](...args);
};

export const authorize = guard("authorize");
export const capture   = guard("capture");
export const release   = guard("release");
export const refund    = guard("refund");

/** Not a promise: a signature check that cannot verify must return false. */
export const verifyWebhook = (payload, signature) =>
  paymentsUsable() ? adapter.verifyWebhook(payload, signature) : false;

export default {
  READINESS, registerProcessor, getProcessor, paymentsUsable, blockers,
  authorize, capture, release, refund, verifyWebhook,
};
