# v2.10.0 — everything on the list

Twelve things were asked for in one go. All twelve are here, and three of them
turned out to be different problems than they looked like from the outside.

**1,133 checks · 419 research · 223 security · 199 smoke · 71 walkthrough · 66
device · 55 visual · 30 i18n · 26 image-quality · 23 functional · 17 loading ·
15 a11y screens · 13 integration · 13 keyboard · 13 settings · 6 old-WebView ·
contrast clean · a stranger's walk with nothing blocking her.**

---

## The five false claims this release found

Not one of them was on the list. They were found by the things on the list,
which is the argument for building the things on the list.

**8. The Legal Centre told a buyer the seller "packs and ships it, and handles
the return."** There is no shipping, no label, no carrier and no returns
window. `SHIPPING.live` has been `false` all along; the row was written from
the plan and never checked against it. Found by the claims register on the day
the register was written.

**9. Every listing detail rendered a tick and the word VERIFIED.**
Unconditionally, no argument, no condition. Nothing in this app verifies
anything — the listing flow's own authentication step says so in as many words,
two screens away. In a resale marketplace this is the most expensive lie
available: it is the exact thing a buyer is afraid of being wrong about, and a
woman paying AED 12,900 for a bag because a badge said VERIFIED has been told
something lili has no basis for.

**10. The profile screen was somebody else.** Every install showed the name
"Aisha Al Mansoori", the handle @aishaalmanoori, a VERIFIED badge, 156
followers, 78 following and a green "online" dot — to the person whose account
it was. All invented.

**11. A green presence dot on sellers.** A hard-coded boolean on six demo
shops, so half of them were permanently "online" and every real seller — who
has no such column — was permanently "Offline". Nothing measures presence. A
buyer waits differently for a reply from someone she has been told is there
right now.

**12. "Ask about these" did not reach the seller.** The messages *screen* was
rewired to real database threads in v2.8. The entry point every "Message
seller" button goes through was not, so a conversation started from a listing
still lived in React state and the seller was never told anybody had written to
her. The exchange looked identical either way, which is why it survived two
releases.

---

## The twelve

### 1 & 3 — the claims register, and a guard

`src/compliance/claims.js` lists every promise the app makes to a buyer or a
seller, and names the file and symbol that makes it true. `npm run research`
opens every one of those files and fails the build if the enforcement has gone
— so deleting the code behind a promise breaks the build instead of quietly
turning the promise into a lie.

Writing it found **four entries whose enforcement I had named from memory and
named wrongly**, which is the whole argument for the check.

The other half is `NEVER_CLAIM`: nine sentence patterns that must not appear
anywhere, in either language, while the thing behind them does not exist. It
runs over every source file and every dictionary string. Proved by injecting a
violation and watching it fail.

Seven escrow claims were found by accident across three releases. Finding the
eighth by accident is not a plan.

### 2 — messages that actually reach her

The client is cut over to the real thing, and **three problems in the backend
turned up on the way**:

- **Live delivery did not exist.** `watchMessages` subscribes to
  `postgres_changes` on `lili_messages`, and a subscription reports SUBSCRIBED
  whether or not the table is in the realtime publication. The publication was
  **empty**. Every thread in the app was subscribed to a channel that would
  never deliver anything, and nothing on either side could tell.
- **A participant could edit the other woman's messages.** `authenticated` held
  UPDATE on every column including `body`, and the immutability trigger
  silently *restored* the old value instead of refusing — so the write reported
  success. A reporter can freeze a transcript as evidence, which makes editable
  messages tamperable evidence. Column-level GRANTs now refuse it.
- **A participant could reassign a thread.** UPDATE on
  `lili_conversations.seller_uid` and `last_message` meant a buyer could point
  an existing thread at an uninvolved woman and write the preview text she sees
  in her inbox. No client code updates that table at all.

Also: the thread list read `last_body`, a column that does not exist — the
trigger writes `last_message` — so every preview in the list was an empty
string. And two leftover probe tables with RLS disabled were dropped.

`npm run preflight` now checks live delivery on every run, through a small
`lili_realtime_tables()` function, because the client cannot read
`pg_publication_rel` and this is exactly the class of thing that fails silently
for months.

### 4 — the translator's file

`npm run i18n:export` writes `i18n/to-translate.csv`: every string a person
reads, ordered by **what a comprehension failure costs** — reporting harassment
first, moderator screens last. `npm run i18n:import` reads it back, and refuses
English pasted into the Arabic column, a row whose English was edited, and a
key that needs its English and does not have it.

The first version wrote two files, one for the translator and one for a
developer, and hers came back with **zero rows in it**. That is the finding:
all 139 dictionary entries were seeded from labels that were already bilingual,
so the bottleneck was never translation — it is that 775 strings have never
been moved into the dictionary at all. Two files made her wait for a developer
for no reason. One file with a `status` column lets both halves proceed at
once: she translates a string that is not wired yet, the importer files it
under the key it will have, and the Arabic is already there when somebody moves
the literal.

### 5 — the stranger

`npm run stranger` walks from a cold open to a listing reading only what is on
the screen, tapping the most obvious thing, never using a selector that depends
on knowing the code. It reports dead ends, silent refusals, unexplained
requirements, and anything the claims register forbids.

What it found:

- **The shop screen never said what selling costs or how she gets paid.** Both
  were in the agreement sheet on the *next* screen — after choosing a seller
  type and typing a name. It now says both up front, read from the fee schedule
  and `HOW_MONEY_WORKS` so it cannot drift: *"You receive AED 910 — after
  lili's 9% fee of AED 90."*
- **A silent refusal on the shop button.** It was an *enabled* button whose
  onClick was guarded by the same condition that greyed it. With a seller type
  chosen and the name empty it read "Continue", took the tap, and did nothing —
  no movement, no message. Now genuinely disabled, and the label says which
  piece is missing.
- **The year-of-birth field had no label.** The heading above it was a plain
  div, so a screen reader announced "1996" — the placeholder — and nothing
  else. The first thing this app asks anybody for.

Its own summary line was made honest too: it said "she got from a cold open to
a published listing" when she had reached the agreement sheet. It now reports
how far she actually got, separately from what stopped her.

### 6 — the first ten

`FIRST-TEN.md`. Not a marketing plan: ten specific jobs, because nothing here
works with one person in it. **Four sellers, three buyers, two who are both,
and one told explicitly to break it.** With the gaps to watch in the roster —
invited → redeemed → opened a shop → actually listed — and what each gap means.

### 7 — the bundle

**287 kB → 243 kB** on the main chunk; **428 kB → 380 kB** on first paint.

The cause was one line. `compliance/index.js` re-exported five *components*,
and Marketplace imports `useCompliance` from it — so importing one hook made
LegalCenter, ReportDialog, ModerationQueue and the rest statically reachable,
and **every `lazy()` boundary around them was decorative**. The barrel exports
rules now; screens are imported from their own files.

Also out of the first paint: `moderation.js` (16 kB of moderator machinery in
every shopper's bundle, via one import in `repo.js`), and `resaleValue.js` (23
kB, held in by a single **unused** `screenListing` import).

`npm run audit` now enforces a first-paint budget and both specific
regressions.

One walkthrough check had to be fixed: it opened the Legal Centre and asserted
on the same tick, which worked only because the screen was never really lazy.

### 8 — the Android floor

**Renders correctly from Chrome 88 → Chrome 61.** Android 9, 10 and 11 go from
"runs, some layout breaks" to full.

- `aspect-ratio` and the `inset` shorthand replaced with fallbacks that work
  everywhere; on the listing screen the missing height meant the "add a photo"
  target *disappeared* on an old WebView.
- `Promise.allSettled` written out by hand in `remote.js`.
- The scanner was **reading the wrong file**. It looked for polyfill source
  inside `index.html`; the polyfills have lived in their own file since the CSP
  was tightened, so it never matched and reported three high-severity runtime
  errors that had been fixed all along. It follows the `<script src>` now,
  which also means deleting the polyfill file raises the reported floor instead
  of going unnoticed.
- The polyfill file gained `Object.values`, `Array.prototype.flat` and
  `String.prototype.matchAll` — needed because **Vite's own module-preload
  helper** uses `Promise.allSettled` and `globalThis` on every dynamic import.
  Without them every lazy boundary threw on an un-updated Android 9 WebView:
  the app would start, look right, and break the first time anybody tapped
  anything.

`minSdkVersion` stays at 23, and the report explains why rather than leaving it
unexamined: below the floor the page renders a bilingual note telling her to
update Android System WebView, which she then can. Calling that a white screen
overstated the problem by about as much as the polyfill bug understated it.

### 9 — iOS

`IOS.md`, and four fixes to a project nobody has ever compiled:

- `UIRequiredDeviceCapabilities` said **`armv7`** — the 32-bit instruction set,
  which no supported iOS runs. It asked the App Store for devices that do not
  exist.
- **Landscape was declared supported.** It is not; there is no landscape
  layout. Portrait only now.
- **Arabic was not declared.** An Arabic-first phone was never offered the
  language switch the app has had since v2.9.3.
- **Export compliance** answered once in the plist instead of by hand on every
  upload.

Deliberately *not* set: `limitsNavigationsToAppBoundDomains`. Turning on a
security setting nobody can test is how you ship an app that cannot reach its
own database.

The honest status line: **it has never been run on an iPhone.**

### 10, 11, 12 — the three I argued against, built as seams

I said these were premature, and they were — as *screens*. Every false claim
this project has removed was born the same way: somebody built the screen for a
system before the system. So they are built in the opposite order. The
integration surface is defined, every method refuses with a reason a person can
act on, a half-implemented adapter is rejected rather than registered, and a
research check asserts **no screen imports any of them**.

- **`src/payments/processor.js`** — the interface a licensed processor must
  implement, and eight things that have to be true before `COLLECTION_LIVE` may
  be flipped. `npm run payments` prints them. `preflight` treats *flag on with
  no processor* as a blocker, because on that day every screen switches to
  escrow wording with nothing behind it.
- **`src/trust/authentication.js`** — the workflow, and the rule that a verdict
  must name who decided it, when, and on what basis. "Inconclusive" is a
  first-class outcome, because it is the honest common case and the one a
  system under commercial pressure quietly stops reporting.
- **`src/notifications/push.js`** — `requestPermission()` **refuses** while
  there is nothing to send. An OS permission prompt is a promise: ask, get
  Allow, send nothing, and she stops opening the app. The token table exists
  with owner-only policies, and both `lili_erase_me()` and `lili_export_me()`
  were updated to cover it — a new table not named in erasure is a table that
  survives "delete my account", which is exactly the v2.9 bug.

---

## Still open

**Anonymous sign-in is still switched off.** Still the one blocker `npm run
preflight` reports, still the only thing that makes every install a
single-player game, and still thirty seconds in the Supabase dashboard that
only you can do. Everything in this release is downstream of it.

775 strings are English-only; the file for a translator is written and waiting.
Payments, authentication, push, shipping and iOS are unbuilt, and now each has
a seam that refuses rather than a screen that pretends.
