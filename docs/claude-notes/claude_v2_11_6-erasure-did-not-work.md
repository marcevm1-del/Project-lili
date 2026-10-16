# v2.11.6 — the right to erasure did not work

Backend, security, legal. The client-side audit was green the whole time.

**1,302 checks across a verify that now runs to the end · 464 research · 223
security · 199 smoke · 71 walkthrough · 66 device · 55 visual · 33 audit · 32
UX-audit · 30 i18n · 27 UX-laws measured on the glass · 26 image-quality · 23
functional · 17 loading · 13 a11y · 13 keyboard · 13 settings · 6 old-WebView ·
4 legal, new.**

Full write-up in `LEGAL-AND-SECURITY-REVIEW.md`. The short version:

---

## This Supabase project holds two applications

lili owns 22 tables. Another product owns 17 — journal entries, forum threads,
climate snapshots, billing consents, profiles. **They share one `auth.users`**,
and a signup in either fires `handle_new_user`, which writes a row into the
other's `profiles` table. Every lili seller has a profile, carrying her email,
in a journalling app she has never heard of.

Nine of that product's tables cascade from `auth.users`.

`lili_erase_me()` ended with `delete from auth.users where id = me`.

## So "delete my account" had two outcomes and neither was erasure

**If she had a billing consent record, it failed outright.**
`billing_consents_append_only` raises on any delete while `auth.uid()` is set —
cascades included — so the transaction aborted and she got a raw
`check_violation`. Proved with a throwaway account rather than assumed:

> `BLOCKED — A consent record cannot be changed after the fact.`

For those users the right to erasure was **not deliverable**. PDPL Art. 16.

**For everyone else it destroyed an unrelated account.** Journal, forum history,
recaps, consent records — cascaded away by a tap in a resale app, under a receipt
listing only *listings, shops, offers, saves*. A receipt describing a far smaller
act than the one performed. That is this project's oldest defect class, in its
most expensive form yet.

## lili erases lili

`lili_erase_me()` now names what the sign-in is used for elsewhere, deletes the
shared sign-in **only when the account is lili's alone**, and otherwise keeps it
and says so in the receipt — with what else it is used for and how to close it
properly. It also now clears `lili_blocks` and `lili_profiles`, which it had been
missing.

Both branches verified end to end. A shared sign-in survives with the other
product untouched; a lili-only sign-in is fully removed, profile shell and all.

**One of my own bugs is worth recording.** The first "is this account used
elsewhere" test asked `profiles.journey is not null`. `journey` defaults to
`'explorer'`, so it matched every account — meaning no lili account would ever
have been erasable. The same bug wearing the opposite face. The test now has to
differ from the default to count.

---

## Three more

**Eleven lili functions had a mutable `search_path`** — the standard Postgres
definer-rights escalation route. All pinned. The other product's are left alone
and reported to its owner.

**Cross-app privilege escalation: tested, and closed.** The other product grants
admin through a `profiles.is_admin` column. Three independent controls hold — no
`UPDATE` grant on the column, the `force_default_tier` trigger pins it, and
`founder_emails` is deny-all. Recorded because it was checked, not assumed.

**`npm run verify` had been stopping early.** `audit` exited 1 on two
permanently-red artefact lines, so the `&&` chain died and **`imagequality`,
`i18n`, `preflight` and `legal` never ran inside a verify.** Confirmed by
grepping a full log for their output and finding none — which means the
"full verify is green" in recent release notes was reporting suites run by hand.
A release APK cannot be built in this checkout at all (`keystore.properties` is
deliberately absent), so those lines are now work-for-a-human and `audit` exits
0. Verify runs to the end and stops on `preflight`, which still blocks for the
real reason.

---

## New: `npm run legal`

Obligations tested against the database, not read off the client. In `verify`,
ahead of `preflight`. With the shipped key it checks erasure and export refuse
anonymous callers and that captured evidence is closed; with
`SUPABASE_SERVICE_KEY` it runs the erasure-boundary probe
(`legal/erasure-probe.sql` for the SQL editor).

Its own first version nearly cried wolf: it read the evidence table and treated
"no error" as failure, but PostgREST answers an RLS denial with an empty array
and HTTP 200, and the table has zero rows — denial and emptiness look identical.
It attempts a write now, refused with `42501` whatever the row count.

---

## Still open

Anonymous sign-in is still off — `preflight` still blocks on it, and it is still
thirty seconds in the dashboard. Zero live listings. Payments, authentication,
push, shipping and iOS unbuilt behind seams that refuse.

And one new item that outranks most of the list: **the data-controller boundary
is now enforced in code and described nowhere in the paperwork.** Two products
on one identity table is a question for counsel.

The APK here is debug-signed for sideloading. It is not the artefact Play takes.
