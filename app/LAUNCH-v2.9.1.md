# v2.9.1 — launch blockers, sellers, the funnel read back, and the meet

Four things, in the order you chose them. The first one found a blocker nobody
knew about.

---

## 1 · Unblock the launch

### Done, on the live project

| | |
|---|---|
| **Moderator claim** | `marcevm1@gmail.com` now carries `app_metadata.moderator`. The queue reads real cases (v2.8) gated on `lili_is_moderator()`, which was false for every account — the first report would have gone into a queue nobody could open. It also makes you a beta member automatically, so you can list. |
| **30 invitation codes** | Minted, `LILI-XXXX` format, from an alphabet with no O/0, I/1, S/5 or B/8 — a code gets read aloud in a voice note and typed by someone who has never seen it written. |
| **Minting is a function now** | `lili_mint_invites`, `lili_invite_roster`, `lili_revoke_invite` — moderator-gated in the database. An invitation used to require SQL in a console. |
| **The photo bucket** | See below. |

### The blocker nobody knew about

`storage.buckets` was **empty**. Four policies on `storage.objects` reference
`bucket_id = 'lili-photos'` — read, insert, update, delete, each correctly
scoped so a seller writes only inside a folder named for her own uid. All four
were written. **The bucket they guard was never created.** Every listing with a
photograph would have thrown at upload.

Created, public read, 8 MB cap, image types only.

This is the argument for the whole of `npm run preflight`, which found it on its
first run: nothing in the source tree can see a bucket that isn't there.

### Still yours to do

**Anonymous sign-in is switched off.** Supabase dashboard → Authentication →
Sign In / Providers → Anonymous sign-ins. Until then `initBackend` catches the
failure, writes a console line nobody reads, and runs device-only: the app works
perfectly on every phone and no two phones can see each other. It is the one
thing I cannot do from here, and every seller you onboard before it is listing
into a private copy of the app on her own handset.

### `npm run preflight`

A thirteen-check suite that tests the **project**, not the code — the things
switched on in a dashboard, the rows that must exist, the claims on an account.
Exits non-zero and says *Do not ship*. Wired into `npm run verify`. It currently
reports **1 blocking** (the sign-in toggle) and **1 to look at** (zero listings).

---

## 2 · Seller concierge kit

**"Several at once"** — a third mode in the sell flow. She picks every
photograph from her camera roll and gets one row per piece: a name and a price
each, everything else defaulted and editable. Same publish path, same
EXIF-stripping pipeline, screening per row before anything is sent, and **each
row reports its own outcome** — the v2.8 lesson, where `lili_items` held zero
rows for weeks while sellers watched their pieces appear in their own shops.

Uploads run sequentially, not eight at once on Dubai mobile data. And nothing is
guessed: no inferred titles, no auto-pricing. The reference band already in the
app sits next to the price field and she types the number.

**Beta roster** (Privacy & Safety → Beta roster). Mint 5 / 10 / 30, copy a code,
withdraw an unused one, and see four numbers: **invited → redeemed → opened a
shop → actually listed.** The gap between the second and the fourth is the whole
job, and the screen says so — *"a code is not a seller"* — because counting
redemptions as sellers is how a private beta convinces itself it's working while
the catalogue stays empty.

**`SELLER-PLAYBOOK.md`** — the week. Who to ask and in what order, the hour to
spend with each one, eight to twelve pieces per shop not three, what to say when
she asks about money, and what not to do (no fake listings, no marketing to
buyers yet — growing both sides at once is the named failure mode).

---

## 3 · The funnel, read back

Six SQL views, so *"reached the first listing"* means one thing rather than one
thing per person who asks:

`lili_funnel` · `lili_sell_dropoff` · `lili_missing_demand` ·
`lili_search_health` · `lili_control_use` · `lili_errors`

All service-role only — `lili_events` has no SELECT policy for any client role,
and a view does not grant what the table refuses.

**`npm run funnel`** reads them and prints where people stop, counted by
*session* rather than by user (a funnel counted by user rises forever and never
tells you whether last week's change helped). It names the biggest single fall.
`-- --html` writes a themed report.

It needs `SUPABASE_SERVICE_KEY` passed at the command line, and says exactly why
when you don't give it. That key is not in the repository and must never be.

The view I would look at first is **`lili_missing_demand`** — zero-result search
terms. A shopping list written by the people who wanted to buy and couldn't find
it, and at thirty sellers it is worth more than the rest of the dashboard.

The script also tells you what an empty result *means*: nobody has used the app,
or consent is off (opt-in here, so small numbers are normal and correct), or
sign-in is still disabled.

---

## 4 · The meet

`MeetSafely.jsx` said the right three things on a sheet she had to open. Advice
you have to go and find is a disclaimer with better typography.

The meet is now a thing in the thread. One of them proposes a place and a time,
**the other confirms it** — and that rule is a database trigger, because a plan
whose entire value is "we both agreed" is worth nothing if one side can agree on
behalf of both. Then a check-in afterwards: *all fine* / *she didn't come* /
*something felt wrong*, the last of which opens the report path with the thread
attached.

Verified against the live database, not asserted in a comment:

- the proposer **cannot** confirm her own plan — refused
- the other side **can** — ok
- a check-in **cannot** be edited after the fact — refused
- somebody not in the conversation reads **zero rows**

### The thing this deliberately does not do

Many marketplaces publish "safe exchange zones" — locations formally designated
by a police force that agreed to it. **There is no such programme in Dubai.** I
looked. What Dubai Police publishes about online trading concerns fake
advertisements, cloned websites and AI-assisted fraud calls; there is no
designated meeting-point scheme.

So the app offers **criteria and kinds of place** she chooses from — a mall, a
café, a metro concourse, a staffed lobby — never an address that goes stale or
reads as an endorsement of one mall over another, and it says in as many words
that these are *busy public places, not verified or supervised ones*.

A badge implying a police-approved location that does not exist would be the
most dangerous fabrication this codebase could contain — worse than the invented
review counts, worse than the escrow that wasn't there — because she would act
on it, alone, with a stranger. The research suite asserts it is absent.

It also names the places to **refuse**, and why the ask itself is the signal:
*"Being asked to come inside is itself the warning."* And it puts 999, 901 and
ecrime.ae ahead of lili for anything dangerous, alongside the sentence *"lili can
close a shop, and that is all it can do."*

No location tracking of any kind. No coordinates, no journey sharing, no
background anything — asserted by the suite.

---

## Also fixed on the way

- **"3 taps. Photo, price, live. Under 60 seconds."** was never true — the flow
  is three screens plus a mode choice plus the fields. It says what it is.
- An **empty `<span style={{fontSize:36}}/>`** on the Quick List button — a
  stripped emoji leaving a 36px hole. Same residue as the feed's old empty state.

---

## Verification

**302 research · 223 security · 198 smoke · 71 walkthrough · 66 device · 55
visual · 21 functional · 17 loading · 15 a11y screens · 13 integration · 13
keyboard · 13 settings · 6 old-WebView · contrast clean.**

`npm run preflight`: 13 checked, **1 blocking** (anonymous sign-in — yours),
1 to look at (zero live listings — that's the playbook).

The audit's two failures are the missing APK artifacts and multi-user, unchanged
from baseline. Multi-user clears the moment you flip the sign-in toggle.
