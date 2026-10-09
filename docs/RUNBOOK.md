# lili — runbook

What to do when something is wrong. Every step names where to click or what to
run. Keep this short and keep it true; if a step stops working, fix the step.

## The app shows only demo pieces / "device-only" everywhere

1. Open Supabase → project `yjsmkjwvoolsszsedony`. If it says **Paused**, press
   **Restore**. (Free-plan projects pause after a week idle. Moving to Pro
   removes this.)
2. Check **Authentication → Sign In / Providers → Anonymous sign-ins**. If it is
   off, browsing works but nothing personal reaches the server.
3. Check the app's config: `app/src/backend/config.js` must hold this project's
   URL and publishable key.

## Crashes are reported

Supabase → SQL editor:

```sql
select * from lili.recent_errors;      -- last 7 days, grouped, newest first
```

Each row has the message, app version, platform, how many times and how many
people. Reports are scrubbed of emails, query strings and long numbers.

## A database change went wrong

- There are no automatic backups on the free plan. **Before any risky change,
  take one**: Database → Backups (Pro), or `supabase db dump` locally.
- Every change is a file in `supabase/migrations`. To undo, write a new
  migration that reverses it; do not edit or delete history.
- CI's `database` job rebuilds the database from the migrations and runs the
  tests; if it is red, do not apply the change to production.

## CI is red

- **test**: open the job log; `ci-suites.mjs` prints which suite failed and its
  last 40 lines. "No summary printed" means a suite did not run at all.
- **contract test exits 2**: Supabase was unreachable (project paused?).
- **database**: `supabase/tests/run.sh` prints the full result line and each
  expectation that did not hold.
- **npm audit**: a shipped dependency has a high or critical advisory; update it.

## Releasing

Push to the branch; CI builds and publishes a GitHub Release with `lili.apk`.
With the four keystore secrets set, builds are release-signed and install as
updates. Without them, uninstall the previous build first.

## Owner-only actions still pending

- Run `supabase/pending/20261008_needs_owner_approval.sql` (SQL editor, one
  paste): erasure keeps the other person's threads; saved-search alerts are
  delivered; retention jobs; erasure works outside the shared project; one read policy on follows.
- Move lili to its own Pro project with point-in-time recovery.
- Add the keystore secrets.
