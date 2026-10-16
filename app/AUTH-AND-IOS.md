# Sign-in and iPhone

## Sign-in — three ways, all built

**Google**, **email + password**, and a **magic link** (emailed one-tap, no
password). Browsing needs none of them: identity is asked for when it starts to
matter — opening a shop, messaging a seller, being paid — never as the price of
looking at a dress.

Three options is deliberate. Google for speed, magic link for anyone who doesn't
want another password, email + password for anyone who doesn't want Google
knowing what she shops for. In this market that last one is not a fringe
preference.

### Tested against your live project — 7 checks, all passing

| | |
|---|---|
| **Google is already enabled** | returns a valid authorisation URL |
| Email sign-up | accepted, user record created |
| Email confirmation | **ON** — a new account must confirm before signing in |
| Sign-in before confirming | refused, with a clear reason |
| Magic link | can be requested |

Two things this surfaced that you should know:

**Email confirmation is on.** A new seller signs up, gets an email, taps the
link, and is in. That's the right default — but it means sign-up is not instant,
and the copy says "check your email" rather than pretending otherwise.

**The free tier sends about 3 emails an hour.** Fine for testing, not for
launch: a Saturday afternoon with twenty sign-ups would silently stop working.
Before you open the doors, point Supabase at a real SMTP provider (Auth →
Settings → SMTP). Resend or SendGrid, about an hour's work.

### This also removes the last blocker

Anonymous sign-in no longer matters. Real accounts give a real `auth.uid()`,
which is what every row-level policy is written against. Sign in and the backend
is live — shared catalogue, shops, follows, the lot.

### Google needs its redirect registered

Supabase → Authentication → URL Configuration → Redirect URLs, add:

```
com.loveitorleaveit.lili://auth-callback
```

The app already registers that scheme on both platforms — Android via an intent
filter, iOS via `CFBundleURLTypes` — so Google has somewhere to land. Without
the redirect on the Supabase side, the round trip completes and then stalls.

## What sign-in now unlocks

Signing in **activates the backend live**, without a restart. That gap was real
and worth naming: the sign-in screen existed before this and unlocked nothing —
`initBackend()` ran once at boot, found no session, stayed local, and never
looked again. You could create an account and the app would carry on as though
you hadn't.

**Identity is asked for where it binds.** Browsing needs no account. Opening a
shop does, and says why: it's how buyers reach you and how you get paid.

**It can be deferred.** "Not now" opens the shop on the device and says plainly
what that costs — no payouts, and nobody else can see it. Forcing an account
would have been worse than the friction it removed, especially while email
confirmation means signing up isn't instant.

**Signing out** is on the Account row, which shows the email you're signed in as.

## iPhone

The iOS project is **created and configured**: `ios/App`, with the URL scheme
for Google and the three permission strings Apple requires — camera, photo
library, and photo library add. An iOS build is rejected outright without those
strings, and the wording is what the user reads in the permission dialog, so
they say what lili actually does rather than "This app needs camera access".

**I cannot build it.** An `.ipa` requires macOS, Xcode, and an Apple Developer
account (USD 99/year). No amount of Linux gets around that — it is Apple's
toolchain restriction, not a gap in the setup.

On a Mac:

```bash
npm run build && npx cap sync ios
npx cap open ios          # opens Xcode
```

Then set the team, bundle identifier `com.loveitorleaveit.lili`, and archive.

**Expect differences.** Everything so far is verified on Android and in
Chromium. iOS uses WebKit, not Chromium: safe areas behave differently on
notched iPhones, momentum scrolling differs, and the keyboard resizes the
viewport in its own way. The layout is fluid and safe-area aware, so it should
hold — but "should" is doing real work in that sentence, and the first run on a
real iPhone will find things.
