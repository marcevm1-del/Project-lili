# v2.11.3 — the thirteenth claim, and the file nothing scanned

A beginner's guide to building a mobile app, read against this project. Almost
none of it applied: lili is twelve releases past idea validation, MVP scoping and
choosing a stack, and it already does the guide's central habit — build one
feature, verify separately, review separately without fixing — better than the
guide describes it.

One line in it did apply. On the App Store checklist, under Store listing:
*"Marketing text does not promise unavailable functionality."*

Nothing in this project had ever checked that. Every suite pointed at the app.

**1,185 checks · 452 research · 223 security · 199 smoke · 71 walkthrough · 66
device · 55 visual · 32 UX-audit · 30 i18n · 26 image-quality · 24 UX-laws
measured on the glass · 23 functional · 17 loading · 15 a11y screens · 13
integration · 13 keyboard · 13 settings · 6 old-WebView.**

---

## Three pills on the screen where a buyer decides

The listing detail page carried, directly above the notice that says lili is not
the merchant and two lines above the button:

> Buyer Protection · Secure Payment · Verified Seller

These are the same three promises v2.9 removed from the splash screen —
*"Authentic & Verified", "Secure Payments", "Fast Delivery"* — surviving on the
one screen where somebody is deciding whether to hand money to a stranger. Each
is false in the same way it was false then: there is no protection scheme, there
is no payment of any kind, and nothing in this app verifies a seller.

The third is the sharpest, because the guard for it exists. `trust/
authentication.js` refuses to issue a badge while no authenticator is registered,
and `badgeFor` returns null. A row of pills was issuing one anyway, in plain text,
around the check.

**It is not replaced with three weaker true pills.** Three reassurance chips in a
row *are* the reassurance; keeping the shape with better wording is the same move
persuasion.js refuses. It is replaced by the one thing that is true and that
nothing else on that screen says:

> lili doesn't take payment or handle delivery. You and the seller agree how to
> pay and where to meet.

## Why the claims register missed it

`NEVER_CLAIM` has a `verified-badge` pattern. It is `/\bVERIFIED\b/` —
**case-sensitive**, written to kill a badge that rendered in capitals. The pill
said "Verified Seller", and the store copy said "verified seller shops". Both
walked past a guard written for the same claim in a different case.

Three patterns added: `seller-verified`, `reviews-that-do-not-exist`,
`buy-outright`, each lower-case-insensitive, each named in a test so that
removing one is a deliberate act rather than a regex edit.

## Every demo shop had invented followers

`Stars` has refused to show a rating for a demo shop since v2.8, because the seed
catalogue walked over the review threshold with fabricated numbers. The follower
count printed immediately beside it never got the same rule: 532, 1240, 987, 341,
912, 276 — on the listing detail, the shop header and the story rows.

v2.11.1 removed exactly this from the user's own profile — *"156 followers and 78
following, on an app where nobody has followed anybody"* — and left the six demo
shops printing theirs. One helper, `earnedFollowers`, applies the rule `Stars`
already had. A demo shop shows nothing, because it is not a person. A real shop
shows its count, including zero, which is a fact.

## The store listing promised two things the app cannot do

`PLAY-STORE-CHECKLIST.md` carried suggested store copy. No scan opened it,
because it is markdown.

> • Verified seller shops with ratings and reviews

Nothing verifies a seller, and there are no reviews — the fabricated 4.9 from
"2,000+ reviews" came out in v2.8, and the listing text was still promising them.

> • Make an offer, or buy outright

You cannot buy. The payments seam refuses every call while no processor is
registered.

The copy now lives in **`store/listing.md`** on its own, and `npm run research`
runs the same `NEVER_CLAIM` patterns over it that it runs over the source. The
Play description is read by more people than any screen in the app and was the
only user-facing text nothing checked.

That file deliberately quotes none of the sentences it replaced. This project has
three times written a check that matched the comment explaining it.

## The Play checklist described a different app

The rest of `PLAY-STORE-CHECKLIST.md` was written at v2.7 and never revised. It
said everything was a hardcoded JavaScript array, that there was no sign-in, that
there was no reporting or moderation or account deletion — "this is a hard
rejection" — and that a 512×512 icon and a feature graphic were in `store/`.

The first four had been true and stopped being true. The last was never true:
there was no `store/` directory. A checklist that misstates the app is the same
defect as a screen that misstates it, and this one was the file you read the
night before submitting.

Rewritten against `npm run audit` and `npm run preflight` as they run today,
including the part the guide was right about and nothing here had covered: **what
the reviewer needs.** Access if the beta gate is on, an awake Supabase project
(free projects pause, and a paused project during review is an app that fails on
first launch), and a note explaining what is deliberately absent. Plus a
rejection protocol — reproduce on the submitted build, fix the smallest complete
issue, change one thing.

## DESIGN.md

The guide's strongest idea, and the one artefact this project genuinely lacked.

lili can write a better one than the guide describes, because nearly every rule
in it is already enforced by a command: the type scale and the 4px rhythm and the
44px targets by `npm run uxlaws`, the palette by `npm run contrast`, the claims
and the dark patterns by `npm run research`. So `DESIGN.md` is a map of what is
true today rather than a statement of intent, and it names the command that fails
when each rule is broken.

It ends with the rules that no check covers — icon stroke weight, motion timing,
photograph crop, the tone of individual copy, whether a screen feels like lili —
marked as reviewed by eye. If one of those is worth keeping, the next step is a
check for it, not a longer paragraph.

---

## What the guide was right about and lili already does

Worth saying, so it does not get re-implemented: the feature packet, acceptance
criteria as the finish line, verify-then-review-separately, "what did you not
test", checkpoint before a risky change, giving testers a mission instead of
"what do you think" — `FIRST-TEN.md` does that last one considerably better,
with four sellers, three buyers, two who are both, and one who is trying to
break it.

Its iOS material is filed against `IOS.md` for whenever that starts: the Apple
Developer Program at $99/year, a TestFlight build good for 90 days, 100 internal
and 10,000 external testers — and the advice to open the account early, because
verification and agreements are administrative work that should not be discovered
the night you want to launch.

---

## Still open

Unchanged: anonymous sign-in is off and is now written up as what it actually is
— a Minimum Functionality rejection delivered by a switch, not by missing code.
775 strings are English-only. Payments, authentication, push, shipping and iOS
are unbuilt, each behind a seam that refuses rather than a screen that pretends.

The APK here is debug-signed for sideloading. It is not the artefact Play takes.
