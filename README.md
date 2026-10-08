# Project-lili

lili is a curated resale marketplace for the UAE (Capacitor app + Supabase backend).

## Start here

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the app, database and CI fit together
- [docs/SECURITY.md](docs/SECURITY.md): trust boundaries, what is public, abuse controls, secrets
- [docs/RUNBOOK.md](docs/RUNBOOK.md): what to do when something is wrong
- The `app/*.md` files are release notes and reviews kept as history.

## What is in this repository

| Path | Contents |
|---|---|
| `docs/claude-notes/` | Release notes, launch runbook, legal/security reviews (v2.8 → v2.11.7) |
| `supabase/migrations/` | Every lili database migration (72), exported from the live project's history |
| `supabase/pending/` | Fixes written but not yet applied — need the owner to run them |
| `docs/review-2026-10-08.md` | Full review of the live database code and what was fixed |
| `docs/functional-and-market-review-2026-10-08.md` | End-to-end test results and comparison with similar apps |
| `supabase/tests/functional_test.sql` | Re-runnable end-to-end test (rolls itself back) |
| `app/` | The app: React + Vite + Capacitor (Android/iOS), v2.11.7 source and its test suites |
| `.github/workflows/app.yml` | Tests every push, builds the Android APK, publishes it as a Release |

## Install the app on an Android phone

1. On the phone, open **github.com/marcevm1-del/Project-lili/releases**.
2. Open the newest release and tap **lili.apk**, then **Open**.
3. If Android asks, allow your browser to install unknown apps
   (Settings → Apps → *your browser* → Install unknown apps), then tap **Install**.

Once a build from `main` exists, this link always gives the newest one:
`https://github.com/marcevm1-del/Project-lili/releases/latest/download/lili.apk`

**So each new build installs as an update** (instead of "App not installed"), add
these four repository secrets (Settings → Secrets and variables → Actions):
`ANDROID_KEYSTORE_BASE64` (the `.jks` file, base64-encoded), `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Without them the build is debug-signed
with a throwaway key, so the previous install has to be removed first. Never commit
the keystore; it is the app's identity on Google Play.

Optional: `LILI_TEST_EMAIL` / `LILI_TEST_PASSWORD` for a throwaway lili account
let the API contract test also check the signed-in calls.

## Tests

`cd app && npm ci && npx playwright install chromium && npm run verify:ci`

Runs 12 suites (unit, walkthrough, browser, device, accessibility, security and the
live API contract) and fails unless every suite *ran* and printed at least its expected
number of passing checks. A suite that cannot reach Supabase exits 2, not green.

## Supabase

- Project: `yjsmkjwvoolsszsedony` (eu-north-1). **Shared with another product.** lili owns
  only the `lili_*` tables/functions in `public`, the `lili` schema, and the
  `lili-photos` bucket. Do not change the other product's objects from here.
- A second project, `Lili` (`ovwqbudumasgjpqzvczj`, ap-northeast-1), exists but is
  empty of lili's schema (lili still runs on the project above); see the open decision in
  `docs/claude-notes/claude_10-day-launch-options.md` (§5).

`supabase/migrations/` holds the complete lili history (21 Aug → 8 Oct 2026), file names
matching the versions recorded in the live project. The other product's migrations in the
same project are deliberately not included.

### Migrations added 2026-09-25

1. `20260925023739_lili_advisor_fixes.sql`
   - revoked RPC `EXECUTE` on seven trigger functions (they were callable by `anon`);
   - revoked `anon` on `lili_in_conversation`;
   - dropped the duplicate trigram index on `lili_items`;
   - added 19 covering indexes for foreign keys;
   - rewrote 30 RLS policies to `(select auth.uid())` (per-statement, not per-row).
2. `20260925023904_lili_items_create_after_screening.sql` — **launch blocker.**
   `items_create` required `status='pending'` and `screening='{}'`, but RLS
   `WITH CHECK` runs after BEFORE triggers and `screen_listing` always rewrites both
   columns, so every listing insert failed with 42501. No seller could list.

### Review of 8 Oct 2026

Fixed live in `20261008*_lili_review_1..15_*.sql`; see `docs/review-2026-10-08.md` and
`docs/functional-and-market-review-2026-10-08.md`. Since the first write-up:

- **13 — offers both ways.** Counter-offers never worked (the insert was refused and the
  original stuck as "countered"); a buyer could not accept a seller's counter. Offers now
  record who made them, the other side answers, and `lili_counter_offer` does it in one step.
- **14 — take a listing down** (`lili_withdraw_listing`): a soft removal, marked
  `withdrawn_by_owner`, never a delete; refused while a report about it is open.
- **15 — relisting respects screening.** Relisting a sold piece whose edits put it under
  review now goes to review, not live.
- **16–17 — reviews after a meet.** Two-way and double-blind: only the two people in an
  agreed meet can review it, once, within 14 days; nothing shows until both have reviewed
  or the window closes; the reviewer is never named. Included in the data export.
- **18–19 — saved searches.** Up to 10 each, with a "new since you looked" count and an
  alert when a matching piece goes live (needs the pending SQL to deliver the alert).
- **20 — fit, measurements, flaws** on listings, checked server-side.
- **21 — meets completed** per shop (a public count), shown with the shop's earned trust signals.
- **22–23 — one piece, one buyer.** One accepted offer per item; accepting reserves the piece and
  declines rival offers; either side can release it; take-down releases it.
- **24 — screening details private.** The rules that fired and the score move to a table no client
  can read; listings keep the verdict.
- **25 — abuse and integrity.** Saves and follows rate-limited; AED 200 floor in the database; one
  live meet plan per conversation.
- **26 — photo store listing** limited to the owner's folder.
- **27 — crash reports** (`lili_report_error`, read with `select * from lili.recent_errors`).

`supabase/tests/run.sh` rebuilds the database from these migrations in CI and runs
`functional_test.sql` and `audit_regressions.sql` (26 assertions).

Design audit against Vinted, Depop, Grailed, Vestiaire and Poshmark: shared separately as
a page; its priority matrix drives the next changes.

## Still for a human

- **Run `supabase/pending/20261008_needs_owner_approval.sql`** in the SQL editor.
  It stops account deletion from wiping the other person's conversations
  (foreign keys to `ON DELETE SET NULL`). Until it is run, deleting an account fails
  for anyone who has reported a conversation, and deletes the other side's threads.
  It also allows the `saved_search` notification, so saved-search alerts are delivered.

- **Authentication → Sign In / Providers → Anonymous sign-ins: turn on.** Until then
  every install runs device-only.
- **Authentication → Passwords → Leaked password protection: turn on.**
- `pg_trgm` / `unaccent` live in `public` (advisor WARN). Moving them touches the
  other product and lili's search trigger. Leave as is unless both are migrated together.
