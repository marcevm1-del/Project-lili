# v2.9.4 — the screen a buyer completes

Companion to `claude/v2.9-discovery-and-honesty.md`. Full note ships in the repo
as `UPGRADE-v2.9.4.md`.

**1,105 checks green** · 370 research · 223 security · 199 smoke · 71 walkthrough
· 66 device · 55 visual · 26 image-quality · 23 i18n · 23 functional · 17 loading
· 15 a11y screens · 13 integration · 13 keyboard · 13 settings · 6 old-WebView.

## What was wrong

The cart claimed lili holds the buyer's payment, added a **9% buyer-side service
fee that does not exist** (the 9% is charged to the seller at payout), offered
three unconnected payment methods, and after "Proceed to Checkout" told her
*"Order placed! Your seller has been notified."* — writing nothing anywhere and
telling nobody. A buyer could finish that flow and wait for a delivery no one
knew to send.

Found by auditing the v2.9.3 translation migration: one asymmetric dictionary
pair (`lili_service_fee_9`) led into the cart.

## What it is now

A **list, not a basket**, and it says so at the top. Pieces group by seller, each
group showing her pieces at their own prices and one button — **Ask about
these** — which opens the conversation. Quantity removed: a resale listing is one
specific second-hand piece. The money sentence is `HOW_MONEY_WORKS.short`, the
same string the Legal Centre reads, so the two cannot drift apart again.

## Escrow claims six and seven

- `agreements.js` merchant-of-record clause — the one a seller signs — had her
  agreeing to dispatch with tracking and to lili holding payment until delivery.
  None of that exists. Rewritten to what actually happens.
- `sellerRules.js` `disputeRoute().holdFunds` promised a hold on funds. Now
  branched on `PAYMENTS_LIVE`; while false it says there is no payment to hold.

## Five passing tests were replaced

`functional.test.mjs` had been asserting the subtotal/fee/total arithmetic and a
quantity control — passing for months, protecting a fee that does not exist and a
control for buying two of a unique object. Replaced with assertions of the real
behaviour, including that no "Service Fee" or "Subtotal" text appears and that no
quantity control exists. The comment above them records what they used to say.

## Still open

- **Anonymous sign-in is switched off on the Supabase project.** The one blocker
  `npm run preflight` reports; only the founder can flip it. Until then every
  install is a single-player game.
- ~861 English-only strings await a translator; interface coverage stays at 13%
  and `languages.js` still says `partial`.
- Payments, escrow, shipping, third-party auth, iOS and push remain unbuilt, and
  every screen that touches them says so.
