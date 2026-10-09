# lili — architecture

One page on how the system fits together. History and reasoning for individual
decisions live in commit messages and `docs/claude-notes/`; this page describes
what is true now.

## Shape

```
Phone (Android; iOS not yet built)
  └─ Capacitor 7 shell ── WebView ── React 18 SPA (app/src, built by Vite)
                                       │
                                       │  supabase-js, publishable key only
                                       ▼
Supabase project yjsmkjwvoolsszsedony (eu-north-1, SHARED with another product)
  ├─ PostgREST  → lili_* tables (RLS) and lili_* functions (RPC)
  ├─ Realtime   → lili_items, lili_messages changes
  ├─ Auth       → email/password, magic link, Google; anonymous (switched off)
  ├─ Storage    → bucket lili-photos (public read, owner-only write/list)
  └─ pg_cron    → lili-expire-offers (hourly), lili-prune-attempts (daily)
```

There is no application server. Every rule that matters is enforced in
Postgres: row-level security, guard triggers that fix ownership and money
columns, column-level UPDATE grants, and `SECURITY DEFINER` functions for
multi-step actions (each runs in one transaction).

## Client

| Path | Role |
|---|---|
| `src/Marketplace.jsx` | Root state, tab bar, home feed and splash (~1,300 lines) |
| `src/market/` | Shared tokens and atoms (`shared.jsx`), item sheet, offer sheet, filters |
| `src/pages/` | Search, sell, shops, messages, profile, shortlist |
| `src/data/repo.js` | One door to data: server when connected, the device otherwise |
| `src/backend/remote.js` | Every Supabase call; row mapping (`fromRow` / `toRow` allowlist) |
| `src/backend/config.js` | Project URL and publishable key (public by design) |
| `src/discovery/` | Search, filters, ranking (pure, tested) |
| `src/compliance/` | Agreements, moderation UI, legal centre, market gate |
| `src/ux/errorReport.js` | Scrubbed crash reports to `lili_report_error` |

The app works offline-first: writes that cannot reach the server are kept on
the device and marked pending; the live feed is merged into what the phone
holds (`repo.applyLivePatches`), never replacing pending work.

## Data model (main tables)

| Table | Holds | Who can read |
|---|---|---|
| `lili_shops` | A seller's shop | Everyone (active shops) |
| `lili_items` | Listings; `reserved_offer` when an offer is accepted | Everyone (live); owner (all) |
| `lili_item_screening` | Counterfeit-screen details | Nobody (functions only) |
| `lili_offers` | Offers, counters, acceptance (one accepted per item) | The two parties |
| `lili_conversations`, `lili_messages` | Threads | The two parties |
| `lili_meets` | Meet plans (one live per conversation) | The two parties |
| `lili_reviews` | Two-way reviews after a meet | Functions only; public summaries |
| `lili_saved_searches` | Saved searches | Functions only (owner) |
| `lili_moderation_cases`, `lili_case_evidence` | Reports and evidence | Moderators via functions |
| `lili_client_errors` | Crash reports | Nobody (owner via SQL) |

## Build and release

GitHub Actions (`.github/workflows/app.yml`):

1. **test** — `npm audit` (shipped deps), 12 suites with minimum check counts
   (`app/ci-suites.mjs`), bundle budget.
2. **database** — local Supabase rebuilt from `supabase/migrations`, pending
   owner SQL applied, `supabase/tests/run.sh`.
3. **apk** — Android build (release-signed when the keystore secrets exist),
   published as a GitHub Release.

## Known structural risks

See the audit report. In short: the shared Supabase project on the free plan,
no staging environment. (`Marketplace.jsx` was split into `src/market` and
`src/pages`; `undefined-names.mjs` checks every file imports what it uses.)
