# Project-lili

lili is a curated resale marketplace for the UAE (Capacitor app + Supabase backend).

## What is in this repository

| Path | Contents |
|---|---|
| `docs/claude-notes/` | Release notes, launch runbook, legal/security reviews (v2.8 → v2.11.7) |
| `supabase/migrations/` | Every lili database migration (72), exported from the live project's history |
| `supabase/pending/` | Fixes written but not yet applied — need the owner to run them |
| `docs/review-2026-10-08.md` | Full review of the live database code and what was fixed |
| `docs/functional-and-market-review-2026-10-08.md` | End-to-end test results and comparison with similar apps |
| `supabase/tests/functional_test.sql` | Re-runnable end-to-end test (rolls itself back) |

The app source tree (`src/`, `web/`, npm scripts) is not in this repository yet.

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

Fifteen bugs fixed live (`20261008*_lili_review_*.sql`); see `docs/review-2026-10-08.md`.

## Still for a human

- **Run `supabase/pending/20261008_needs_owner_approval.sql`** in the SQL editor.
  It stops account deletion from wiping the other person's conversations, and adds
  "take a listing down" for sellers.

- **Authentication → Sign In / Providers → Anonymous sign-ins: turn on.** Until then
  every install runs device-only.
- **Authentication → Passwords → Leaked password protection: turn on.**
- `pg_trgm` / `unaccent` live in `public` (advisor WARN). Moving them touches the
  other product and lili's search trigger. Leave as is unless both are migrated together.
