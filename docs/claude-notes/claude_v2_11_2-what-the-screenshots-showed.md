# v2.11.2 — what the screenshots showed

Ten screenshots, seven defects, and none of them were in the source in a shape
any existing check was looking for. Every one existed only once the app was laid
out on glass.

**1,178 checks · 450 research · 223 security · 199 smoke · 71 walkthrough · 66
device · 55 visual · 32 UX-audit · 30 i18n · 26 image-quality · 24 UX-laws
measured on the glass · 23 functional · 17 loading · 15 a11y screens · 13
integration · 13 keyboard · 13 settings · 6 old-WebView.**

Nothing here changes a colour, a typeface or a decision. Every fix is a thing
that was already meant to be true and wasn't.

---

## The wordmark said "loveit or leaveit"

`love<HeartI/>t or leave<HeartI/>t` — the heart glyph stands in for the "i", and
`display: inline-flex` strips leading and trailing whitespace from anonymous
flex items. So the space before each heart was removed by the layout engine on
the app's own name, on the splash screen, since the mark was drawn. Fixed with
a non-breaking space, which is not whitespace to the algorithm that was eating
it.

## Names cut at the apostrophe

Story labels ran `shop.name.split("'")[0]`, so **Layla's Closet** appeared as
"Layla". It was a truncation trick that happened to work on names without
punctuation. Two lines with a real clamp now — the name wraps, and if it still
does not fit it ends in an ellipsis rather than at a character.

## The Arabic tagline's full stop was on the wrong side

The splash read `.قطع فاخرة` — the sentence right-to-left, the full stop
stranded at the left. A full stop is direction-neutral: it takes the
**paragraph's** direction, not the sentence's, and the paragraph was English.
One `dir="rtl"` on the line. `npm run uxlaws` now measures this on every screen
it walks, because it is invisible to anyone reading the source.

## "Everything" described a grid it sat above

The heading and the "For You" toggle rendered above the New In strip, so the
first thing under a heading that says *Everything* was a horizontal row of the
newest four pieces. Moved below the strip, directly above the grid it names.

## Style cards were 450px tall

The grid keeps `flex: 1` so the Skip button stays at the bottom of the screen,
and its rows were stretching to fill that space: each card an empty box with an
icon and a label at the top. `alignContent: center`. The grid still occupies the
column.

## Three labels printed two languages at once

- `Match my phone · حسب الجهاز` in the theme picker.
- `وصل حديثاً · Just arrived` under New In.
- `ما هو ستايلك؟ · Pick all that apply` on the style screen — and those two
  halves are not even a translation pair. The Arabic is the heading above it;
  the English is the instruction. A reader of either language got half a
  sentence and half of something else.

## The consent copy contradicted the toggles

Returning to the screen restored the choices she made last time, under a
sentence that said *"Nothing here is switched on for you."* Three-way now: no
saved choices and opt-in law, no saved choices and opt-out law, or choices she
already made — which is the only one that was ever wrong.

---

## Why a fourth shape of bilingual label got through

v2.9.3 removed 118 labels printing English and Arabic in one line and added a
source check so they could not come back. That check has now missed four:

1. a template expression — `` `${c} · ${CATS_AR[c]}` `` (v2.11.0)
2. an array index next to a literal — `{T.newInTitle[1]} · Just arrived`
3. a nested span — `{m.label} <span>· {m.labelAr}</span>`
4. the seller-type radio, `{t.label} <span>· {t.labelAr}</span>`, where there is
   no Arabic **literal** anywhere in the file at all

Each fix widened the regex, and each time a new shape appeared, because the
check reads shapes in the source and the number of shapes is unbounded. **On
the glass there is exactly one shape.** So the check moved: `npm run uxlaws`
reads the rendered text of every label on ten screens and asks whether one
label contains both scripts. It found the fourth one within a minute of being
written.

The source scan is kept, and it gained the expression pattern, for one reason:
the walk needs no account to reach ten screens and cannot reach the listing
form, which is where the fourth one lived. That is the honest division — the
measurement is authoritative where it can see, and the scan covers the rest
while saying out loud that it is enumerating shapes.

## Two more, found while looking

- **Every bare `<button>` inherited 13.333px** — Chrome's default, a size no
  part of this design system chose. Set to inherit the family and 14px.
- **Every `<p>` carried the browser's 13px default margin**, which is why
  several stacks were a pixel or two off a rhythm that was otherwise exact.

## The audit was telling people to do the wrong thing

`Release APK built ✗ — Run \`npm run apk\` before auditing.` But `npm run apk`
builds a **debug** APK, into a different directory than the one the check looks
in. Follow the instruction exactly and the line stays red, which is how a person
learns to scroll past red lines. The line is correct and now says why: a release
build needs the upload keystore, and that key belongs to whoever owns the Play
listing. It is not generated in this repository and must never be.

---

## Still open

Same three as v2.11.0, unchanged: anonymous sign-in is off and `npm run
preflight` names the three ways out; 775 strings are English-only and the
translator's file is written and waiting; payments, authentication, push,
shipping and iOS are unbuilt, each behind a seam that refuses rather than a
screen that pretends.

The APK in this release is debug-signed for sideloading. It is not the artefact
Play takes.
