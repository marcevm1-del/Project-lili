// ─────────────────────────────────────────────────────────────────────────────
//  WHAT LILI CHARGES
//
//  One place. The app previously stated the fee in two places that disagreed:
//  the item detail said "+ 8-10% LILI fee" (charged to the BUYER, on top) and
//  the sell flow said "lili takes 10%" (charged to the SELLER, off the price).
//  Read together they describe a take rate near 20%, which nobody had decided
//  and which neither screen knew the other was saying.
//
//  ── the shape of the fee, and why ──────────────────────────────────────────
//
//  Every serious resale platform indexes commission to price, and it slopes
//  DOWN as the price goes up. Vestiaire Collective — the closest comparable,
//  because it is luxury and it authenticates — charges 25% under $100, 20% to
//  $499, 18% to $1,999, 15% to $4,999 and 12% above $5,000.
//
//  The reason is arithmetic, not generosity. Card processing in the UAE is
//  roughly 2.5–2.9% plus about AED 1 per transaction (Telr 2.49% + AED 0.50;
//  Network International 2.4–2.9% + AED 1; Stripe 2.9% + AED 1; Tap 2.75%).
//  A flat percentage on a AED 260 abaya barely clears that fixed cost, and the
//  same flat percentage on a AED 40,000 Birkin is a number that sends the
//  seller to The Luxury Closet instead.
//
//  So: a band that starts at 10% and falls to 6%. That is the range the
//  business asked for, arranged the way this market actually arranges it, and
//  it lands competitively at every tier — against Grailed (9% above $120, 6%
//  below), Mercari (10%), Whatnot (8%) and Vestiaire (12–25%).
//
//  ── what is NOT here, and why ──────────────────────────────────────────────
//
//  A buyer-paid "Buyer Protection" fee, which is where Vinted, Depop and
//  Mercari have moved (Vinted charges sellers 0% and takes its margin from a
//  buyer protection fee instead). It is a good model and it suits a market that
//  needs supply more than it needs margin.
//
//  lili cannot charge for it yet. Buyer protection means holding the money and
//  refunding it when something goes wrong, and lili holds nothing — there is no
//  payment rail and an accepted offer is a promise between two people. Charging
//  a protection fee while protecting nothing is the same class of claim as the
//  invented reviews this release removed. It goes in when escrow does.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Bump this when the numbers change, and store it against a sale. A sale must
 * always be priced by the schedule that was in force when it was made — not by
 * whatever the file says the day someone opens the accounts.
 */
export const SCHEDULE_VERSION = "2026-08-30";

export const CURRENCY = "AED";

/**
 * Seller commission, by sale price. `upTo` is inclusive; the last band has no
 * ceiling. Rates are the fee lili keeps, BEFORE VAT.
 */
export const COMMISSION_BANDS = [
  { upTo: 499,    rate: 0.10, label: "Under AED 500" },
  { upTo: 1999,   rate: 0.09, label: "AED 500 – 1,999" },
  { upTo: 4999,   rate: 0.08, label: "AED 2,000 – 4,999" },
  { upTo: 14999,  rate: 0.07, label: "AED 5,000 – 14,999" },
  { upTo: null,   rate: 0.06, label: "AED 15,000 and above" },
];

/**
 * A floor, so a small sale is not loss-making.
 *
 * At 10% a AED 100 piece earns AED 10 of commission and costs roughly AED 3.90
 * to process (2.9% + AED 1) — thin but positive. Below about AED 150 it stops
 * being worth the transaction, hence the minimum, and hence the market's
 * AED 200 listing floor sitting just above it.
 */
export const MINIMUM_FEE = 15;

/**
 * UAE VAT on lili's commission — the fee is a service lili sells to the seller.
 *
 * `inclusive: true` means the headline rate ALREADY contains the VAT, so 10%
 * is 9.52% to lili and 0.48% to the FTA. That is the honest way to display it
 * to a consumer: Federal Law No. 15 of 2020 and its Executive Regulations
 * expect a price a person can act on, not one with tax bolted on afterwards.
 *
 * Whether lili is agent or principal for VAT on the SALE ITSELF is a separate,
 * unsettled question and is in the market readiness list — this covers only the
 * commission.
 */
export const VAT = { rate: 0.05, inclusive: true, regime: "UAE VAT" };

/**
 * Card processing, for lili's own planning. NEVER shown as a seller charge:
 * she pays commission, not lili's cost of doing business. Kept here so the
 * margin maths lives next to the fee it depends on.
 *
 * Sources: Telr 2.49% + AED 0.50 (UAE cards); Network International 2.4–2.9%
 * + AED 1; Stripe 2.9% + AED 1; Tap 2.75%. Taking the pessimistic end.
 */
export const PROCESSING_ESTIMATE = { rate: 0.029, fixed: 1.0 };

/** The band a price falls into. */
export function bandFor(price) {
  const p = Number(price) || 0;
  return COMMISSION_BANDS.find((b) => b.upTo === null || p <= b.upTo)
      || COMMISSION_BANDS[COMMISSION_BANDS.length - 1];
}

export function commissionRate(price) {
  return bandFor(price).rate;
}

/**
 * The whole picture for one sale.
 *
 * @returns {{
 *   price, rate, ratePercent, commission, minimumApplied,
 *   vat, commissionExVat, payout, effectiveRate,
 *   processingEstimate, marginEstimate, band, scheduleVersion
 * }} — or null for a price that is not a price.
 */
export function breakdown(price) {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return null;

  const band = bandFor(p);
  const raw = p * band.rate;
  const commission = Math.max(raw, Math.min(MINIMUM_FEE, p));   // never exceed the sale
  const minimumApplied = commission > raw + 0.0001;

  // Inclusive VAT: the fee she sees is what she pays, and the tax comes out of
  // it rather than being added to it.
  const vat = VAT.inclusive
    ? commission - commission / (1 + VAT.rate)
    : commission * VAT.rate;
  const commissionExVat = commission - vat;

  const payout = p - commission;
  const processingEstimate = p * PROCESSING_ESTIMATE.rate + PROCESSING_ESTIMATE.fixed;

  return {
    price: p,
    band,
    rate: band.rate,
    ratePercent: Math.round(band.rate * 100),
    commission: round2(commission),
    minimumApplied,
    vat: round2(vat),
    commissionExVat: round2(commissionExVat),
    payout: round2(payout),
    effectiveRate: commission / p,
    processingEstimate: round2(processingEstimate),
    marginEstimate: round2(commissionExVat - processingEstimate),
    scheduleVersion: SCHEDULE_VERSION,
  };
}

const round2 = (n) => Math.round(n * 100) / 100;

/** "10%" / "AED 1,161" — one place, so two screens cannot disagree again. */
export const money = (n) =>
  `${CURRENCY} ${Math.round(Number(n) || 0).toLocaleString()}`;

/**
 * One sentence a seller can act on, in her language.
 * Deliberately says what she RECEIVES first: that is the number she cares
 * about, and leading with the deduction is how a fee reads as a penalty.
 */
export function payoutLine(price) {
  const b = breakdown(price);
  if (!b) return null;
  return {
    payout: money(b.payout),
    fee: money(b.commission),
    percent: `${b.ratePercent}%`,
    minimumApplied: b.minimumApplied,
    en: `You receive ${money(b.payout)} — after lili's ${b.ratePercent}% fee of ${money(b.commission)}.`,
    ar: `تستلمين ${money(b.payout)} بعد عمولة لili ${b.ratePercent}%.`,
  };
}

/**
 * Is lili actually able to collect this yet?
 *
 * No. There is no payment rail, so a sale settles between two people and lili
 * takes nothing. This exists so no screen can imply a deduction that is not
 * happening — the fee is stated as what it will be, clearly marked as not yet
 * charged, rather than displayed as though money were already moving.
 *
 * Flip to true on the day the processor goes live, and every screen that reads
 * it changes together.
 */
export const COLLECTION_LIVE = false;
