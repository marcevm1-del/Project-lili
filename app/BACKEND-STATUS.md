# Backend — live, with two switches left to flip

The database is **built, deployed and tested** in your Supabase project. Two
settings remain, and both are dashboard toggles I have no API access to. They
take about a minute.

## One toggle left

**Enable anonymous sign-in**
Dashboard → Authentication → **Sign In / Providers** → *Anonymous sign-ins* → enable.

That is the only step. The schema toggle is gone: the tables were moved into
`public` with `lili_` prefixes, so the API serves them with no configuration and
they still cannot collide with the other app already there.

Until you flip it, the app runs entirely on-device and works exactly as it does
today. `initBackend()` checks whether it can actually obtain a session and stays
local if it cannot — a backend whose every write would fail is not a mode worth
entering. Flip the toggle and the next launch is multi-user.

Then: `node backend.test.mjs` — 14 checks against the live database.

---

## Two decisions I made for you, and why

**It is NOT in the UAE.** Supabase has no Gulf region — the options are US,
Canada, South America, Europe, and Asia-Pacific. There is no Dubai, no Bahrain,
no Middle East. Your existing project is in **eu-north-1 (Stockholm)**.

That is defensible: UAE PDPL permits transfer to jurisdictions with adequate
protection, and the EU is the strongest such case. If you want lower latency,
**ap-south-1 (Mumbai)** is ~1,900 km from Dubai versus Stockholm's ~4,800 km —
roughly 40 ms against 120 ms. But India's regime is a weaker adequacy argument
than the EU's.

**Region cannot be changed after a project is created.** If you want Mumbai,
say so and I will create a fresh project and re-run the migrations before there
is any real data to move.

**It is NOT in the `public` schema.** Your project already runs another
application — journal entries, forum threads, climate snapshots, 2 real user
profiles. Its `public` schema already owns tables called `follows`, `reports`,
`blocks` and `notifications`: exactly four of the names lili needs.

Putting lili in `public` would have collided with a live app. It lives in its
own `lili` schema instead, which is why step 1 above exists.

---

## What is deployed

**9 tables**: shops, items, profiles, follows, saves, carts, blocks,
moderation_cases, audit — all with row-level security.

**The screening gate is now in the database.** Earlier in this project the
counterfeit check was wired into one of two publishing paths, and the faster
path published anything. That class of bug is now impossible: a client cannot
create a listing with `status = 'live'` at all. Every listing arrives `pending`,
a trigger screens it, and the database decides. Verified live:

| Listing | Verdict |
|---|---|
| "Chanel replica mirror quality" | **removed** — prohibited |
| "Vintage Ivory Bangle" | **removed** — prohibited |
| "Chanel Classic Flap", AED 900, no receipt | **in_review** — below brand floor |
| "Silk Midi Dress", AED 850 | **live** |

Re-screening also runs on edit, so a listing cannot be published clean and then
rewritten into a counterfeit advert.

**Columns the server owns.** RLS controls which *rows* you may touch, not which
*columns* — so a trigger reverts `followers`, `strikes`, `status` and
`owner_uid` on any client write. A seller cannot award herself 50,000 followers
or clear her own strikes.

**Follower counts are maintained by the database**, from real rows, not from
whatever a client last claimed.

**The audit trail has RLS on and no policies at all** — that denies everyone,
including a moderator's session. Only the service role can append. A trail a
moderator can edit is not a trail.

**The moderation queue is unreadable and undecidable from any key that ships in
this app.** `listCases()` and `decideCase()` throw by design.

## Security linter

Clean for `lili`, after I pinned a mutable `search_path` it flagged on one
trigger function. The remaining warnings all belong to your **other** app —
seven `SECURITY DEFINER` functions in `public` callable by any signed-in user
(`admin_resolve_report`, `admin_suspend_user`, `admin_user_diagnostics` and
others). I have not touched them, but if that app is live you should look at
them: on the face of it, any signed-in user can call `admin_suspend_user`.

## Still not built

Payments. That waits on the trade licence and a CBUAE-licensed processor.
Nothing here shortens that path.
