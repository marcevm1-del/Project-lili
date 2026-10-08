# lili v2.9 — discovery, and four promises the app could not keep

This pass started as a research-and-improve round on the surfaces nobody had
looked at yet: search, ranking, the feed, and the empty-catalogue case you will
actually launch into. It found those, and it found something larger on the way.

**The largest finding is not a discovery bug.** Four buyer-facing surfaces told
a woman that lili holds her money and will refund her. It does not, and cannot:
there is no processor, no escrow, no trade licence and no shipping. That is
fixed, and it is the first section below because it is the one that mattered
most.

Everything here is verifiable: **257 research checks, 222 security checks, 198
smoke, 71 walkthrough, 66 device, 55 visual, 21 functional, 17 loading, 15 a11y
screens, 13 integration, 13 keyboard, 13 settings, 6 old-WebView, contrast
clean.** The audit's two failures are the missing APK artifacts and multi-user,
unchanged from baseline.

---

## 1. What the app promises about money

Found by grepping for one phrase. Four places said lili holds the payment:

| Where | What it said |
|---|---|
| The acknowledgement she taps to sign up | "we hold the payment until it arrives and step in if it goes wrong" |
| Help Centre, first answer | the same |
| Legal Centre → How lili works | "we … hold the payment until the item lands … and can hold or reverse the payment" |
| Help Centre, on a fake | "You get your money back" |

Meanwhile `MeetSafely.jsx` told her, correctly: *"lili does not hold your money,
so the moment to be sure is before it leaves your hand."* And `fees.js` has said
`COLLECTION_LIVE = false` since v2.8.

A woman who read the first four and then met a stranger in a mall car park with
cash believed there was a refund behind her. There was not.

**The fix is one source of truth.** `compliance/sellerRules.js` now exports
`HOW_MONEY_WORKS`, branched on `PAYMENTS_LIVE` (which reads `COLLECTION_LIVE`).
Every surface reads it. They cannot drift apart again, because there is only one
of them, and the day a processor goes live the flag flips and all four change
together.

Three more claims went the same way:

- **The splash screen** — the first screen in the product — showed "Authentic &
  Verified", "Secure Payments", "Fast Delivery". None is true. Replaced with
  three that are each enforced somewhere in the codebase: every listing is
  screened (`lili.screen_listing`), Dubai only (`markets.js`), and every listing
  states whether she is a private or business seller (`intermediary.js`).
- **"Authenticated"** in the Help Centre said high-value brands "have to be
  authenticated before it can be listed at all". Nobody authenticates anything;
  two of the three tiers in the sell flow are already marked "not yet available".
  It now says what the badge means: the seller has declared she holds proof.
- **"lili takes 10%"** in the Help Centre — the third stale fee statement this
  project has found. Now the 6–10% tiered schedule, with the note that nothing is
  being collected yet.

---

## 2. Search: the RPC that existed and had no callers

`lili_search` — bilingual, unaccented, typo-tolerant, returning per-result
provenance — has been in the database since v2.8. **Nothing in the app called
it.** `repo.searchItems` wrapped it and had zero call sites.

Instead there were four separate `String.includes` filters:

| Surface | Fields searched |
|---|---|
| Search tab | title, brand, category, shop name |
| Home feed bar | title, brand |
| Shop page | title |
| Sellers page | shop name |

None searched `titleAr`. So **a woman typing عباية got nothing** — from an app
whose sell flow tells sellers, in as many words, that without an Arabic title
"a piece is invisible to every woman searching in Arabic". "Hermes" never found
"Hermès". "chanel bag" matched nothing anywhere, because substring matching
needs the words adjacent and in that order. And `q.length > 1` meant a
one-character query silently showed the browse landing.

**Now:** the RPC is wired in, and `discovery/text.js` + `discovery/search.js`
apply the same three rules on the device so an offline search is narrower but
never means something different.

- **Folding.** Latin accents via NFD; Arabic tashkeel, tatweel, the alef family
  (آ أ إ ٱ → ا), ta-marbuta, hamza carriers, Arabic-Indic digits. Grounded in
  Hammo et al. (Springer, *Information Retrieval* 2008), who report that
  diacritised queries return *zero* matches for many terms and that folding the
  alef-hamza variants alone collapses an Arabic index by ~22.6% — the measure of
  how many spellings of one word were being kept apart.
- **Tokens, not substrings.** Every query word must land somewhere. "chanel bag"
  finds the Chanel bag; "chanel heels" finds nothing, which is correct.
- **The garment vocabulary**, mirrored from `lili_search_terms` and *hydrated
  from the server* on launch so the mirror cannot drift.
- **Tolerance earned by length** — none under four characters, so "bag" never
  matches "bar".
- **Provenance shown.** Results say when they matched through Arabic or a near
  spelling. The server has returned this on every row since v2.8; nothing
  displayed it.

**Zero results are no longer a dead end.** Baymard's 2026 benchmark (170+ sites,
10,000+ ratings) puts 56% of commerce search at "mediocre or worse" and app
search worst at 64% — mostly on exactly this. The empty state now names the word
that killed the search ("Nothing is *beige*. There are 4 pieces for *chanel
bag*") and offers alternatives drawn from live stock. The "Trending" chips, four
of whose seven values matched nothing in the catalogue, are now generated from
what is actually there.

---

## 3. Ranking: nothing in the app was sorted

Not the feed, not a category, not a shop page, not search. Items arrived in array
order.

The filter sheet meanwhile offered **Sort By** with four options, selected-state
styling and a checkmark. `filters.sort` was written and never read. **Size** and
**Colour** were the same. Three of seven controls in that sheet did nothing.

- **Sort works.** Newest, price ascending, price descending, and Most Saved.
- **Most Saved is real.** `lili_saves` is row-level-secured to the person who
  saved, correctly — so a count cannot be assembled in the browser. A `saves`
  column, maintained by trigger and revoked from client UPDATE, now carries the
  total. Offline the option is hidden rather than shown sorting by zero.
- **Size works**, and only offers sizes something in stock actually is.
- **Colour was removed, not fixed.** It filtered on `item.color`; the sell flow
  never asks for one, and published every listing with the same hardcoded pink.
  On a real catalogue the control returned an empty grid, silently. It comes
  back if and when the sell flow asks.
- **One predicate.** The feed and the sheet's "Show N Results" counter had two
  different filter expressions that disagreed. There is one now.

---

## 4. "For You" was a label over an unsorted global feed

Three things pointed at a personalisation feature that did not exist:

1. The splash asks "What's your style?", stores the answer in `picked`, and calls
   `onDone()` — which takes no arguments. The button says **"Show My Feed"** and
   discarded the answer on the next line.
2. The home header read **"For You · لكِ / Curated to your style"** over the same
   global array every user saw.
3. The consent sheet asked permission for personalisation — *"Uses what you save
   and search so your feed looks like your taste"* — that no code path consumed.

In an app that deletes invented review counts on principle.

The feature exists now. It reorders — it never hides, because she picked "Bags"
in her first ten seconds and a catalogue this size cannot afford to remove two
thirds of itself over a tap. It runs only with consent. It is editable from the
feed it affects. And when it is off or she never picked, the header says
`Everything · كل القطع` and the piece count, which is what is true.

---

## 5. New In was empty the day you went live

`isNew` was a client-set boolean, `true` on every publish, never cleared — so a
piece listed in March was "Just arrived" in August. And it is not a column in
`lili_items` and was not rebuilt in `fromRow`, so **the moment the backend went
live every item came back with `isNew === undefined`** and the strip rendered its
heading, its "See all" link and an empty row. For every user. On the home screen.

Derived from `created_at` now, which the database writes and a seller cannot (see
§8). Fourteen days. The strip renders nothing rather than a heading over nothing,
and the NEW badge on a tile uses the same derivation, so the two cannot disagree.

Three more inventions left the publish path: the hardcoded pink `color`, the
`icon:"dress"` that drew a dress on a Bottega pouch, and — more seriously — the
seller's provenance answer, which reached the on-screen check and was **never
sent**, so the server re-screened her listing as if she had no receipt and could
flag her price as a counterfeit signal after telling her it was fine.

---

## 6. Empty states, for the catalogue you are actually launching with

You are opening with a handful of sellers. Five surfaces rendered blank:

- **New In** — heading over an empty row (guaranteed, see §5)
- **Shop page** — a bare grid; a shop with nothing listed looked identical to a
  search that missed
- **Sellers page** — a blank page under the search bar
- **Stories** — five hardcoded stories pointing at seed shop ids, labelled "Shop"
  when the shop did not exist
- **Categories** — twelve tiles, four of which (Lifestyle, Pants, More, Skirts)
  are not values a seller can choose, so they were guaranteed dead ends

And the home feed rendered **six loading skeletons and "Nothing found"
simultaneously** on every cold start, and could not tell an empty catalogue from
filters set too tight.

All fixed. Category tiles carry their count. The feed distinguishes the three
cases and offers the exit each one has.

---

## 7. The sell flow

- **"Next" never validated.** A seller could walk from photos to the last screen
  with no photograph, no title and no price, and the only thing that told her was
  a publish button that quietly did nothing. It now says what is missing at the
  moment it is missing, and the publish screen lists what still stands in the way
  with a tap that takes her to the field. Only the photograph holds her for a
  single tap — it is the largest determinant of whether a piece sells — and
  everything else warns and lets her past in the same tap.
- **No draft persistence.** The tab bar unmounts the sell screen without asking,
  so one tap on Home destroyed the title, the description, the price and the
  processed photographs. Kept on her device now, offered back when she returns,
  expiring after a fortnight. It never leaves the phone: it is not a listing
  until she publishes it.
- **The invite dead end.** "Have a code? *Close the app and reopen it* — the
  invitation is entered on the first screen." A woman holding a valid invitation
  was told to force-quit the only place she could use it. There is a box now.
- **"Skip authentication"** called the same `submit` as the button above it, so
  a seller who ticked "I have the receipt" and then tapped Skip still published
  claiming provenance. It clears the claim.
- **Three Follow buttons with no `onClick`** — on the sellers page and the shop
  page — are wired.

---

## 8. Server-owned columns

`SERVER_OWNED` in `remote.js` strips a list of fields before every write, and
until this release **that list was the only thing standing between a seller and
her own `previous_price`.** It is JavaScript on a handset; anyone holding the
publishable key can post straight to PostgREST without it.

Checking what `authenticated` could actually update on `lili_items`:

| Column | What a seller could have done |
|---|---|
| `previous_price`, `price_changed_at` | invent a discount by writing her own "was" price |
| `created_at` | forge a permanent place in "New In" — and it is load-bearing now |
| `saves` | inflate the only engagement signal in the catalogue |
| `id`, `owner_uid` | reassign the row |

Migration `lili_items_server_owned_columns` revokes UPDATE on each, and grants it
back column by column for the fields that are genuinely hers. Same on
`lili_shops` for `followers` and `strikes`. Privileges beat the
overwrite-in-a-trigger approach: the write is *refused* rather than silently
ignored, so a bug on the client surfaces instead of hiding.

Verified live: `created_at`, `previous_price`, `saves`, `owner_uid` and
`followers` are all `false` for `authenticated`; `title`, `price` and `name`
remain `true`.

---

## 9. The funnel — consented, minimal, erasable

The consent sheet has asked every user since v2.7 to agree to analytics. The
answer was stored, audited and made withdrawable. **Nothing read it.** There was
no analytics of any kind in the app.

The launch plan's option 10 said it plainly: *"Gate screen → sign-up → first
listing → first message → first offer. Without it you will finish launch week
knowing nothing about where people stopped."*

`analytics/funnel.js` + `lili_events`. The rules are enforced, not described:

1. **Silent without consent.** Applied at launch from the stored answer, and the
   moment she changes it.
2. **No free text**, with one exception: the term behind a search that found
   nothing — the single most actionable thing a small catalogue can collect, a
   shopping list written by the people who wanted to buy. Under a rule tight
   enough to state: **no digits, no "@", 40 characters at most**, which drops
   phone numbers, emails, order references and anything long enough to be a
   sentence about herself. Every payload is scrubbed centrally, so a careless
   call site cannot leak.
3. **Nobody can read it back through the app.** `lili_events` has no SELECT
   policy for any client role. Not for her, not for a moderator, not for a shop
   owner. Reading happens with the service role, off the handset.
4. **Withdrawal erases.** A toggle that stops future collection but leaves the
   history is not erasure under the PDPL (Federal Decree-Law 45 of 2021). It
   deletes.
5. **No third-party SDK.** No Firebase, no Amplitude, no Segment — each ships a
   device graph and an advertising identifier to a company that is not lili, a
   disclosure this privacy notice does not make and a Play data-safety
   declaration it would then need.

Verified live: `anon` can neither read nor write; `authenticated` can insert only
her own rows and cannot spoof another `user_id`; SELECT is denied outright.

---

## What is still not true, and is still marked as such

- **No payments, no escrow, no shipping.** Blocked on trade licence → corporate
  bank → CBUAE-regulated processor. Six to ten weeks, and none of it engineering.
- **No authentication partner.** Two of the three tiers say "not yet available".
- **Anonymous sign-in is switched off** on the Supabase project, so the app
  cannot obtain a session and runs device-only. **This is a day-1 blocker** and
  it is in the runbook. Nothing in this release changes it.
- **Zero moderator claims** in the database — the moderation queue opens onto
  nothing until one exists. Also day-1, also in the runbook.
- **iOS has never run on WebKit.** Needs a Mac.
- **Push notifications** need Firebase credentials.
