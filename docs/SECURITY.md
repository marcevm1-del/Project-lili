# lili — security

## Trust boundaries

- **The phone is untrusted.** It holds only the publishable key. Anything it
  sends is re-checked by Postgres: RLS for reads and writes, guard triggers for
  ownership, money and timing columns, column-level UPDATE grants, and
  definer functions for multi-step actions.
- **Definer functions** (`SECURITY DEFINER`, `search_path` pinned) take the
  caller from `auth.uid()`, never from arguments. Client-role detection inside
  them uses `current_setting('role')`, because `current_user` is the owner.
- **Moderators** are identified by a JWT `app_metadata.moderator` claim, set
  only by the project owner.

## What is public, on purpose

Live listings and active shops (minus private fields), shop reputation and
reviews (never the reviewer), completed-meet counts, search. Screening
details, owner-only data, reviews tables, saved searches, crash reports,
moderation cases and evidence are not readable by any client.

## Abuse controls

Rate limits (`lili_rate_ok`, per user, epoch-anchored windows): listings,
conversations, messages, offers, reports, reviews, saved searches, saves,
follows, crash reports. Invite-only creation of shops, listings and
conversations. AED 200 price floor and counterfeit screening in the database.

## Secrets

- In the app: the publishable key only (`app/src/backend/config.js`).
- Never in the repository: keystores (`*.jks`, `keystore.properties`),
  service-role keys, `.env` files — all git-ignored.
- In GitHub secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, optional `LILI_TEST_EMAIL` /
  `LILI_TEST_PASSWORD` for a throwaway test account.

## Checks that run on every push

- `npm audit --omit=dev --audit-level=high` (shipped dependencies).
- `security.test.mjs` and `api-contract.test.mjs` against the live API with the
  publishable key: what a signed-out caller can and cannot read or call.
- Database regression tests on a database rebuilt from the migrations.

## Open items (from the audit)

Shared project and free plan; debug-signed builds until the keystore secrets
exist; OAuth implicit flow and an unowned redirect domain; sessions in WebView
localStorage. Each is described, with its fix, in the audit report.

## Reporting a problem

Email the owner (see the Play Store listing). Do not open a public issue for a
vulnerability.
