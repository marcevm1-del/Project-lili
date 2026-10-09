# v2.10.0 — all twelve options

Full note ships in the repo as `UPGRADE-v2.10.0.md`. Companions:
`claude/v2.9.4-the-cart.md`, `claude/v2.9-discovery-and-honesty.md`.

**1,133 checks green** · 419 research · 223 security · 199 smoke · 71
walkthrough · 66 device · 55 visual · 30 i18n · 26 image-quality · 23 functional
· 17 loading · 15 a11y screens · 13 integration · 13 keyboard · 13 settings · 6
old-WebView.

## Five more false claims, none of them on the list

Found by the things that were on the list, which is the argument for them.

8. **The Legal Centre said the seller "packs and ships it, and handles the
   return."** There is no shipping, label, carrier or returns window.
   `SHIPPING.live` has been false all along. Found by the claims register on the
   day it was written.
9. **Every listing rendered a tick and the word VERIFIED.** Unconditionally.
   Nothing authenticates anything — the listing flow says so two screens away.
10. **The profile screen was somebody else** — "Aisha Al Mansoori", a VERIFIED
    badge, 156 followers, an online dot, shown to the account's own owner.
11. **A green "online" dot on sellers**, from a hard-coded boolean on six demo
    shops. Nothing measures presence.
12. **"Ask about these" never reached the seller.** The messages screen was
    rewired to real threads in v2.8; the entry point every message button goes
    through was not.

## What was built

- **Claims register** (`src/compliance/claims.js`) — every promise, the file and
  symbol that enforces it, and nine sentence patterns that must never appear.
  The build fails if enforcement disappears. Writing it found four entries whose
  enforcement had been named from memory and named wrongly.
- **Real messaging.** Three backend problems on the way: the realtime
  publication was **empty** (every thread subscribed to a channel that would
  never deliver); a participant could **edit the other woman's messages** (and
  transcripts are evidence in reports); a participant could **reassign a
  thread** to an uninvolved woman. All three fixed with column GRANTs and
  policy changes. Two RLS-disabled probe tables dropped.
- **Translator's file** — `npm run i18n:export` / `i18n:import`, ordered by what
  a comprehension failure costs. The first version came back with zero rows,
  which is the finding: the bottleneck is extraction, not translation.
- **`npm run stranger`** — walks the app reading only what is on screen. Found a
  shop screen that never said what selling costs, a button that took a tap and
  did nothing, and an unlabelled year-of-birth field.
- **`FIRST-TEN.md`** — four sellers, three buyers, two both, one told to break
  it, and the roster gaps to watch.
- **Bundle:** 287 kB → 243 kB. One barrel file re-exported five components, so
  every `lazy()` boundary in the app was decorative.
- **Android floor:** renders from Chrome 88 → 61. The compat scanner had been
  reading the wrong file and reporting three errors that were already fixed.
- **iOS:** `armv7` (32-bit, no supported device), landscape wrongly declared,
  Arabic undeclared, export compliance unanswered — all fixed. Still never
  compiled; see `IOS.md`.
- **Payments, authentication and push** built as **seams, not screens**: every
  method refuses with an actionable reason, half-implemented adapters are
  rejected, and a test asserts no screen imports any of them. Push tokens were
  added to `lili_erase_me()` and `lili_export_me()` — a new table not named in
  erasure is a table that survives "delete my account".

## Still open

**Anonymous sign-in is still switched off on the Supabase project.** Thirty
seconds in the dashboard, only the founder can do it, and everything in this
release is downstream of it. Until then every install is a single-player game.

775 English-only strings await a translator. Payments, authentication, push,
shipping and iOS remain unbuilt — each now with a seam that refuses rather than
a screen that pretends.
