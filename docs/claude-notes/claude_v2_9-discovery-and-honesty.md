# v2.9 — discovery, ranking, and four promises the app could not keep

Research-and-improve pass over the surfaces nobody had audited: search, ranking,
the feed, and the near-empty catalogue you will actually launch into. It found
those, and something larger on the way.

## The one to read first

**Four buyer-facing surfaces told a woman that lili holds her money and will
refund her.** The acknowledgement she taps to sign up; the first Help Centre
answer; Legal Centre → How lili works; and "You get your money back" on a fake.

There is no processor, no escrow, no trade licence and no shipping —
`fees.COLLECTION_LIVE` has been `false` since v2.8, and `MeetSafely.jsx` told her
so correctly on a different screen. A woman who read the first four and then met
a stranger with cash believed there was a refund behind her.

Fixed with one source of truth (`HOW_MONEY_WORKS` in `compliance/sellerRules.js`,
branched on the payments flag). All four surfaces read it; the day a processor
goes live the flag flips and they change together.

Three more claims went the same way: the splash screen's "Authentic & Verified /
Secure Payments / Fast Delivery" (none true, on the first screen of the product),
"high-value brands have to be authenticated before listing" (nobody authenticates
anything), and a stale flat "lili takes 10%".

## Discovery

- **`lili_search` had no callers.** The bilingual, unaccented, typo-tolerant RPC
  has been in the database since v2.8 and the app never called it — four separate
  substring filters ran instead, none of which searched `titleAr`. **عباية
  returned nothing**, in an app whose sell flow tells sellers the Arabic title is
  what makes a piece findable in Arabic. Wired in, with the same rules mirrored
  on-device for offline.
- **Nothing in the app was sorted.** Not the feed, not a category, not a shop
  page. Meanwhile the filter sheet offered Sort By, Size and Colour — three
  controls, with checkmarks, that were stored and read by nothing. Sort and Size
  work now; Colour was removed because the sell flow never asks for one.
- **"Most Saved" is real**, via a trigger-maintained `saves` count that no client
  can write.
- **Zero results now recover** — the empty state names the word that killed the
  search and suggests from live stock. (Baymard 2026: 64% of app search
  experiences rate mediocre or worse, mostly on the dead end.)

## "For You" and "New In"

- The splash asks "What's your style?" and the **"Show My Feed" button discarded
  the answer**; the header said "Curated to your style" over a global unsorted
  feed; the consent sheet asked permission for personalisation nothing consumed.
  The feature exists now — it reorders, never hides, runs only with consent, and
  is editable from the feed it affects.
- **"New In" was empty the day you went live.** `isNew` was a client boolean that
  never expired and is not a column, so every remote item returned `undefined`.
  Derived from `created_at` now.

## Enforcement

- **Server-owned columns.** The `SERVER_OWNED` list in `remote.js` was the only
  thing stopping a seller writing her own `previous_price` — and it is JavaScript
  on a handset. UPDATE is now revoked at the column level on `previous_price`,
  `price_changed_at`, `saves`, `created_at`, `owner_uid`, `id`, and on shop
  `followers`/`strikes`. Verified live.
- **The funnel exists.** Consent for analytics has been collected since v2.7 and
  read by nothing. `lili_events` now: silent without consent, no free text except
  a zero-result search term under a stated rule (no digits, no "@", ≤40 chars),
  no SELECT policy for any client role, and withdrawal *erases* rather than
  merely stopping — PDPL, Federal Decree-Law 45 of 2021.

## Sell flow

"Next" never validated, so a seller could reach the last screen with nothing
filled in and meet a publish button that silently did nothing. Drafts were lost
on any tab tap, processed photographs included. The invite screen told her to
force-quit the app to enter her code. "Skip authentication" still published the
provenance claim she was skipping. All fixed.

## Verification

257 research · 222 security · 198 smoke · 71 walkthrough · 66 device · 55 visual ·
21 functional · 17 loading · 15 a11y screens · 13 integration · 13 keyboard ·
13 settings · 6 old-WebView · contrast clean. The audit's 2 failures are the
missing APK artifacts and multi-user, unchanged from baseline.

## Still day-1 blockers, unchanged by this release

Anonymous sign-in is switched off on the Supabase project, so the app cannot get
a session and runs device-only. Zero moderator claims exist, so the moderation
queue opens onto nothing. Both are in the launch runbook. Payments, shipping,
authentication, iOS and push remain not-built and are marked as such in the app.
