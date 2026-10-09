> **Superseded on 9 Oct 2026.** Written for a payments-and-delivery model lili does not run (a licensed processor holding funds, payouts, shipping labels, an authentication badge). The current policies are generated from `app/src/legal/policies.js`; see `docs/policies/README.md`. Kept for counsel because the clauses will matter if payments or delivery are added.

# PLATFORM TERMS & PRIVACY NOTICE — WORKING DRAFTS

**Not legal documents. Structured drafts for a UAE-qualified lawyer to review,
correct and complete.** I am not a lawyer and none of this has been reviewed by
one. Do not publish or rely on it until it has been.

These are two of the three documents. The third, the Seller Agreement, is in
`SELLER-AGREEMENT-DRAFT.md`. **Do not let anyone merge them** — the separation is
what keeps lili an intermediary rather than a party to every sale.

| Document | Between | lili's role |
|---|---|---|
| Platform Terms | lili ↔ every user | Party |
| Seller Agreement | lili ↔ seller | Party |
| Terms of Sale | seller ↔ buyer | **Not a party** |

Drafting notes appear as: > ⚖️ *Note to counsel: …*

---
---

# PART ONE — PLATFORM TERMS

**Between:** [LEGAL ENTITY], licensed in [Dubai DET / free zone], licence
number [—] ("**lili**", "we")
**And:** any person using the lili app ("**you**")
**Version:** 2026-08-12

## 1. What lili is

1.1 lili is an online marketplace where people offer pre-owned fashion items to
one another. **lili does not own, hold, price, inspect, dispatch or sell any item
listed.**

1.2 When you buy something, you enter a contract with the seller. lili is not a
party to that contract. We provide the listing, the introduction, payment
facilitation through a licensed provider, and the rules.

1.3 These Terms govern your use of the app itself. Selling is additionally
governed by the Seller Agreement.

> ⚖️ *Note to counsel: 1.1 and 1.2 are load-bearing. Please check nothing in our
> marketing, interface or receipts contradicts them — a platform that lets buyers
> believe it is the seller can be treated as the seller.*

## 2. Using lili

2.1 You must be 18 or over, or the age of majority in your market if higher.

2.2 One account per person. You are responsible for what happens under it.

2.3 You will not: list or buy anything unlawful; impersonate anyone; harass
another member; scrape or copy the platform; or try to move a transaction off
lili to avoid fees or protections.

2.4 We may suspend or close an account that breaks these Terms, and will tell you
why unless the law prevents us.

## 3. Content you post

3.1 You keep ownership of your photos and descriptions. You grant lili a
non-exclusive, worldwide, royalty-free licence to host, display and reproduce
them for the purpose of operating and promoting the marketplace.

3.2 That licence ends when you delete the content, except for copies we must
retain under clause 8 of the Privacy Notice.

3.3 You warrant you have the right to post what you post.

> ⚖️ *Note to counsel: 3.1 should be the narrowest licence that still lets us run
> the app and market it. Please tighten if it is broader than necessary.*

## 4. Reporting, moderation and appeals

4.1 Anything on lili can be reported. We review reports and tell both the
reporter and the member concerned what we decided and why.

4.2 Decisions can be appealed within 14 days. An appealed penalty does not take
effect until the appeal is decided.

4.3 Using our process never removes your right to complain to a consumer
authority or to go to court.

## 5. Payments

5.1 Payments are collected and held by a licensed payment provider. **lili does
not hold your money.**

5.2 lili charges sellers a commission. Buyers pay the listed price plus any
delivery charge shown before payment.

## 6. What we are and are not responsible for

6.1 We are responsible for operating the platform with reasonable skill and care.

6.2 We are not responsible for the condition, legality, authenticity or delivery
of an item, which is the seller's responsibility — except where we have accepted
a specific responsibility, such as authentication of a piece we authenticated.

6.3 Nothing here excludes liability that cannot lawfully be excluded, including
for death, personal injury, or fraud.

> ⚖️ *Note to counsel: 6.2 deliberately avoids a blanket disclaimer. We market an
> authentication service and display an "Authentic & Verified" badge, so a clause
> disclaiming all responsibility for authenticity would contradict the product and
> would likely be unenforceable against a consumer. Please confirm the carve-out
> is drafted correctly and advise on the limitation-of-liability cap.*

## 7. Changes, law and disputes

7.1 We may change these Terms on 30 days' notice. Material changes require fresh
acceptance in the app.

7.2 Governed by the laws of the UAE as applied in Dubai. Courts of Dubai have
jurisdiction.

7.3 Provided in Arabic and English. **The Arabic text prevails.**

> ⚖️ *Note to counsel: 7.2 depends on the licensing route — a free zone entity may
> point at DIFC or ADGM instead.*

---
---

# PART TWO — PRIVACY NOTICE

**Controller:** [LEGAL ENTITY], [address], [licence number]
**Contact:** privacy@loveitorleaveit.ae
**Version:** 2026-08-12

> ⚖️ *Note to counsel: this must reflect what the app actually does. The app's
> behaviour is defined in `src/compliance/` — consent categories in
> `ComplianceProvider.jsx`, retention in `BACKEND-CONTRACT.md`. If the document
> and the code disagree, the code is what a regulator will find.*

## 1. What we collect

| Data | Why | Basis |
|---|---|---|
| Mobile number, email | Your account, verification | Contract |
| Year of birth | Confirming you are 18+ | Legal obligation |
| Shop name, bio, photos | Running your shop | Contract |
| Listing content | Showing items to buyers | Contract |
| Messages | So you can talk to a seller | Contract |
| Order and delivery details | Completing your purchase | Contract |
| Identity documents (sellers) | Verification before payout | Legal obligation |
| Device and app usage | Fixing crashes, improving the app | **Consent** |
| Recommendations from what you save | Ordering your feed | **Consent** |
| Email and push marketing | Telling you about new pieces | **Consent** |

We do **not** collect precise location. Photographs are stripped of embedded
location data before they are saved.

## 2. Your choices

2.1 Analytics, personalisation and marketing are **off until you switch them on**,
and can be switched off at any time in Profile → Privacy & Safety.

2.2 Withdrawing consent is as easy as giving it. Doing so stops that processing
from that moment; it does not erase what was already collected — use deletion
for that.

2.3 We do not sell your personal data.

> ⚖️ *Note to counsel: consent is unbundled from acceptance of the Platform Terms
> in the app deliberately, so that agreeing to the contract is not treated as
> consent to marketing. Please confirm this satisfies the PDPL.*

## 3. Who sees it

- **Other members** — your shop, listings and the messages you send
- **Buyers of your items** — the delivery details needed to complete the sale
- **Our payment provider** — to take payment and pay sellers
- **Delivery partners** — to deliver
- **Authorities** — where we are legally required

Sellers who receive buyer details are independent controllers of that data and
must use it only to complete the sale.

## 4. Where it is held

Stored in [region — set at project creation and not changeable afterwards].
Transfers outside the UAE happen only where an adequate safeguard is in place.

> ⚖️ *Note to counsel: please confirm the cross-border transfer basis under the
> PDPL, and whether the chosen hosting region satisfies it.*

## 5. Your rights

Access · Correction · Deletion · Portability · Objection · Withdrawal of consent
· Complaint to the UAE Data Office.

Exercise any of these in Profile → Privacy & Safety, or at
[loveitorleaveit.ae/delete-account]. We respond within 30 days.

## 6. Children

lili is not for anyone under 18. We do not knowingly collect children's data and
will delete any account we find.

## 7. Security

Encryption in transit and at rest. Access limited to staff who need it. We will
notify you and the regulator of a breach affecting you within 72 hours of
becoming aware.

## 8. How long we keep things

| Data | Kept |
|---|---|
| Account and profile | Until you delete it |
| Listings and messages | Until deleted, then [—] days in backup |
| Completed orders and invoices | [5+] years — tax law |
| Consent and agreement records | For as long as needed to prove consent |
| Moderation decisions | [—] years, without your name attached |
| Identity documents | [—] after verification |

> ⚖️ *Note to counsel: every bracketed period needs a real number from you, and
> the tax retention period confirmed against UAE requirements. The app already
> tells users that completed orders survive account deletion.*

---

## Before either can be published

1. Every `[—]` filled in
2. Legal review by UAE counsel
3. Arabic legal translation — it prevails over English
4. Hosted at public URLs; the Privacy Notice URL goes in the Play Console
5. The Play Data Safety form completed to match section 1 exactly
6. `POLICY_VERSION` and `AGREEMENT_VERSION` in the code bumped so every user
   re-accepts
