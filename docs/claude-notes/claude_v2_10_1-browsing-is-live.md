# v2.10.1 — browsing never needed an account

Full note ships as `UPGRADE-v2.10.1.md`. **1,147 checks green.**

## What I had been getting wrong

Every release since v2.9 ended with "anonymous sign-in is off, so every install
is a single-player game, and only the founder can fix it." True about the
symptom, wrong about the cause.

`initBackend()` asked for a session **first**, and when it could not get one it
fell back to device-only — reads included. But `lili_items` and `lili_shops` are
readable by `anon`, deliberately, and always have been. The app was hiding a
catalogue it was allowed to read, while printing a console line claiming
"browsing is live".

Reading and writing are separate now: `canRead()` needs only the key,
`isRemote()` needs a session. `refreshCatalogue()` and `searchItems()` were both
gated on the write flag. `initBackend()` now runs at boot rather than only after
a session exists.

**On a phone:** install, open, and you see what other women have actually
listed. No account needed.

## It also says which state it is in

The old failure was silent — she could list, save and message, and none of it
existed off her phone. The home screen now carries one line when writes are
impossible, with a button to the sign-in that already worked. Both sentences are
in the dictionary, both languages.

## Two bugs the suites caught during the fix

- **Wiping the catalogue.** With browsing connected, an empty server answer
  replaced the device copy — empty feed on first open, offline work gone. An
  empty answer now keeps what the phone holds and does not retire the demo
  catalogue.
- **A late saved badge.** Awaiting the connection before hydration put a network
  round trip in front of the screen. Connecting is a background job now.

## The suites were talking to production

Once the app connected at boot, every headless suite opened real connections to
the live project — over a hundred per `verify` run, and it timed out. Worse than
slow: it wrote analytics and auth rows into a live product, and it hid the
offline fallbacks these suites exist to test. `testnet.mjs` blocks the backend
origins in one place; `LILI_TEST_ONLINE=1` opts back in.

## The blocker, restated precisely

Preflight checked all three against the live project:

- catalogue readable without an account — **yes**, browsing is live
- anonymous sign-in — **refused**
- email sign-up — **on and working**, but every account must click a
  confirmation link, and Supabase's built-in SMTP sends a couple an hour, often
  only to project members

Three ways out, in order of effort: enable anonymous sign-in (thirty seconds),
configure custom SMTP, or turn off email confirmation for the beta.

## The install file

`lili-v2.10.1-debug.apk`, 7.5 MB. There was no Android SDK in the build
environment — which is why the audit reported "Release APK built ✗" from the
start. `BUILD-APK.md` has the steps. A **release** build still needs a signing
keystore the founder generates and keeps: lose it and the app can never be
updated by anyone.
