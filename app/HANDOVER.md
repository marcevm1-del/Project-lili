# lili — handover

Everything a developer needs to pick this up cold. Written to be read in order.

---

## 1. What this is

**lili — love it or leave it.** A peer-to-peer fashion resale marketplace for
women in Dubai. Designer and high-street side by side, with **abayas and modest
fashion as a first-class category** — that is the differentiator, not a
sub-menu. Brand voice: "a group chat with a checkout button." Arabic is
feminine-conjugated throughout, not machine-translated.

**Current build: v2.8.** Android APK and Play bundle, both signed.

**`LAUNCH-RUNBOOK.md`** is the step-by-step for the private-beta launch:
Supabase configuration, invite codes, the one row that opens the doors, and how
to prove a listing and a message actually reach the server.

**Read `UPGRADE-v2.8.md` before changing anything in the sell flow or the
screening rules.** It covers a design-token bug that made 149 style
declarations resolve to `undefined`, the rewrite of counterfeit screening from
per-brand price floors to brand-tier × category × condition bands with a
scored threshold, two holes that let listings past the price check, and the
fabricated ratings and claims that were removed. It carries the citations.

---

## 2. Getting it running

```bash
unzip lili-app-source.zip && cd lili-app
npm install
npm run dev            # browser, localhost:5173
npm run verify         # every test suite — do this before you change anything
```

Android:

```bash
npm run build && npx cap sync android
npm run apk            # debug APK
npm run bundle         # signed AAB for Play
npm run android        # open in Android Studio
```

iOS (needs macOS + Xcode + Apple Developer account, USD 99/yr):

```bash
npm run build && npx cap sync ios
npx cap open ios       # set team + bundle id com.loveitorleaveit.lili, archive
```

**You will need the signing keystore.** `android/lili-release.jks` and
`android/keystore.properties` are deliberately git-ignored and are **not** in
the source zip. That key is the app's identity on Play — lose control of it and
someone else can ship an update to your users; lose it entirely and you cannot
ship at all. Keep an offline copy somewhere you would keep a passport.

---

## 3. Architecture in one page

```
src/
  Marketplace.jsx      the app — feed, item, cart, sell, profile (~2,300 lines)
  App.jsx              shell: theme, backend init, OAuth deep link, boundaries
  backend/
    config.js          ← THE SWITCH. Empty = device-only. Filled = multi-user.
    remote.js          Supabase adapter: same signatures as repo.js
  data/
    repo.js            every read and write in the app goes through here
    conversations.js   threads: remote when there is a backend, device when not
    offers.js          the haggle state machine, client side
    fees.js            what lili charges — tiered 10%→6%, VAT, the one source
  offers/  notifications/   the two screens that had no callers until v2.8
  ux/timeout.js        bounded waits — an unreachable server is silence, not an error
    images.js          EXIF stripping, resize, thumbnails
    resaleValue.js     brand tiers, category bands, model floors, condition
  sell/
    listingQuality.js  evidence-weighted listing coach (never blocks)
    ListingQuality.jsx PhotoCoach.jsx
  compliance/          market gate, consent, agreements, moderation, screening
  auth/                sign-in screen + breached-password check
  trust/               earned trust signals
  loading/             per-item skeletons and error states
  icons/               48 custom SVG icons, no emoji anywhere
  theme/  i18n/  ux/   themes, 12 languages, tolerant input parsing
```

**The one idea worth understanding:** every read and write goes through
`repo.js`. It asks one question — is a backend configured *and reachable with a
real session*? If yes it calls `remote.js`; if not it uses device storage. No
component knows which mode it is in. That is why the app works offline, on a
fresh install, and against the server without any component changing.

Reads are **local-first**: the device answers immediately and the server only
wins if it is genuinely fast. An early version awaited the network before first
paint, which on Dubai mobile data meant staring at a gate screen.

---

## 4. The backend

**Supabase project `yjsmkjwvoolsszsedony`** (org MVM.Corp), region
**eu-north-1, Stockholm**.

Two things to know before you touch it:

**It is not in the UAE.** Supabase has no Gulf region. Stockholm is defensible
under PDPL (the EU is the strongest adequacy case) but it is not what was asked
for. Mumbai is nearer (~40 ms vs ~120 ms) with a weaker adequacy argument.
**Region cannot be changed after creation** — moving means a new project.

**You are sharing the project with another application.** `public` also holds a
journalling/forum app with real users. Its schema already owns tables called
`follows`, `reports`, `blocks` and `notifications`. Every lili table is
therefore prefixed `lili_`. **Never write an unprefixed table.**

### Tables (all with row-level security)

| Table | Holds |
|---|---|
| `lili_shops` | seller shops, strikes, follower counts |
| `lili_items` | listings, screening verdict, photos + thumbs |
| `lili_profiles` | market, consent record, birth year |
| `lili_follows` `lili_saves` `lili_carts` `lili_blocks` | personal state |
| `lili_conversations` `lili_messages` | private threads |
| `lili_offers` | haggling, with a state machine |
| `lili_notifications` | delivery of everything above |
| `lili_moderation_cases` | reports and decisions |
| `lili_audit` | append-only, **no client can read it** |
| `lili_search_terms` | curated Arabic↔English garment vocabulary |

### The rules that are NOT in the app

These are enforced by the database because a client can be lied to:

- A listing **cannot be created live**. It arrives `pending`, a trigger screens
  it for counterfeits, prohibited goods and suspiciously cheap flagship brands,
  and the database decides. Re-screened on edit.
- **Server-owned columns** — ownership, status, screening verdict, followers,
  strikes, timestamps — are reverted by trigger on any client write.
- **Follower counts** are computed from real rows.
- **Messages cannot be edited** after sending. Only `read_at` changes.
- **Offers**: seller read from the listing, amount immutable, one open offer per
  buyer per piece, seller accepts/declines/counters, buyer only withdraws,
  48-hour expiry read from the clock rather than a cron.
- **Moderation** requires a claim in `app_metadata` that only the service role
  can write. Decisions are immutable and must carry a reason, which is delivered
  to both the reporter and the seller.

### Functions

`lili_search(query, limit)` · `lili_shop_stats(shop_id)` ·
`lili_offers_for_me()` · `lili_moderation_list/claim/decide` ·
`lili_is_moderator()`

---

## 5. What still needs a human

| | |
|---|---|
| **Google redirect** | Supabase → Auth → URL Configuration → add `com.loveitorleaveit.lili://auth-callback` |
| **Leaked-password protection** | Auth → Policies. The app checks this itself too, but only the server check is a control |
| **Real SMTP** | Auth → Settings. The free tier sends ~3 emails/hour — a busy Saturday will silently stall |
| **Moderator claim** | `update auth.users set raw_app_meta_data = raw_app_meta_data \|\| '{"moderator":true}' where email = '…'` then sign out and in |
| **Payments** | Trade licence → bank → CBUAE-licensed processor. See `lili-costs-and-plan.pdf`. 6–10 weeks, nothing in code shortens it |
| **Push notifications** | Needs Firebase credentials. In-app delivery already works |

---

## 6. Testing

`npm run verify` runs everything. Individually:

| Command | What it proves |
|---|---|
| `smoke` | 198 unit checks |
| `research` | 175 — the v2.8 rules: price bands, screening score, listing quality, honesty invariants |
| `walk` | 71 — clicks every screen in jsdom |
| `visual` | 55 — real Chromium, real layout, real tap targets |
| `devices` | 66 across 11 screen sizes, 280px → 1024px, plus 200% text |
| `security` | 202 — including live probes against the real database |
| `a11y` | axe-core, WCAG 2.1 AA, 15 screens |
| `keyboard` | focus traps, Escape, focus rings |
| `functional` `integration` `loading` `settings` | outcomes, not absence of errors |
| `android-compat` | what the bundle requires of an Android WebView |

**Layers 8–9 of the security suite hit the live project with the key the app
ships.** What passes there is what an attacker actually meets.

### Two lessons from this codebase's own history

**jsdom has no layout engine.** The `walk` suite cannot see one element covering
another. It missed a Settings screen rendering 1,065px below the fold and an
overlay swallowing clicks. If a bug is about *seeing*, only `visual` will catch
it.

**Assert the property, not the shape.** Several tests passed for the wrong
reason — one matched the Supabase SDK's key-format *detector* rather than a key;
one grepped a React component for a rule that lives in the database. A green
suite is only as honest as its weakest assertion.

**v2.8 found two more of these.** No suite noticed that `C.terraTx`, `C.btn`
and `C.onBtn` were referenced 149 times and defined nowhere — jsdom has no
computed styles, `contrast.mjs` checks the stylesheet rather than the
components, and an undefined style property throws no error. And the
`integration` suite's `tap()` returns `false` on a miss rather than failing, so
its language check has never reached the screen it tests. A helper that
swallows a miss is how an assertion ends up testing nothing.

---

## 7. Traps that will cost you a day

**`SECURITY DEFINER` on a guard defeats the guard.** `guard_shop_columns` runs
without it deliberately: with it, `current_user` is always `postgres` inside the
function, so the moderation bypass matched every caller and a seller could clear
her own strikes. A guard reachable through a privileged path must not itself be
privileged.

**`frame-ancestors` does nothing in a `<meta>` CSP.** HTTP header only.

**`aspect-ratio` and `dvh` need fallbacks first.** Declare `vh` before `dvh`,
`padding-top` before `aspect-ratio`. Old WebViews drop the line they cannot
parse and keep the fallback.

**Android 15 forces edge-to-edge on targetSdk 35**, overriding the StatusBar
API. Handled in `values-v35/styles.xml`. Remove it and content slides under the
status bar.

**A trigger cannot reference the row it is creating.** Screening decides the
verdict `BEFORE INSERT` and files the moderation case `AFTER` — the first
version failed the foreign key and made review-worthy listings impossible.

**Never call a parent's setState during render.** `ListingScreen` did, causing
React error #185 and a crashed page the moment a seller typed a price. It now
reports after commit, keyed on the verdict's shape rather than a fresh object.

---

## 8. Where I would go next

1. **Payments.** The checkout button is the product; everything else is a
   beautifully built catalogue until money moves.
2. **Thirty real sellers with good photographs.** A resale app with no listings
   is dead on arrival and no feature fixes it. This beats any engineering.
3. **Buyer reviews after a completed sale** — needs payments first, because a
   review with no transaction behind it is the easiest thing to fake.
4. **Push notifications.**
5. **On-device photo cleanup and a lighting hint at capture.** Photo quality
   drives resale conversion more than any algorithm.

**What I would not build:** a recommendation algorithm (with a few hundred
listings, a human with taste wins, and it is truer to "a group chat"), or
stories and live selling (expensive, and not why anyone would choose you).

---

## 9. The honest part

The differentiator is **cultural, not technical** — abayas, Arabic, and the
tone. Everything here protects that: the compliance posture, the screening, the
moderation trail, the privacy of the messages. None of it creates it. That comes
from who is invited in first and what is refused. No code makes those calls.

And this has been tested in Chromium and on Android. **It has never run on a
real iPhone**, and iOS uses WebKit — safe areas, momentum scrolling and keyboard
behaviour all differ. The layout is fluid and safe-area aware, so it should
hold. "Should" is doing real work in that sentence.
