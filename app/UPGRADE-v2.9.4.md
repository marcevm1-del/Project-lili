# v2.9.4 — the screen a buyer completes

**1,105 checks across the suites · 370 research · 223 security · 199 smoke · 71
walkthrough · 66 device · 55 visual · 26 image-quality · 23 i18n · 23 functional
· 17 loading · 15 a11y screens · 13 integration · 13 keyboard · 13 settings · 6
old-WebView · contrast clean.**

---

## How this was found

v2.9.3 split 118 bilingual labels into a dictionary. This release began as an
audit of that automated migration — did the script get every one right?

It did not, in two ways. Three explanatory **comments** had been rewritten into
`t("…")` calls, because the script ran on raw source rather than
comment-stripped source. And five dictionary pairs were **asymmetric**: the two
languages said different things, so each reader was given different information
after the split.

One of those five was `lili_service_fee_9` — English *"LILI Service Fee (9%)"*,
Arabic without the rate. Chasing it into the cart is how the rest of this
release happened.

## The cart was the most dishonest surface left in the app

Worse than the escrow claims fixed in v2.9, because a buyer does not merely read
this one — she **completes** it. What it did:

- claimed lili holds her payment and would refund her
- added a **9% buyer-side service fee that does not exist**, at a rate that is
  not the rate — the 9% is charged to the *seller*, at payout
- offered three payment methods, none of which are connected to anything
- and after "Proceed to Checkout", which set a boolean, told her:

  > **Order placed!** Your seller has been notified. They'll confirm and arrange
  > delivery within 24 hours.

Nothing was written anywhere. The seller was never told. No payment was taken —
including the invented fee, so she was quoted a total she would never be
charged. A woman could finish that flow and sit waiting for a delivery that no
one on earth knew to send.

## What it is now

A **list, not a basket** — and it says so, at the top, before she reads a single
price:

> **This is a list, not a basket.** lili doesn't handle your money at all. You
> and she agree a price here, meet, and you pay her in person.

That second sentence is `HOW_MONEY_WORKS.short`, the same string the Legal
Centre reads, so the cart cannot drift from the rest of the app again.

Pieces group **by seller**, each group showing her name, her pieces at their own
prices, her subtotal, and one button: **Ask about these**. That opens the
conversation with the message already written. Below the groups: *"Each seller
is a separate arrangement — you agree a price and a place with each one, and pay
her when you meet."*

**Quantity is gone.** A resale listing is one specific second-hand piece; "2 of
that dress" was never a thing anyone could buy. `addToCart` now refuses a
duplicate instead of incrementing a count.

## The sixth and seventh escrow claims

v2.9 found four surfaces claiming lili holds the money. The cart was the fifth.
Grepping for the pattern properly turned up two more, both in text that carries
more weight than a screen does:

- **`agreements.js` — the merchant-of-record clause, the one a seller signs.**
  It had her agreeing that she *"dispatches within 3 working days with
  tracking"* and that *"lili runs the marketplace and holds the payment until
  delivery."* There is no shipping, no tracking, and no payment held. She now
  agrees to what actually happens: she hands it over herself, and the buyer pays
  her directly.
- **`sellerRules.js` — `disputeRoute().holdFunds`.** It promised a hold on funds
  during a dispute. Now branched on `PAYMENTS_LIVE`; while false it reads
  *"There is no payment for anyone to hold — you paid her directly."*

## Five tests were deleted, and that is the part worth reading

Rewriting the cart broke five assertions in `functional.test.mjs`:

```
✗ cart shows subtotal, fee and total
✗ subtotal matches the line price
✗ the 9% service fee is calculated correctly
✗ total is subtotal plus fee
✗ quantity can be changed
```

Every one of them had been **passing for months**. Every one of them was
protecting a lie: the arithmetic of a fee that does not exist, and a control for
buying two of a unique object. This is exactly the shape of the moment where a
change quietly deletes the test that objects to it, so the replacements assert
the screen's real job rather than nothing:

- the piece is on the list at a real price, and the seller's subtotal is the sum
  of her lines **and nothing else** — no third figure on the screen
- the list says plainly it is not a basket, and that lili does not handle money
- **no** "Service Fee" or "Subtotal" text anywhere
- **no** checkout that doesn't check anything out
- **no** quantity control — its absence is now the assertion
- "Ask about these" genuinely opens the conversation

The comment above them records what they used to say and why they stopped, so
the next person to read it knows a test was replaced rather than lost.

One of the new checks compared the cart's price against a price scraped from the
listing screen and failed: 12,900 against 1,800. That was the test being wrong —
the detail modal renders over the grid, so `innerText` there picks up a tile
behind it. The old comment had warned about precisely this trap, and it got
re-set anyway. Fixed, and the warning is back in the file.

## The migration audit, in full

- **three comments un-rewritten** and a research check added so the script's
  output cannot corrupt prose again
- **five asymmetric pairs corrected**; research section 50 now asserts every
  entry says the same thing in both languages
- `research.test.mjs` grew sections 49 and 50 — **370/370 passing**

---

## Still open, unchanged

Anonymous sign-in is still switched off on the Supabase project — still the one
blocker `npm run preflight` reports, and still the only thing that makes every
install a single-player game. Only the founder can flip it.

About **861 strings** are still English-only. The mechanism is built and waiting
for a translator's file; the interface figure stays at **13%**, and
`languages.js` still says `partial` because the suite will fail if it doesn't.

Payments, escrow, shipping, third-party authentication, iOS and push remain
unbuilt, and every screen that touches them says so.
