# v2.11.0 — the laws, measured

Apply every UX law with a bit of psychology, and do not change the look. All
three, and the third one is the constraint that made the other two honest.

**1,171 checks · 444 research · 223 security · 199 smoke · 71 walkthrough · 66
device · 55 visual · 32 UX-audit · 30 i18n · 26 image-quality · 23 functional ·
21 UX-laws measured on the glass · 17 loading · 15 a11y screens · 13
integration · 13 keyboard · 13 settings · 6 old-WebView.**

Nothing in this release changes a colour, a typeface, a layout or a word of
copy that was already true. The largest single visual movement anywhere in it
is **one pixel**.

---

## Why this is measured rather than quoted

`npm run ux` has existed since v2.8 and checks the laws against the **source**.
It is useful and it cannot see the things these laws are actually about,
because they are properties of pixels:

- a button styled `padding: 6px` may still be 48px tall inside a flex row
- a button with `min-height: 44px` may be 44px wide and 20px tall
- two targets that are each big enough can still sit 2px apart
- a type scale looks tidy in one file and has eighteen sizes on screen

So `npm run uxlaws` opens the built app in a real browser at real phone
dimensions and reads the computed style of everything on the glass, across six
screens. It started at **14 of 21 clean**. It is now 21 of 21.

## What it found

**Eighteen distinct type sizes on one screen**, thirty across the source —
`8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 16, 17,
18, 19, 20, 21, 22, 24…` Half of them half-steps. The difference between 11px
and 11.5px is not a difference anyone perceives; it is a distinction the eye has
to resolve and fails to. Collapsed to a declared scale of eleven under one rule:
**nothing moves by more than 1px, and almost everything by 0.5px or less.**
`src/theme/scale.js` documents it.

**`13.333px` in the tab bar, the category chips, and every other button whose
label sits in a child span.** That is Chrome's default `<button>` font size — a
value no part of this design system had ever chosen, arriving by default.
Invisible today, because those spans set their own size; it matters because the
moment anyone puts text directly in a button it lands on no scale at all.

**Seven layout spacing values off any rhythm** — `8.25, 9, 11, 13, 15` among
them, each within a pixel of a neighbour that was deliberate. Snapped, at ≤1px
drift each. Negative offsets are left alone: those are deliberate overlaps, not
spacing.

**Category chips 6px apart, and a 41px "All".** Below 8px, two targets are one
target to a thumb; 44px is the floor Apple sets and Android sets higher. Fixed
with a gap and a minimum width, both invisible.

**The chips were still printing "Dresses · فساتين" in one label** — the exact
pattern v2.9.3 removed from 118 other places. It survived because the i18n
regression check looks for the separator in JSX text and string literals, and
this was built in a template expression. Fixed, and the check now covers that
shape.

**Two menus of thirteen flat rows** — the profile menu, and the Privacy & Safety
menu that `npm run ux` has flagged since it was written. Grouped into three and
four labelled runs. Nothing removed, nothing renamed, nothing reordered within
its group. Hick's Law is about the length of the list you have to search, and
proximity and common region do the work that reading thirteen labels was doing.

## The tool was wrong three times, and that is worth reading

Each of these was the measurement being wrong rather than the app, and each one
would have produced a "fix" that made the app worse:

- **Crowding measured on expanded hit boxes.** Adding invisible tap expansion
  to a target's size shrinks the gap to its neighbour, so every chip row looked
  2px too tight. Crowding is now measured on the box she actually aims at.
- **Hick's Law counted taps, not decisions.** Twelve save hearts down a feed are
  one kind of choice; a scrolling strip of nine category chips is one
  choice-set; the tab bar is navigation a person arrives already knowing. The
  count went from 31 to 8 without a line of app code changing.
- **The Doherty measurement included its own wait.** The helper it used sleeps
  350ms after every click, so "switching to Search takes 403ms" was measuring
  the sleep. It takes 32ms.

## The psychology, and the half this app refuses

"Apply UX psychology" and "manipulate a woman into buying a bag" describe the
same literature. `src/ux/persuasion.js` draws the line and a test enforces it.

**The test:** a technique is allowed when it makes a **true** thing easier to
see, act on or remember. It is refused when it manufactures a feeling the facts
do not support.

Scarcity is the clean example. *"One of these, and it is second-hand"* is true
of every listing here — it is the nature of resale, and it helped decide that a
cart has no quantity control. *"3 people are looking at this right now"* is a
sentence about a number nobody is counting. Same finding, opposite sides.

**In use, each attached to something true:** goal-gradient (the listing flow
names the remaining distance, and the steps are real), Zeigarnik (an abandoned
listing is kept and offered back, and it really is on the device), endowment
(saves persist before any account exists), peak-end, recognition over recall
(search offers what is genuinely in stock), anchoring (the published resale
band, which says nothing when it has no basis for an opinion), loss aversion
stated as reassurance rather than threat — *"your draft is saved"*, never
*"you'll lose your work"*.

**Refused, with the pattern that catches each:** invented viewer counts, "only
2 left", countdowns and "last chance", fabricated social proof, invented
ratings, confirmshaming, false price urgency, pre-ticked consent. They run over
every source file and every dictionary string in both languages, exactly like
the claims register's `NEVER_CLAIM`.

One of them is not hypothetical: this app carried *"Trusted by 10,000+ women in
Dubai"* over five filled stars and a 4.9 from *"2,000+ reviews"*. None of those
women existed. It was removed in v2.8; this is what stops it coming back.

## Peak-end: the listing flow had no ending

The one flow this marketplace depends on finished by disappearing. She published
a piece, the form cleared, and she was somewhere else — nothing said it worked,
nothing showed her what she had made.

It now ends on the piece: her photograph, her title, her price, and which of the
two real states it is in — live, or held for review, which the screening step had
already decided and already explained. Everything on that card is something that
actually happened.

## Two checks in the audit were reading notation, not behaviour

Found while going through its remaining flags, and both are the failure this
project's own suites warn about — *assert the property, not the shape*:

- **"Arabic-Indic digits accepted — Missing."** It grepped for the string
  `u0660`. The library handles both Arabic-Indic and Persian digits using the
  characters themselves and the constants `0x0660` / `0x06F0`. The behaviour was
  right and the check was reading spelling. It calls `parsePrice("٣٥٠")` now,
  and `parseYear("١٩٩٤")`.
- **"Purchase has a confirmation ending — Missing."** It looked for
  `checkedOut`, the boolean behind the fake checkout v2.9.4 deleted. Passing it
  would have meant the lie was back.

`npm run ux` went from 24 good / 8 to look at, to 32 / 3. The three that remain
are deliberate: the entry gates are legally required, the moderator roster's
delay is a real network call, and `ErrorBoundary` keeps its own palette on
purpose — it has to render when the module holding the shared one is what
crashed.

---

## Still open

Anonymous sign-in is still switched off, and `npm run preflight` still names the
three ways out. Browsing has been live without an account since v2.10.1;
listing and messaging need one, and the app says so on the home screen.

775 strings are English-only; the translator's file is written and waiting.
Payments, authentication, push, shipping and iOS remain unbuilt, each behind a
seam that refuses rather than a screen that pretends.
