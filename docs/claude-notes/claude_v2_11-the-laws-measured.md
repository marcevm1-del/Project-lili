# v2.11.0 — the UX laws, measured on the glass

Full note ships as `UPGRADE-v2.11.0.md`. **1,171 checks green.** Nothing here
changes a colour, a typeface, a layout or a word of true copy. Largest visual
movement anywhere: **one pixel**.

## Why measured, not quoted

`npm run ux` checks the laws against the source and cannot see what they are
about, because those are properties of pixels. `npm run uxlaws` opens the built
app in a real browser at phone size and reads the computed style of everything
on six screens. It started at 14/21 clean; it is now 21/21.

## What it found

- **18 type sizes on one screen**, 30 in source, half of them half-steps.
  Collapsed to a declared scale of 11 (`src/theme/scale.js`) under one rule:
  nothing moves more than 1px.
- **`13.333px` in the tab bar and every chip** — Chrome's default `<button>`
  size, a value nobody chose, arriving by default.
- **Seven layout spacings off any rhythm** (8.25, 9, 11, 13, 15), snapped at
  ≤1px each. Negative offsets left alone — deliberate overlaps.
- **Chips 6px apart and a 41px "All"** — below the thumb-separation and target
  floors.
- **Chips still printed "Dresses · فساتين"** in one label — the pattern v2.9.3
  removed from 118 places, surviving because it was built in a template
  expression the i18n check didn't cover. Fixed, check widened.
- **Two menus of 13 flat rows** (profile, and Privacy & Safety, which `ux` had
  flagged since it was written). Grouped into 3 and 4 labelled runs.

## The tool was wrong three times

Each would have produced a "fix" that made the app worse: crowding measured on
expanded hit boxes rather than what she aims at; Hick counting taps (31) rather
than decisions (8); and the Doherty timing including the 350ms sleep inside its
own helper — "403ms" was really 32ms.

## The psychology, and the half refused

`src/ux/persuasion.js`, guarded by a test the same way `NEVER_CLAIM` is. The
line: a technique may make a **true** thing easier to see or act on; it may not
manufacture a feeling the facts do not support.

In use, each attached to something true: goal-gradient, Zeigarnik, endowment,
peak-end, recognition over recall, anchoring, loss aversion framed as
reassurance not threat.

Refused: invented viewer counts, "only 2 left", countdowns, fabricated social
proof, invented ratings, confirmshaming, false price urgency, pre-ticked
consent. One is not hypothetical — this app carried "Trusted by 10,000+ women in
Dubai" over a fabricated 4.9 until v2.8.

## Peak-end: the listing flow had no ending

Publishing finished by disappearing. It now ends on the piece — her photograph,
title, price, and which real state it is in (live, or held for review).

## Two audit checks were reading notation

"Arabic-Indic digits — Missing" grepped for the string `u0660`; the library
handles both digit families using the characters and `0x0660`. And "Purchase has
a confirmation ending" looked for `checkedOut` — the boolean behind the fake
checkout v2.9.4 deleted, so passing it would have meant the lie was back. Both
now assert behaviour. `ux` went 24/8 → 32/3.
