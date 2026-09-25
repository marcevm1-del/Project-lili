# Project-lili

lili is a curated resale marketplace for the UAE (Capacitor app + Supabase backend).

## What is in this repository

| Path | Contents |
|---|---|
| `docs/claude-notes/` | Release notes, launch runbook, legal/security reviews (v2.8 → v2.11.7) |
| `supabase/migrations/` | Database migrations for lili, applied to the live project |

The app source tree (`src/`, `web/`, npm scripts) is not in this repository yet.

## Supabase

- Project: `yjsmkjwvoolsszsedony` (eu-north-1). **Shared with another product.** lili owns
  only the `lili_*` tables/functions in `public`, the `lili` schema, and the
  `lili-photos` bucket. Do not change the other product's objects from here.
- A second project, `Lili` (`ovwqbudumasgjpqzvczj`, ap-northeast-1), exists and is
  **paused**. It is empty of lili's schema; see the open decision in
  `docs/claude-notes/claude_10-day-launch-options.md` (§5).

Earlier migrations (Aug–Sep 2026) exist only in the project's migration history.
To bring them into this repo: `supabase link --project-ref yjsmkjwvoolsszsedony && supabase db pull`.

### Migrations added 2026-09-25

1. `20260925030000_lili_advisor_fixes.sql`
   - revoked RPC `EXECUTE` on seven trigger functions (they were callable by `anon`);
   - revoked `anon` on `lili_in_conversation`;
   - dropped the duplicate trigram index on `lili_items`;
   - added 19 covering indexes for foreign keys;
   - rewrote 30 RLS policies to `(select auth.uid())` (per-statement, not per-row).
2. `20260925031000_lili_items_create_after_screening.sql` — **launch blocker.**
   `items_create` required `status='pending'` and `screening='{}'`, but RLS
   `WITH CHECK` runs after BEFORE triggers and `screen_listing` always rewrites both
   columns, so every listing insert failed with 42501. No seller could list.

## Still for a human (dashboard only)

- **Authentication → Sign In / Providers → Anonymous sign-ins: turn on.** Until then
  every install runs device-only.
- **Authentication → Passwords → Leaked password protection: turn on.**
- `pg_trgm` / `unaccent` live in `public` (advisor WARN). Moving them touches the
  other product and lili's search trigger. Leave as is unless both are migrated together.
