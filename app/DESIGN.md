# DESIGN.md

The rules the interface follows, and — for almost all of them — the command that
fails when one is broken.

That second half is why this file is worth having. A design document that only
describes intent drifts within two releases, because nothing notices. Nearly
every rule below is already enforced by a check that runs in `npm run verify`,
so this file is a map of things that are true today rather than a wish list.

Where a rule has no check, it says so.

---

## 1. Principles

**Honesty over polish.** Never ship a control that only looks like a control,
or a badge that states something nothing verified. Twelve false claims have been
removed from this app; the thirteenth was three pills reading "Buyer Protection ·
Secure Payment · Verified Seller" on the listing detail screen, two lines above
the notice saying lili is not the merchant. An absent feature is better than a
fabricated one.
→ `src/compliance/claims.js`, enforced by `npm run research`.

**A technique is allowed when it makes a true thing easier to see.** It is
refused when it manufactures a feeling the facts do not support. Scarcity is the
clean example: *"one of these, and it is second-hand"* is true of every listing
here; *"3 people are looking at this"* is a sentence about a number nobody
counts.
→ `src/ux/persuasion.js`, `IN_USE` and `REFUSED`.

**Warm, not inverted.** lili's identity is peach, terracotta and cream. Dark
mode is built on warm near-blacks, not the blue-greys most dark modes default
to — inverting a warm brand produces a cold one.

**Bilingual means one language per label.** Never `English · العربية` in one
line. Arabic gets its own line, its own `dir`, or the label switches with the
chosen language.
→ `npm run uxlaws` reads the rendered text; `npm run i18n` scans the source.

---

## 2. Foundations

### Colour

All tokens live in `src/theme/palette.css` as CSS custom properties; the JS
palettes (`C`) point at those variables. That indirection is what makes theming
roughly 2,000 inline styles possible without editing any of them.

**Never write a hex value in a component.** If a colour is needed, it becomes a
token first.

Contrast is measured, not eyeballed — `npm run contrast`. Two values in the
palette carry their reason in a comment because measurement moved them:
`--c-ink-lt` was darkened from `#9C8577` (2.99:1 on peach, below AA), and the
primary button uses `#9E6050` rather than `#C4856A` because white on the lighter
terracotta is 3.04:1 and 15px bold is not "large text".

### Type

Eleven sizes, declared in `src/theme/scale.js`:

`9 · 10 · 11 · 12 · 13 · 14 · 15 · 16 · 18 · 20 · 22 · 24`
with a display set of `26 · 28 · 30 · 36 · 44 · 56 · 100`.

Before v2.11.0 there were **eighteen sizes on one screen and thirty in the
source**, half of them half-steps. The difference between 11px and 11.5px is not
one anybody perceives; it is a distinction the eye must resolve and fails to.

- **No half-pixel sizes.** Checked on the rendered page.
- **No size that is not on the scale.** Also checked on the rendered page,
  because a value can arrive without any file choosing it: `13.333px` — Chrome's
  default `<button>` size — lived in the tab bar and the category chips for
  three releases. `src/index.css` now sets `button { font-family: inherit;
  font-size: 14px; }`.
→ `npm run uxlaws`.

### Spacing

Base unit **4px**, half-step **2px**. Layout spacing snaps to that rhythm; small
negative offsets are left alone, because those are deliberate overlaps rather
than spacing.
→ `npm run uxlaws` flags off-rhythm layout values.

`src/index.css` sets `p { margin: 0; }` — the browser's default 13px paragraph
margin was why several stacks sat a pixel or two off a rhythm that was otherwise
exact.

### Targets

- **44px minimum** on a target's short side.
- **8px minimum** between two targets. Below that, two targets are one target to
  a thumb.

Both are measured on the box she actually aims at, not on invisible tap
expansion — measuring the expanded box makes every chip row look 2px too tight
and produces a "fix" that makes the app worse.
→ `npm run uxlaws`.

---

## 3. Components and states

Every component that can be in more than one state defines all of them, and the
non-ideal ones are the point:

**loading · empty · error · offline · success · disabled · permission-denied**

Two rules learned the hard way, both now covered by tests:

- **An empty server response is not an empty catalogue.** A failed refresh keeps
  the device copy rather than blanking the screen.
- **A failure says it failed.** A failed erasure says nothing was deleted; a
  failed photo does not lose the others; a blocked action says it was blocked
  rather than silently doing nothing.

Loading is budgeted, not open-ended: a 1,200 ms network budget, then the local
copy. Response to a tap is measured against the Doherty threshold of 400 ms.

---

## 4. Language and direction

- One language per label (§1).
- Arabic-Indic and Persian digits are accepted on input, by behaviour — the
  check calls `parsePrice("٣٥٠")` rather than grepping for `u0660`.
- **Direction-neutral punctuation takes the paragraph's direction, not the
  sentence's.** An Arabic line inside an English page needs `dir="rtl"`, or its
  full stop renders on the left. The splash tagline shipped as `.قطع فاخرة` on
  every cold start until it was measured.
- The back arrow follows direction — `i18n/direction.js` — or the screen where
  she chooses Arabic points the wrong way the moment she chooses it.

775 strings are still English-only. That is a translation job, not a design one.

---

## 5. Do not

- Do not write a hex colour, a font size off the scale, or a spacing value off
  the rhythm in a component.
- Do not put text directly in a `<button>` without a size — it lands on no scale.
- Do not print two languages in one label.
- Do not add a badge, pill or chip that asserts something no code verifies.
- Do not use a countdown, a viewer count, a stock-pressure line, an invented
  rating, or a decline button that makes her say something diminishing about
  herself. Every one is a pattern in `REFUSED`, and each fails the build.
- Do not pre-tick a consent box. Consent that arrives already given is not
  consent.
- Do not re-export components from a barrel file — it makes them statically
  reachable and defeats every `lazy()` boundary.
- Do not add a reassurance row where the reassurance is not available. Three
  chips in a row *are* the reassurance; weaker true chips in the same shape are
  the same move with better wording.

---

## 6. Where the rules are enforced

| Rule | Command |
|---|---|
| Claims, forbidden sentences, store copy | `npm run research` |
| Dark patterns and persuasion | `npm run research` |
| Type scale, spacing, targets, crowding, bilingual labels, bidi punctuation, Doherty | `npm run uxlaws` |
| Contrast | `npm run contrast` |
| Source-level bilingual regression, coverage figures | `npm run i18n` |
| Screen reader, focus, motion | `npm run a11y` |
| Old-WebView constraints (minSdk 23, chrome58) | `npm run oldwebview` |
| Everything | `npm run verify` |

**Not covered by any check, and reviewed by eye:** iconography and its stroke
weight, motion timing and easing, photograph crop and composition, the tone of
individual copy, and whether a screen feels like lili. If a rule here is worth
keeping, the next step is a check for it — not a longer paragraph.
