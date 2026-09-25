# v2.11.4 — persuasion, and the half of it that is refused in writing

The brief was to apply dark psychology and UX psychology to the inner design to
attract more customers. This release does the second and refuses the first, and
the refusal is code rather than an opinion.

**1,192 checks · 459 research · 223 security · 199 smoke · 71 walkthrough · 66
device · 55 visual · 32 UX-audit · 30 i18n · 26 image-quality · 24 UX-laws
measured on the glass · 23 functional · 17 loading · 15 a11y screens · 13
integration · 13 keyboard · 13 settings · 6 old-WebView.**

---

## Why not the dark half

Three reasons, in ascending order of how much they cost.

**It breaks the build.** `src/ux/persuasion.js` holds a `REFUSED` list, and
`npm run research` runs every pattern in it over every source file and every
dictionary string in both languages. Fake urgency, invented viewer counts,
confirmshaming and pre-ticked boxes fail the suite. Adding them means first
deleting the guard that has caught thirteen false claims — including three in
the last release, live in the shipped app.

**Google rejects most of it.** Play's Deceptive Behaviour policy covers drip
pricing, disguised ads, obstruction and bait-and-switch directly, and the app is
not yet submitted. UAE Federal Law 15/2020 requires price and terms to be clear
before commitment.

**It costs more than it earns here, specifically.** lili has no checkout. Every
transaction ends with a woman meeting a stranger in a mall in Dubai with three
thousand dirhams in her bag. The entire product runs on whether she believes
what the screen told her. A fake countdown buys one tap and spends the only
asset the marketplace has.

## So the taxonomy is written down instead

`REFUSED` went from eight patterns to sixteen. The eight added are the rest of
the standard set — **drip pricing, roach motel, forced continuity, obstruction,
nagging, friend spam, disguised promotion, bait-and-switch** — each with a regex
that fails the build and a sentence saying why it is refused *here*, not in
general. "Apply dark psychology" now has a specific answer in a file rather than
an argument in a conversation.

Two of them are commitments about features that do not exist yet, which is the
point of writing them before the features arrive: if a subscription is ever
built it is opt-in and cancellable in one screen, and if placement is ever sold
it is labelled paid.

---

## The honest lever, and it is the strongest one available

**A buyer now sees what pieces of that kind usually resell for, next to the
price.**

`data/resaleValue.js` has held a sourced band since v2.9 — brand tier × item
kind × condition, built from the Rebag Clair Report, The RealReal's 2025 resale
data and UAE market figures, with the sources named per entry. It has been shown
only on the offer sheet, where it helps a seller pick a number.

It was never shown to the person who most needs it. A woman looking at AED 3,200
for a bag from someone she has never met is asking one question — *is that a fair
price?* — and the app had no answer, while holding one.

Anchoring is the most powerful finding in this entire literature and the easiest
to abuse. The abusive version is a struck-through number the platform invented.
This is the same finding with a real anchor: a published range, its basis stated,
and `referenceBand` returns null for any brand it has no opinion about — so the
component renders nothing rather than reaching for something to say. That is most
of the answers, and silence is a legitimate one.

It deliberately delivers **no verdict**. No "great deal", no "below market", no
colour that reads as approval. The range, and where this price sits in it.

> Pieces of this kind usually resell here for **AED 1,800–4,600**. This one sits
> inside that range.
> *A guide from published resale data, not an appraisal of this piece.*

A test asserts the absence of the verdict words, because the sentence that turns
this from information into a sales pitch is one edit away and would look like an
improvement to whoever made it. A buyer told the number is good has been sold to.
A buyer shown the range has been informed — and she converts better, argues less,
and does not feel worked on afterwards.

---

## Shape five: labels that lead with the Arabic

Looking through the inner screens for persuasion turned up four more bilingual
labels, and one reason all of them survived.

Both halves of the i18n regression check asked "is the second half Arabic and the
first half not?" Every label written the other way round — Arabic first, English
after — walked past both, for as long as the check has existed.

    الفئات · Shop by your favourite categories        (categories page)
    أضيفي قطعة · How would you like to list?          (sell mode chooser)
    لا رسائل بعد · Message a seller from any listing   (messages, empty)
    لا عروض بعد · Offers you make and offers…          (offers, empty)

The check is order-agnostic now: one side Arabic, the other not, either way
round. All four fixed to one language.

That is the fifth distinct shape since v2.9.3 removed 118 of these — after the
template expression, the array index, the nested span and the expression with no
Arabic literal. It is the same lesson each time: **a source scan enumerates
shapes and there is no end to them.** `npm run uxlaws` reads the rendered label,
where there is only ever one shape, and covers ten screens. These four live
behind the account wall, which the walk cannot reach.

---

## What was considered and not done

**Real return triggers** — "the piece you saved dropped in price", "she replied
to you". Both are true events and both are good psychology. Neither ships,
because push notifications are unbuilt and `push.js` refuses to raise an OS
permission prompt while no sender exists, on the grounds that an OS prompt is a
promise. The seam refuses rather than the screen pretending.

**Highlighting pieces priced under the band on the feed.** True, computed, and
one degree from manufactured urgency the moment it becomes a coloured flag. Left
out; the band is on the piece, where she is already deciding, and not on the grid
where it becomes a nudge.

---

## The honest thing about all of this

None of it is lili's growth constraint. There are **zero live listings**, and
anonymous sign-in is still off, so the first screen anybody opens is the empty
state and nobody can make an account to change that. No persuasion technique
improves an empty shop.

The two blockers are in `PLAY-STORE-CHECKLIST.md`, and one of them is a switch in
the Supabase dashboard that takes thirty seconds.

The APK here is debug-signed for sideloading. It is not the artefact Play takes.
