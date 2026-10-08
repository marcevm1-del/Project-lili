# Backend contract

The app now persists. Your shop, your listings and your cart survive a restart,
and a moderation decision has somewhere to live. What persistence does **not**
fix: two devices still cannot see each other. That is the last thing standing
between this and a real marketplace, and it is the reason Google would still
reject it today.

This document is the spec for closing that gap. Everything client-side is already
shaped for it — three seams, and nothing above them changes.

## The three seams

| Seam | File | Swap |
|---|---|---|
| Catalogue | `src/data/repo.js` | 6 functions → HTTP |
| Moderation | `src/compliance/moderation.js` | `read` / `write` → HTTP |
| Compliance state | `src/compliance/store.js` | keep local, mirror to server |

Each is deliberately narrow. `repo.js` has six functions listed in
`BACKEND_SWAP.functions`; `moderation.js` has exactly two. Replace those eight
and the app is multi-user.

## Recommended stack

**Firebase** is the shortest path — Auth, Firestore, Storage and Functions with
no server to run. **Supabase** if you would rather have Postgres and row-level
security, which makes some of the rules below easier to express and audit.

Either satisfies the UAE data-residency preference if you pick a region
deliberately. Do that at project creation; it cannot be changed afterwards.

## Schema

```
users/{uid}
  phone, phoneVerified, email
  marketCode                    AE | SA | EU | GB | US
  ageChecked { year, passed, at }
  kycTier                       0 | 1 | 2 | 3
  kycEvidence { idType, idVerifiedAt, payoutAccountName }
  agreements [{ clauseId, version, at }]
  consent { analytics, marketing, personalisation, policyVersion, at }
  blockedShops [shopId]
  deletedAt                     soft delete — see retention below

shops/{shopId}
  ownerUid, name, nameAr, bio, banner
  sellerType                    private | trader
  status                        active | paused | closed
  licenceNumber, vatNumber      required when sellerType = trader
  strikes                       derived, never client-written
  createdAt

items/{itemId}
  shopId, ownerUid
  title, titleAr, brand, category, size, condition, price, currency
  images [storagePath]
  status                        live | in_review | removed
  screening { verdict, findings[], at }
  marketCode
  createdAt, removedAt

orders/{orderId}
  buyerUid, shopId, itemId, price, currency
  processorRef                  the payment provider's id — the source of truth
  state                         paid | shipped | delivered | refunded | disputed
  trackingRef, dispatchedAt, deliveredAt

moderation_cases/{caseId}
  targetId, kind, shopId, reasons[], reportCount
  state                         pending | reviewing | upheld | dismissed | appealed | overturned
  slaHours, createdAt, updatedAt
  decision { action, note, strikeApplied, statementToReporter, statementToSeller, at }
  appeal { grounds, outcome, at }

audit/{entryId}                 append-only, server timestamps only
  uid, type, detail, at
```

## Endpoints

Client functions map one to one:

```
GET   /items?market=&status=live&cursor=     repo.getItems
POST  /items                                 repo.addItem
PATCH /items/:id                             repo.updateItem
GET   /shops?market=                         repo.getShops
POST  /shops                                 repo.createShop
PATCH /shops/:id                             repo.updateShop

POST  /moderation/cases                      moderation.enqueue
GET   /moderation/cases?state=               moderation.listQueue
POST  /moderation/cases/:id/claim            moderation.claim
POST  /moderation/cases/:id/decide           moderation.decide
POST  /moderation/cases/:id/appeal           moderation.appeal
POST  /moderation/cases/:id/appeal/resolve   moderation.resolveAppeal
GET   /sellers/:shopId/standing              moderation.sellerStrikes

GET   /me/export                             data access request
POST  /me/delete                             erasure request
GET   /geo/resolve                           market from request IP
```

## Rules the server must enforce

These are not optional hardening. Each one is a hole the client cannot close.

1. **Never trust a client id, price, owner or status.** The client sets none of
   these; the server assigns them from the authenticated session.
2. **Screen server-side.** `screenListing()` runs on the client as a courtesy so
   the seller sees the problem while typing. It is not a gate — anyone can call
   the API directly. Run the same function on write and store the verdict.
3. **Resolve geo from the request IP.** The client reads timezone and locale,
   both one settings toggle from being anything the user wants. Our own test
   demonstrates it: jsdom reports `en-US` and the app resolves to the United
   States. No transaction proceeds on a client-declared market.
4. **Server timestamps only.** SLA clocks, consent records and audit entries must
   never use the device clock.
5. **Decisions are immutable.** Correct a moderation decision by writing a new
   record, never by editing the old one.
6. **Soft delete everywhere.** A hard delete destroys the evidence behind a
   contested decision.
7. **Strikes are derived, never written by a client.** And an appealed strike
   does not count until resolved — that logic already exists in
   `moderation.sellerStrikes` and must be reimplemented server-side, not trusted
   from the client.
8. **Payouts require KYC tier 2** and a payout account name matching the verified
   ID. Enforce at the API, not the UI.

## Retention

Deletion is not one action. Different data has different rules:

| Data | On account deletion |
|---|---|
| Profile, shop, listings, messages | Delete |
| Consent and agreement records | **Keep** — they are the proof you had consent |
| Completed orders and invoices | **Keep** — tax law, typically 5+ years in the UAE |
| Moderation decisions | **Keep**, pseudonymised |
| Audit trail | **Keep**, pseudonymised |

The in-app deletion screen already tells users that completed orders survive
deletion. The retention schedule behind it needs your lawyer's sign-off.

## Also still needed outside the app

- **A public account-deletion page.** Google Play requires deletion to be
  requestable without installing the app. It is a web page, not code in this repo.
- **Push notifications** for offers, messages and moderation outcomes.
- **Image upload** — `@capacitor/camera` plus Storage, with EXIF stripped on
  upload. Location metadata in a photo of someone's home is a privacy incident
  waiting to happen.

## Build order

1. Auth and users — everything else hangs off a uid
2. `repo.js` swap — the app becomes multi-user, and the Play rejection risk goes
3. Image upload — listings stop being emoji
4. Orders and payments via the processor
5. `moderation.js` swap — reports reach a person
6. Push, then the deletion page
