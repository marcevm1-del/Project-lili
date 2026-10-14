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
updates. Without them, CI reuses one debug key kept in the Actions cache, so
builds still install as updates; each release says at the top whether it
does. If the cache is ever evicted (unused for 7 days) the key changes once,
and that release will say to uninstall first. Profile shows the installed
build at the bottom ("Version 2.11.7 · build N"): if it doesn't match the
release you installed, the install was refused.

## Owner-only actions still pending

- Run `supabase/pending/20261008_needs_owner_approval.sql` (SQL editor, one
  paste): erasure keeps the other person's threads; saved-search alerts are
  delivered; retention jobs; erasure works outside the shared project; one read policy on follows. The retention periods the policies promise only hold once this has run.
- Move lili to its own Pro project with point-in-time recovery.
- Switch on paying in the app (Stripe holds the money until delivery), in this order:
  1. Create a Stripe account for the company, with Connect (Express accounts, UAE).
  2. Supabase → Edge Functions → Secrets: `STRIPE_SECRET_KEY` and, after step 3,
     `STRIPE_WEBHOOK_SECRET`. Until they are set the function answers
     `payments_not_configured`.
  3. Stripe → Developers → Webhooks: two endpoints, both to
     `https://yjsmkjwvoolsszsedony.supabase.co/functions/v1/lili-payments`: one for
     "Your account" with `checkout.session.completed`, one for "Connected accounts" with
     `account.updated`. Put both signing secrets in `STRIPE_WEBHOOK_SECRET`, comma-separated.
  4. Confirm each courier fee with the courier, then
     `update lili_delivery_rates set fee = …, confirmed = true where …`.
  5. Rewrite the Terms, Payments, Delivery and Privacy policies for held payment (Stripe as
     a processor, delivery addresses kept with the order and cut back to the country 120 days
     after it ends, migration 36; order reviews) and set `COLLECTION_LIVE = true`
     in `app/src/data/fees.js`; the research suite refuses the build until both agree.
     Ship that build.
  6. `update lili_settings set value = jsonb_set(value, '{enabled}', 'true') where key = 'payments';`
     Setting it back to false closes checkout again without a release.
- Add the keystore secrets.
- Policies: fill in `OPERATOR` in `app/src/legal/facts.js` (legal entity, licence,
  address, privacy and brand-owner inboxes), have UAE counsel review
  `docs/policies/`, commission the Arabic text, then set `LEGALLY_REVIEWED = true`
  and run `node app/policies-build.mjs`. Host `app/web/` on the owned domain and
  give the stores `policies/privacy.html` and `delete-account.html`.
