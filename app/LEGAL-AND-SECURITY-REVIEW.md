# Legal and security review — v2.11.6

A review of what the **database** enforces, rather than what the app claims. The
client-side audit was green throughout; three of the four findings below are
invisible from the client, and the most serious one meant a legal right did not
work at all.

Everything here was verified by running it against the live project, not by
reading code. Where a probe was used it is in `legal/erasure-probe.sql` and can
be re-run.

---

## The finding that matters: two applications, one database

`yjsmkjwvoolsszsedony` hosts **two products**.

| | tables |
|---|---|
| lili | 22 (`lili_*`) |
| another product | 17 (`entries`, `forum_*`, `climate_snapshots`, `billing_consents`, `profiles`, `annual_recaps`, `insight_history`, …) |

They share one `auth.users`, one API surface, and one publishable key. A signup
in **either** product fires the `handle_new_user` trigger, which writes a row
into the other product's `profiles` table. Every lili seller therefore has a
profile in a journalling app she has never heard of, carrying her email address.

Nine of the other product's tables cascade from `auth.users`:
`entries`, `forum_threads`, `forum_posts`, `forum_likes`, `annual_recaps`,
`climate_snapshots`, `insight_history`, `billing_consents`, `profiles`.

### What that did to the right to erasure

`lili_erase_me()` ended with `delete from auth.users where id = me`.

So **"delete my account" in a fashion marketplace had two possible outcomes,
neither of them erasure**:

1. **For a user with a billing consent record — it failed outright.**
   `billing_consents_append_only` raises on any delete while `auth.uid()` is
   set, and a cascade is still a delete. The whole transaction aborted and the
   woman received a raw `check_violation`. Verified:

   > `BLOCKED — A consent record cannot be changed after the fact.`

   For those users the right to erasure was **not deliverable at all**. Under
   PDPL (Federal Decree-Law 45/2021) Art. 16 that is a straight failure, and the
   app reported a control that did not exist.

2. **For everyone else — it destroyed an unrelated account.** Journal entries,
   forum history, annual recaps, billing consent records: all gone, cascaded
   away by a tap in a resale app, under a receipt that listed only *listings,
   shops, offers, saves*. The receipt described a far smaller act than the one
   performed. That is the defect class this project exists to prevent, in its
   most expensive form.

### The fix

**lili erases lili.** `lili_erase_me()` now:

- deletes all lili data as before (and additionally `lili_blocks` and
  `lili_profiles`, which it had been missing);
- works out whether the sign-in is used anywhere else, naming what it finds —
  journal entries, forum posts, annual recaps, saved snapshots, insight history,
  a billing consent record, or a *personalised* profile in the other app;
- **deletes the shared sign-in only when the account is lili's alone**;
- otherwise keeps the sign-in and says so explicitly in the receipt, with what
  it is also used for and how to close it properly.

Both branches verified end to end:

| scenario | result |
|---|---|
| shared sign-in (billing consent elsewhere) | erasure runs · sign-in kept · other product untouched · `sign_in.removed = false` |
| lili-only sign-in | erasure runs · `auth.users` row gone · profile shell gone · `sign_in.removed = true` |

A subtlety worth recording: the first version of the "is this account used
elsewhere" test asked `profiles.journey is not null`. `journey` **defaults to
`'explorer'`**, so it matched every account, and no lili account would ever have
been erasable — the same bug wearing the opposite face. The test now has to
*differ from the default* to count.

---

## The other three

**Eleven lili functions had a mutable `search_path`.** A `SECURITY DEFINER`
function without a pinned path resolves table names using the *caller's*
`search_path`. Create your own `lili_items` in a schema you control, put it
first, and the function operates on your table with the owner's privileges. All
eleven are now pinned to `public, pg_temp`. The other product's functions were
left alone — they are not ours to change, and are listed below for its owner.

**Privilege escalation between the two apps: checked, and closed.** The other
product grants admin through a `profiles.is_admin` column, which a lili user
could in principle target. Three independent controls hold: `authenticated` has
no `UPDATE` grant on that column; the `force_default_tier` trigger pins it on
both insert and update; and `founder_emails` carries a deny-all policy
(`using false`, `with check false`). Recorded because it was tested, not assumed.

**`npm run verify` had been stopping early.** `audit` exited 1 on two
permanently-failing artefact lines — no release APK, no `.aab` — so the `&&`
chain died there and **`imagequality`, `i18n`, `preflight` and the new `legal`
suite never ran inside a verify**. Confirmed by grepping a full verify log for
their output and finding none. The release APK cannot be built in this checkout
at all, because `keystore.properties` is deliberately absent, so those lines now
report as work for a human and `audit` exits 0. `verify` runs to completion and
ends on `preflight`, which still blocks for a real reason.

---

## Now enforced by a suite

`npm run legal` — it tests obligations against the database rather than reading
the client. Wired into `npm run verify`, ahead of `preflight`.

With the shipped publishable key it checks that erasure and export refuse an
unauthenticated caller, and that captured conversation evidence is closed to the
public. With `SUPABASE_SERVICE_KEY` it additionally runs the erasure-boundary
probe.

One methodological note, because it nearly produced a false alarm: the first
version of the evidence check read the table and treated "no error" as failure.
PostgREST answers an RLS denial with an empty array and HTTP 200 — not an error
— and the table holds zero rows, so denial and emptiness were indistinguishable.
It attempts a **write** now, which RLS refuses with `42501` whatever the row
count. *Assert the property, not a proxy.*

---

## Still for a human

Unchanged from before, plus one new entry:

- **Data controller boundary.** The code now stops at the boundary. The paperwork
  does not describe one. Two products sharing one identity table and one database
  raises who-controls-what, what each privacy notice must say, and whether a
  processing agreement is needed between them. This is a question for counsel and
  it is now the most consequential open item.
- Terms of Sale (seller to buyer) — lili must not be a party.
- Arabic legal translation — consumer terms need it, and Arabic prevails.
- Agent vs principal for VAT.
- Retention schedule signed off — the 24 months asserted in `lili_erase_me` is
  stated in the receipt and has never been approved by anyone.

## For the other product's owner

Not changed here, because they are not lili's to change:

- `billing_consents_append_only` fires on cascades. Its sibling
  `admin_actions_append_only` guards with `pg_trigger_depth() = 1` so that a
  referential action is distinguishable from a client rewriting history; the
  billing one does not, so *any* account deletion involving a consent record
  fails. lili no longer triggers it, but the other product still will.
- Leaked-password protection is off (Supabase Auth → Passwords). One toggle.
- `pg_trgm` and `unaccent` are installed in `public`.
