# v2.9.3 — one language at a time

The structural half of the Arabic work, and the thing v2.9.2 left open first.

**378 checks across the suites · 355 research · 223 security · 199 smoke · 71
walkthrough · 66 device · 55 visual · 26 image-quality · 23 i18n · 21 functional
· 17 loading · 15 a11y screens · 13 integration · 13 keyboard · 13 settings · 6
old-WebView · contrast clean.**

---

## The problem

There was no translation layer at all. `languages.js` is a metadata table with
no strings in it, and `applyLanguage` could not change a single word. So the
app's answer to being bilingual was to print both languages into the same label:

> `Filters · فلتر`  ·  `Add to Cart · أضيفي للسلة`  ·  `Sending… · جاري الإرسال`

**118 of them**, and it served neither reader. An English speaker read past
Arabic she could not use on every button. An Arabic speaker read past English to
find her half — second, after the dot, same size.

## What changed

`src/i18n/strings.js` holds the dictionary, `src/i18n/t.js` resolves it, and
`t("filters")` returns one language. Choosing Arabic in the picker now actually
changes the words, which it never has.

**No new translation was needed for any of it.** Every one of those strings
already existed in both languages inside one literal; splitting them is undoing
a decision to show both, not writing anything new.

Missing keys fall back to English and warn in the console — she sees a word she
may not want rather than a blank or a key name. Interpolation is `{n} left` so a
sentence with a number stays one string for a translator, because word order
differs between the two languages and fragments cannot express that.

## The report reasons

Translated, because this is the one flow where a comprehension failure has a
cost **outside** the app: a woman reporting a counterfeit, harassment or a scam
had to read English to say which — while already having a bad time.

They are marked `REASONS_NEED_NATIVE_REVIEW`. "Translated by the person building
the software" is not the same claim as "translated by someone who speaks it",
and that difference belongs on the record rather than in somebody's memory.

Terms, the seller agreement and refund policy are **not** in the dictionary, and
a test asserts no string over 160 characters gets in. `languages.js` was right:
those are the last text on earth to run through a translation engine and ship
unread.

## The number that would have lied

`coverage("ar")` reads the dictionary. The dictionary was seeded from the 128
labels that were already bilingual — so it reports **100%** the moment it exists,
and would keep reporting 100% while seven eighths of the app is still English.

A metric that is green on day one and cannot go down is worse than no metric,
because somebody quotes it. So there are two:

| | |
|---|---|
| dictionary coverage | **100%** — and says why that is meaningless |
| **interface coverage** | **13%** — 128 translated of 989 user-visible strings |

The suite asserts they differ, asserts the real figure sits in an honest band,
and asserts `languages.js` still says `partial` while it does. That last check is
what stops "partial" quietly becoming "ready" one afternoon. `languages.js` now
says *"about an eighth of the wording — measured by `npm run i18n`, not
estimated."*

And one check exists purely against regression: **no component may print English
and Arabic into one label again.** It is an easy thing to add by accident,
because it looks like being helpful.

## Two tests were wrong, not the code

Worth recording, because both were the same mistake:

- **`research.test.mjs`** grepped `Marketplace.jsx` for the literal *"No shops
  open yet"*. The string moved into the dictionary, so the grep failed while the
  empty state worked perfectly. Now it asserts the key is used *and* the string
  exists — which a rename cannot fool, and a literal grep could.
- **`settings.test.mjs`** found the profile rows by looking for the `·`
  character in their labels. Splitting the labels removed every `·` from the
  interface, so it found nothing. A test that identifies a control by a
  typographic accident of its copy breaks the next time the copy changes; it
  finds rows by being rows now.

---

## Where Arabic stands

**Works:** the layout mirrors, and the four things that broke *meaning* are
fixed (chat alignment, consent toggles, back arrows, the drifting badge). Search
folds tashkeel, the alef family, ta-marbuta and Arabic-Indic digits. Prices and
dates format for the locale. An honest Arabic description scores the same as the
same one in English. 128 interface strings switch language. Report reasons are
bilingual. The funnel can tell an Arabic session from an English one.

**Doesn't yet:** Legal Centre bodies, Help Centre answers, error and timeout
copy, empty states, photo advice, the listing-screening explanations. About 861
strings. That is a translator's job, not another release, and the mechanism is
now sitting there waiting for the file.

## Still open, unchanged

Anonymous sign-in is still switched off — still the one blocker `npm run
preflight` reports, and still the thing that makes every install a single-player
game. Payments, escrow, shipping, third-party authentication, iOS and push
remain unbuilt, and every screen says so.
