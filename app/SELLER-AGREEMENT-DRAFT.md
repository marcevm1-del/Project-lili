# SELLER AGREEMENT — WORKING DRAFT

**This is not a legal document. It is a structured draft for a UAE-qualified
lawyer to review, correct and complete.** I am not a lawyer, this has not been
reviewed by one, and it must not be published or relied on until it has been.

Read it as a brief to your counsel: it sets out the commercial position, flags
the decisions only they can make, and marks every gap. That is genuinely useful
— a lawyer briefed with this costs less and produces a better document than one
starting from "we're building a resale app."

**Drafting notes appear like this:** > ⚖️ *Note to counsel: …*

Every clause maps to a tick in the in-app agreement (`src/compliance/agreements.js`),
so the contract and the interface say the same thing. Change one, change both.

---

## SELLER AGREEMENT

**Between:** [LEGAL ENTITY NAME], a company licensed in [Dubai DET / free zone],
licence number [—], registered at [—] ("**lili**", "we", "us")

**And:** the person or entity opening a shop on the lili marketplace
("**Seller**", "you")

**Version:** 2026-08-12 · **Effective:** on acceptance in the app

> ⚖️ *Note to counsel: the licensed activity should read as marketplace or
> intermediary services, not retail trading. The whole agreement depends on
> lili not being the seller, and the licence is the first place that is tested.*

---

### 1. What this agreement is

1.1 lili operates an online marketplace where individuals and businesses offer
pre-owned fashion items to buyers. lili does not own, hold, inspect, price,
dispatch or sell the items listed.

1.2 This agreement governs the relationship between lili and you as a Seller. It
does not govern your sale to a buyer. Each sale creates a separate contract
between you and that buyer, to which **lili is not a party**.

1.3 By opening a shop you accept this agreement and the lili Platform Terms. Where
they conflict, this agreement prevails for matters concerning selling.

> ⚖️ *Note to counsel: 1.2 is the load-bearing clause. Everything about VAT
> treatment, consumer-law liability and intermediary protection follows from it.
> Please confirm the wording is sufficient under Federal Decree-Law No. 14 of
> 2023 and that nothing elsewhere in our documents or interface contradicts it.*

### 2. You are the seller

2.1 You are the merchant of record for every item you list. You warrant that you
own each item outright or are authorised to sell it.

2.2 You set the price. lili does not set, cap or direct pricing.

2.3 You are responsible for describing, photographing, dispatching and, where
required, refunding each item.

2.4 lili provides the listing platform, buyer introduction, payment facilitation
through a licensed provider, dispute handling, and the marketplace rules.

### 3. Authenticity and intellectual property

3.1 You warrant that every item is genuine and not counterfeit, replica or
otherwise infringing.

3.2 You will not describe an item as a brand it is not, nor use a brand name in
a way that suggests an association that does not exist.

3.3 lili operates a notice-and-takedown process for rights holders. On a valid
notice we may remove a listing without prior notice to you. You may contest
removal under clause 9.

3.4 Items from brands listed in the High-Value Schedule may not be listed without
completing lili authentication.

> ⚖️ *Note to counsel: 3.4 replaces a clause in the earlier draft that
> "discouraged" ultra-luxury brands while disclaiming all responsibility for
> authenticity. That combination was untenable — lili markets an authentication
> service and displays an "Authentic & Verified" badge, so a blanket disclaimer
> both contradicts the product and, we suspect, would not survive UAE consumer
> protection review. Please advise on 3.4 as drafted.*

> ⚖️ *Note to counsel: we need a repeat-infringer policy that is actually applied
> — safe harbour is conditional on it. Clause 9 is our proposal.*

### 4. What may not be sold

4.1 You will not list anything prohibited under the Prohibited Items Schedule or
unlawful in the market you sell into, including: counterfeit goods; weapons;
alcohol, tobacco and vaping products; medicines, supplements and unregistered
cosmetics; used intimate apparel; protected-species materials without valid CITES
documentation; and items bearing religious text or imagery.

4.2 Listings are screened before publication. A listing may be blocked, held for
review, or removed after publication.

4.3 Photographs must not contain nudity or sexually suggestive content.

> ⚖️ *Note to counsel: please confirm 4.1 against current UAE restricted-goods
> lists, and advise whether 4.3 needs to be more specific for local content
> standards.*

### 5. Accuracy

5.1 Photographs must be of the actual item. Stock or manufacturer images may not
be used as the primary image.

5.2 You must disclose all damage, wear, repair, alteration and missing components.

5.3 An item materially different from its description entitles the buyer to a
refund under clause 8, regardless of your return policy.

### 6. Verification, and your own obligations

6.1 You must hold a verified mobile number to list, and complete identity
verification before receiving any payout. The payout account must be in your own
name.

6.2 If you sell as a business you must provide a valid trade or e-trader licence
and, where applicable, a VAT registration number.

6.3 If your activity indicates trading — by volume, frequency or value — we may
require you to move to business seller status. Thresholds are in the Verification
Schedule.

6.4 You are responsible for your own licensing and taxes. lili may be required to
report your earnings to a tax authority and will tell you if it does.

> ⚖️ *Note to counsel: two open questions. (a) Is lili obliged to verify that an
> individual seller holds a Dubai e-trader licence, or only to require it
> contractually? (b) Do current UAE rules impose platform reporting of seller
> earnings comparable to DAC7 or 1099-K?*

### 7. Money

7.1 Buyer payments are collected and held by a licensed payment provider. **lili
does not hold seller or buyer funds.**

7.2 Funds are released to you after delivery is confirmed or the delivery window
closes, whichever is earlier, less lili's commission.

7.3 lili's commission is [—]% of the sale price, invoiced separately, plus VAT
where applicable.

7.4 Refunds are made against the original payment by the payment provider. lili
will not offset a refund against your future payouts.

7.5 Payouts may be held where a dispute, appeal or verification matter is open.

> ⚖️ *Note to counsel: 7.1 is intended to keep lili outside CBUAE payment-services
> licensing. Please confirm that the commission arrangement in 7.3 does not
> itself constitute a regulated activity, and review the seller agreement's
> agent-versus-principal characterisation for VAT — our tax position on whether
> lili is a deemed supplier turns on how this clause is written.*

### 8. Returns, and what the buyer is owed

8.1 If you sell as a business, the buyer's statutory rights apply in full,
including any right of return or withdrawal in their market.

8.2 If you sell privately, statutory consumer rights generally do not apply. The
buyer is told which you are before purchase.

8.3 Regardless of 8.2, a buyer is entitled to a refund where an item is
counterfeit, materially not as described, or never arrives.

> ⚖️ *Note to counsel: 8.3 is a deliberate commercial choice above the statutory
> floor. Please confirm it is enforceable against a private seller and drafted so
> it does not convert lili into a guarantor of every sale.*

### 9. Breaches, strikes and appeals

9.1 Strikes accrue on a 12-month rolling basis:

| Strikes | Consequence |
|---|---|
| 1 | Listing removed, reason given |
| 2 | Listing removed, selling paused 7 days |
| 3 | Shop closed, payouts held pending review |

9.2 Every decision is given with reasons to you and to the reporter.

9.3 You may appeal any strike within 14 days. **An appealed strike does not count
until the appeal is decided.**

9.4 Serious breaches — counterfeit sale, fraud, unlawful goods — may result in
immediate closure without accruing strikes.

9.5 Nothing here limits your right to take a dispute to [Dubai Department of
Economy and Tourism] or to a court of competent jurisdiction.

### 10. Data

10.1 lili is the controller of personal data you provide to operate your shop, as
described in the Privacy Notice.

10.2 Where you receive buyer personal data to fulfil an order, you are an
independent controller of that data and must use it only to complete the sale.

> ⚖️ *Note to counsel: 10.2 is the standard marketplace position but the
> controller/processor analysis under the UAE PDPL should be confirmed,
> particularly given the executive regulations position.*

### 11. Suspension and closure

11.1 You may close your shop at any time. Open orders must be completed.

11.2 We may suspend or close your shop for breach of this agreement, on legal or
regulatory requirement, or where we reasonably suspect fraud.

11.3 Clauses 3, 6.4, 7.4, 8.3, 10 and 12 survive termination.

### 12. General

12.1 Governing law: the laws of the United Arab Emirates as applied in the Emirate
of Dubai. Courts of Dubai have jurisdiction.

12.2 This agreement is provided in Arabic and English. **In the event of conflict,
the Arabic text prevails.**

12.3 We may amend this agreement on 30 days' notice. Material changes require
fresh acceptance in the app.

> ⚖️ *Note to counsel: 12.1 needs confirming against the licensing route — a free
> zone entity may point at DIFC or ADGM instead, which changes both the law and
> the forum. 12.2 reflects our understanding that Arabic prevails in UAE consumer
> contracts; please confirm and produce the Arabic text, which must be a legal
> translation rather than the interface strings we currently have.*

---

## SCHEDULES REFERENCED — all pending

| Schedule | Source | Status |
|---|---|---|
| High-Value Brands | `listingRules.js` → `BRAND_FLOORS` | Draft in code |
| Prohibited Items | `markets.js` → `AE.prohibited` | Draft in code |
| Verification thresholds | `sellerRules.js` → `KYC_TIERS` | Draft in code |
| Commission rate | — | **Not decided** |
| Delivery windows | `sellerRules.js` → `SHIPPING` | Draft in code |

## What counsel must decide before this can be used

1. **Agent or principal for VAT.** Clause 7 decides it. It is the single most
   expensive question here.
2. **Governing law and forum** — mainland Dubai, DIFC or ADGM.
3. **Whether 8.3 is enforceable** against a private seller as drafted.
4. **Whether lili must verify** individual sellers' e-trader licences.
5. **Arabic legal translation**, which prevails over the English.
6. **Commission rate**, which is commercial, not legal — but the clause is blank.

## The two companion documents

This is one of three. Do not let them be merged:

- **Platform Terms** — lili ↔ every user. The only contract lili is a party to.
- **Seller Agreement** — this document.
- **Terms of Sale** — seller ↔ buyer. lili must not be a party. Most likely a
  short set of default terms each seller adopts, which counsel should draft so
  that lili supplies the template without becoming a contracting party.
