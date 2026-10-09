# v2.11.5 — icons that belong to this app

The icons were already custom — hand-written SVG paths, not a library, replacing
emoji in v2.8 for three good reasons. They still looked like everyone else's,
and the reason is worth writing down: they were drawn to the **Feather recipe**.
24 grid, uniform 1.6 stroke, symmetric silhouettes, geometric construction. It
is an excellent recipe. It is also the recipe behind Feather, Lucide, Heroicons
outline and roughly every interface shipped since 2017.

**1,199 checks · 464 research · 223 security · 199 smoke · 71 walkthrough · 66
device · 55 visual · 32 UX-audit · 30 i18n · 27 UX-laws measured on the glass ·
26 image-quality · 23 functional · 17 loading · 15 a11y screens · 13 integration
· 13 keyboard · 13 settings · 6 old-WebView.**

---

## What they actually looked like

Rendered at the size the placeholder tiles use — which is where they are largest
and most seen, on a shopping app whose catalogue is currently all placeholders:

- **dress** read as a chess pawn, or a keyhole
- **abaya** read as a lantern
- **jacket** read as an open book
- **heel** read as a lightbulb

Those four are the picture on nearly every tile in an app that sells clothes. At
14px, in chips and list rows, `heel` and `jewellery` collapsed into blobs.

## The rule, and the split

The set is now divided, and the division is the design decision.

**Garments and objects are lili's own**, drawn to three constraints:

1. **Hanging, not laid flat.** Stock garment icons are symmetric silhouettes
   stamped flat. Real clothes hang — and second-hand clothes have hung in
   somebody's wardrobe, which is the entire premise of this product. Every
   garment now has a shoulder line, a drape, and weight falling downward.
2. **A croquis proportion** — taller than wide — rather than filling the square.
   A fashion figure is drawn tall; a spreadsheet icon is drawn square.
3. **Open hems.** Terminals left open at the bottom edge, which is both what a
   hem is and what stops the counters filling in at 14px.

**System glyphs are deliberately left conventional.** Search is a magnifier, the
cart is a cart, back is a chevron. Jakob's Law is measured in this project, and
a search icon nobody recognises is not a signature — it is a bug. The
distinctiveness belongs on the subject matter, and for a fashion marketplace the
subject matter is the clothes.

Ten redrawn: **dress, abaya, jacket, top, skirt, heel, bag, jewellery, sunglass**,
and **shops**, which got an arched door — the one change that turns a storefront
into a boutique.

`jewellery` was a faceted stone, identical in spirit to `gem`. It is a necklace
now, because two icons with the same drawing are one icon with two names, and a
reader who sees them side by side reads the difference as meaning.

## They were drawn by looking

`npm run iconsheet` renders every icon at 46, 30 and 14px on lili's own
background and writes a contact sheet. Nothing here was designed by reasoning
about path data.

The abaya took three passes. The first read as a t-shirt, the second read as a
t-shirt with a seam, and an abaya reading as a t-shirt is not a small thing in
this market — the emoji it replaced in v2.8 was 🕌, a *mosque*, used for a
garment. The third has narrow shoulders, sleeves that hang rather than stick
out, a long column and an open front. The jacket took two: the first had a lapel
V so deep it read as a crown.

## The check that was measuring nothing

The first guard for all this went into `npm run research` and parsed the path
strings as alternating x,y numbers.

That is not what path data is. A relative command moves the origin; an elliptical
arc carries seven parameters, two of which are flags. The check reported the
dress as **26 wide and 33 tall inside a 24 box** — not a shape — and it would
have failed a correct drawing as readily as it passed a wrong one.

It moved to `npm run uxlaws`, where there is a browser, and asks `getBBox`:

- nothing drawn outside the 24 grid, because a path that overflows is clipped by
  every viewBox that renders it and the clip is invisible until it is not
- no glyph optically out of step with the set, measured against the median span
- every worn garment taller than wide, which is the croquis rule enforced rather
  than merely stated in a comment

Same lesson as the bilingual labels, the Arabic-Indic digits and the purchase
confirmation before it: **assert the property, not a proxy you cannot compute.**
`npm run uxlaws` is 27 of 27.

What stays in `research` is what a string can honestly answer: every name has a
path, no two icons are the same drawing, and the conventional glyphs are still
conventional.

---

## Not done, and worth saying

The **launcher icon** — the one on the phone's home screen — is still the
generated `resources/icon.png`. That is a different job with different
constraints (adaptive foreground and background layers, safe zones, every
density) and it deserves its own pass rather than being smuggled into this one.

The **`sunglass` avatar on "Dubai Finds"** in the demo catalogue is arbitrary:
shop avatars pick a glyph by index, not by what the shop sells. It only affects
demo shops, which are labelled as demonstrations, so it is cosmetic — but it is
why a shop with that name has spectacles on it.

The APK here is debug-signed for sideloading. It is not the artefact Play takes.
