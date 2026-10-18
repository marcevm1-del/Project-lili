# v2.10.1 — browsing never needed an account

**1,147 checks · 433 research · 223 security · 199 smoke · 71 walkthrough · 66
device · 55 visual · 30 i18n · 26 image-quality · 23 functional · 17 loading ·
15 a11y screens · 13 integration · 13 keyboard · 13 settings · 6 old-WebView ·
contrast clean · the stranger's walk with nothing blocking her.**

---

## The thing I had been calling a dashboard problem was a code problem

Every release since v2.9 has ended with the same line: *anonymous sign-in is
switched off, so every install is a single-player game, and only you can fix
it.* That was true about the symptom and wrong about the cause.

`initBackend()` asked for a session **first**. If it could not get one — which
is exactly what happens when a project refuses anonymous sign-in — it fell all
the way back to device-only. Not just writes: reads too.

But `lili_items` and `lili_shops` are readable by `anon`. Deliberately. It is
what makes a marketplace browsable before anybody signs up, and it has been
that way the whole time. **The app was hiding a catalogue it was allowed to
read**, and the console line it printed while doing so said *"browsing is
live"* — which the code had just made sure it was not.

Reading and writing are two different questions now:

- **`canRead()`** — needs the key. True whenever the project is reachable.
  Browsing, search, the shared garment vocabulary.
- **`isRemote()`** — needs a session. Listing, messaging, offers, saves.

`refreshCatalogue()` and `searchItems()` were both gated on the *write* flag
and now run on the read flag. `initBackend()` is called at boot, unconditionally
— it was only ever called from `activateBackend()`, which only runs once a
session exists, so a woman without an account never reached the server at all.

**What this changes on a phone:** install it, open it, and you see what other
women have actually listed. No account, no sign-up, nothing to flip in a
dashboard.

## And it says which state it is in

The old failure was silent, which is the worse half. She could list a piece,
save things, write a message — and none of it existed outside her own phone.
She would find out days later, from silence.

The home screen now carries one line when writes are impossible: *"You're
browsing only. Sign in to list a piece, save one, or message a seller — nothing
you do is shared until you do."* — with a button that opens the sign-in that
already worked. Both sentences are in the dictionary, in both languages.

## Two bugs found while fixing it

**The smoke suite caught me wiping the catalogue.** With browsing connected,
`refreshCatalogue()` met a project with nothing in it yet and replaced the
device copy with the empty answer — keeping only listings marked `pending`. An
empty feed on first open, and her offline work gone. An empty server answer now
keeps what the phone holds and does not retire the demo catalogue; there has to
be a real catalogue before the demo one is stood down.

**The functional suite caught a late badge.** The first version of this change
awaited the connection before reading her saves, putting a network round trip
in front of hydration. The saved count arrived after the screen did and counted
wrong. Connecting is a background job now and is not awaited anywhere.

## The suites had started talking to the live project

A side effect worth its own note: once the app connected at boot, every
headless suite opened real connections to production on every page load. Over a
hundred in one `npm run verify`, and the run timed out.

Three reasons that is wrong, and only the first is about speed: it is slow and
flaky (a visual regression suite measuring a round trip to Stockholm); it
**writes** — analytics events, rate-limit rows, auth attempts, from a test run
into a live product's funnel; and it hides the thing being tested, because
these suites exist largely to check the offline fallbacks, which never run when
the server answers.

`testnet.mjs` blocks the backend origins in every browser suite, in one place.
`LILI_TEST_ONLINE=1` lets a suite through when that is genuinely the point.
`npm run preflight` and `npm run funnel` are the tools that talk to the
project, and they say so in their names.

## Preflight now reports the real consequence

It used to call anonymous sign-in a blanket blocker. It checks three things
separately now, and it checked them against the live project while this was
written:

- **the catalogue is readable without an account** — ✓, browsing is live
- **anonymous sign-in** — refused
- **email sign-up** — on, and working. But every new account must click a
  confirmation link, and Supabase's built-in SMTP sends a couple of messages an
  hour, often only to project members.

So the blocker is now specific and it names three ways out: enable anonymous
sign-in (thirty seconds, and the app needs no email at all), configure your own
SMTP, or turn off email confirmation for the beta.

## The install file

`lili-v2.10.1-debug.apk`, 7.5 MB. There was no Android SDK in the build
environment, which is why `npm run audit` had been reporting "Release APK
built ✗" since the beginning. There is now, and `BUILD-APK.md` has the exact
steps — the SDK does not survive the container, but the instructions do.

A **release** build still needs a signing keystore, and that is yours in a way
nothing else in this repository is: lose it and the app can never be updated by
anyone, ever. The `keytool` command is in `BUILD-APK.md`.
