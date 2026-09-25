# Launch runbook — private beta

Updated for v2.9.1. Run `npm run preflight` before anything else; it checks the
things that are not in the source tree and fails loudly.

## Day 0 — the project, not the code

| Blocker | State | Who |
|---|---|---|
| **Anonymous sign-in** | ❌ **still off** | **You** — Supabase → Authentication → Sign In / Providers → Anonymous sign-ins |
| Moderator claim | ✅ done — `marcevm1@gmail.com` | — |
| Invitation codes | ✅ 30 minted, `LILI-XXXX` | — |
| Photo storage bucket | ✅ created — **it did not exist** | — |
| Beta gate | ✅ on — invite required to sell | — |

**The one left is the one that matters most.** While anonymous sign-in is off,
`initBackend` catches the failure and runs device-only: the app works perfectly
on every phone and no two phones can see each other. Every seller onboarded
before you flip it is listing into a private copy of the app on her own handset.

**The bucket was the surprise.** Four policies on `storage.objects` referenced
`bucket_id = 'lili-photos'`, correctly scoped so a seller writes only in a folder
named for her uid. The bucket they guard had never been created, so
`storage.buckets` was empty and every listing with a photograph would have thrown
at upload. Found by `npm run preflight` on its first run — nothing in the source
tree can see a bucket that isn't there.

## Day 1–7 — the thirty sellers

The app is no longer the constraint. `SELLER-PLAYBOOK.md` is the week: who to
ask and in what order, the hour to spend with each one, eight to twelve pieces
per shop rather than three, and what to say when she asks about money.

Three things now exist to support it:

- **Sell → Several at once.** She picks every photograph from her camera roll
  and gets one row per piece. Same publish path, same EXIF stripping, screening
  per row, and each row reports its own outcome.
- **Privacy & Safety → Beta roster.** Mint 5/10/30, copy a code, withdraw an
  unused one. Four numbers: invited → redeemed → opened a shop → **actually
  listed**. The gap between the second and the fourth is the job.
- **The invite box** on the invite-only screen. It used to say "close the app
  and reopen it".

Hand codes over **one at a time, to a named person, in a conversation**. A code
dropped in a group chat is a code nobody feels responsible for, and the roster
will show you exactly that.

## Measuring it

`SUPABASE_SERVICE_KEY=… npm run funnel` (add `-- --html` for a report).

Six views: `lili_funnel`, `lili_sell_dropoff`, `lili_missing_demand`,
`lili_search_health`, `lili_control_use`, `lili_errors`. Service-role only —
`lili_events` has no SELECT policy for any client role, and a view does not grant
what the table refuses. The key is never in the repository.

Look at **`lili_missing_demand`** first: zero-result search terms, a shopping
list written by the people who wanted to buy. At thirty sellers it is worth more
than the rest of the dashboard.

Consent is opt-in in the UAE and nothing is collected without it, so small
numbers are correct behaviour, not a bug. Read the funnel for shape and for the
biggest single fall.

## Safety, while there is no escrow

The meet is now a thing in the thread: one side proposes a place and time, **the
other confirms**, and that rule is a database trigger — a plan whose value is
"we both agreed" is worth nothing if one side can agree for both. A check-in
afterwards, and *something felt wrong* opens the report path with the thread
attached.

Verified live: the proposer cannot confirm her own plan; the other side can; a
check-in cannot be edited afterwards; an outsider reads zero rows.

**No location is claimed to be verified.** There is no Dubai Police safe-exchange
programme — the app offers criteria and kinds of place, names the places to
refuse, and puts 999 / 901 / ecrime.ae ahead of lili for anything dangerous,
alongside "lili can close a shop, and that is all it can do."

## What is still not built, and is marked as such in the app

Payments, escrow, shipping, refunds, third-party authentication, iOS, push.
`fees.COLLECTION_LIVE` and `PAYMENTS_LIVE` are false and every buyer-facing
screen reads from that one flag. `preflight` fails if a payments claim ever gets
ahead of a payments rail.

## Verification at this release

302 research · 223 security · 198 smoke · 71 walkthrough · 66 device · 55 visual ·
21 functional · 17 loading · 15 a11y screens · 13 integration · 13 keyboard ·
13 settings · 6 old-WebView · contrast clean.

`npm run preflight`: 13 checked, 1 blocking, 1 to look at. The audit's two
failures are the missing APK artifacts and multi-user; multi-user clears the
moment the sign-in toggle is flipped.
