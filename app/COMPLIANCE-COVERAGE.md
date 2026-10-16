# The fourteen areas — what got built, and what can't be

Your list, honestly scored. Three buckets: **code** (built and tested),
**document** (a lawyer drafts, I can only structure), and **company** (nothing
in a repo will ever satisfy it).

I am not a lawyer. Everything below is engineering scaffolding for a lawyer to
fill, not legal advice, and no market ships as `live` until one signs off.

| # | Area | Bucket | State |
|---|---|---|---|
| 1 | Licence | Company | ✗ Not code. See below |
| 2 | Seller verification (KYC) | Code | ✓ 4 tiers, risk-triggered |
| 3 | Consumer protection | Code | ✓ Per-market windows, seller-type aware |
| 4 | Privacy & data protection | Code | ✓ Consent, export, deletion, audit |
| 5 | Terms & Conditions | Document | ◐ Structured, unwritten |
| 6 | Seller agreement | Document | ◐ Structured, unwritten |
| 7 | Refund & return policy | Code + Doc | ◐ Rules encoded, wording pending |
| 8 | Prohibited items | Code | ✓ Enforced at listing time |
| 9 | Counterfeit & IP | Code | ✓ Screening, takedown, strikes |
| 10 | Payment regulations | Code | ✓ Posture encoded, no float |
| 11 | VAT & tax | Code | ✓ Per-market, incl. deemed supplier |
| 12 | Shipping & delivery | Code | ✓ Rules + risk transfer |
| 13 | Dispute resolution | Code | ✓ 3-stage, statutory route preserved |
| 14 | Safety & moderation | Code | ✓ Report, block, strikes, screening |

---

## What the code actually does now

**Prohibited items (8)** — every listing is screened as it's typed. Three
verdicts, not two: `block` won't publish at all, `review` publishes to a human
queue first, `warn` publishes with advice. A blocked verdict disables the publish
button — a prohibited item must never be one accidental tap from going live.

**Counterfeit (9)** — three independent signals. Self-declaration ("replica",
"mirror quality", "1:1") is a hard block. Lookalike phrasing and missing
provenance go to review. And the price floor: a Chanel flap at AED 400 is the
strongest counterfeit signal that exists, so it goes to review unless
authentication is attached.

That last check is your own `isCaliberOK` from the original prototype — the
function with the Cyrillic character in its name that was defined and never
called. It now runs, with real brand floors behind it.

**KYC (2)** — four tiers that escalate on behaviour, not declaration. Browsing
needs nothing. Listing needs a verified phone. A payout or AED 10k of sales needs
government ID with a name that matches the payout account. AED 100k or 50 sales
forces business tier whether or not the seller called themselves one — because
regulators look at what you did, not what you ticked.

**Payments (10)** — one rule does the heavy lifting: **lili never holds the
money.** A licensed processor holds and releases it; we invoice commission
separately. That is what keeps you out of CBUAE payment-services licensing. Three
red lines are written into the code as such, including never netting a refund off
a future payout.

**Tax (11)** — separates the two questions people conflate. VAT on lili's
commission is nearly certain once registered. VAT on the *seller's* sale depends
on deemed-supplier rules, and the UAE entry is deliberately marked `"review"`
rather than yes or no, because agent-vs-principal turns on how the seller
agreement is worded. Get that in writing before you launch, not after.

**Disputes (13)** — three stages, funds held by the processor throughout, and an
explicit statement that using lili's process does not remove the buyer's right to
go to Dubai DET or to court. A platform process that behaves like the only route
is itself a consumer-law problem.

**Advertising (14)** — promoted listings must be labelled, and three claim
patterns are auto-rejected: "100% authentic", "guaranteed", and anything framing
resale as an investment. Also flagged: paid creator promotion in the UAE requires
the creator to hold a media licence. That's the creator's obligation, but paying
unlicensed promoters is your exposure.

## Verified

`npm run smoke` — **41 checks, all passing.** Covers the gate, the intermediary
disclosure rendering on a real listing, every screening verdict, tier escalation,
tax positions, and dispute routing.

Two real bugs surfaced by writing it:

1. **Two React contexts.** `./ComplianceProvider` and `./ComplianceProvider.jsx`
   resolved as separate modules, so the provider filled one context and the
   marketplace read the other. Fixed by moving the context to a leaf module
   (`context.js`) that everyone imports identically.
2. **A pre-existing crash in your prototype.** `HomePage` was passed `cartCount`
   and `setTab` but never destructured them, so the home feed threw
   `ReferenceError` on render. Fixed. I scanned every component for the same
   pattern — that was the only real instance.

---

## 1. Licence — the one nothing here can touch

You cannot code your way to a trade licence. Before a single dirham moves:

- A trade licence from Dubai DET or a free zone, with the activity described as
  **marketplace / intermediary services, not retail trading.** The activity
  wording matters — it is the paper record of the position everything else here
  depends on.
- Business sellers evidence their own licence at onboarding. That's tier 3.
- Individual sellers in Dubai may need an e-trader licence of their own. Whether
  you're obliged to check is a question for your counsel, and the answer changes
  what tier 1 has to collect.

## 5, 6, 7 — the three documents

Structured but not written, and I won't fake them. A T&C I generate reads
plausibly and protects nobody. What matters is that they're **three separate
documents**, which is the thing most marketplaces get wrong:

- **Platform Terms** — lili ↔ user. This is the only contract lili is a party to.
- **Seller Agreement** — lili ↔ seller. Must state that the seller is the
  merchant of record. This document is also what settles the VAT question above.
- **Terms of Sale** — seller ↔ buyer. **lili is not a party to it.** The moment
  lili writes itself into the sale contract, the intermediary position weakens.

The app already reflects the split: the consent screen asks you to accept
"lili's Platform Terms", not "Terms of Sale", and tells you the purchase is a
separate agreement with the seller.

Refund rules (7) are encoded per market and per seller type — private sellers owe
no statutory return, business sellers do, and the buyer is told which they're
dealing with before they pay. The customer-facing *wording* still needs drafting,
in Arabic and English.

## Still open

- Moderation queue has no server behind it — reports are captured, nothing reads them
- Geo-resolution is client-side and advisory; the real check must run server-side on IP
- Audit trail is local-only, so it isn't yet a compliance record
- Nothing translated properly — Arabic is labels, not legal text
- EU DSA reasoned decisions and appeals: flagged, not built
