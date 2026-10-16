# v2.8 — what changed, and what it rests on

Written for whoever picks this up next. Every change below is either a bug with
a demonstration, or a rule with a citation. Where the evidence is thin, it says
so.

`npm run research` is the new suite — 102 checks that exercise these rules
rather than grepping for them. It is wired into `verify` and `verify:fast`.

---

## The short version

| | |
|---|---|
| **Three design tokens were used everywhere and defined nowhere** | 103 references to `C.terraTx`, 25 to `C.btn`, 21 to `C.onBtn`, all resolving to `undefined`. Every primary button had no background of its own. Fixed. |
| **Counterfeit screening flagged genuine sellers** | One category-blind price floor per brand. The app's own demo catalogue could not pass it. Replaced with brand-tier × category × condition bands, and a score with a threshold instead of independent tripwires. |
| **The guided flow silently disabled the price check** | `hasAuthentication={true}` was hard-coded, next to a "Skip authentication" button. The safer-looking path was the weaker one. |
| **Quick List published with no brand** | The brand field was guided-only, so the faster and more popular route sent `brand:""` and the price check never ran. |
| **The app made claims that were not true** | "Trusted by 10,000+ women in Dubai", "4.9 from 2,000+ reviews", six seed shops with fabricated ratings, a new shop born with `rating: 5`, an "AI Tip" from no AI, and a seller agreement promising an authentication step that does not exist. All removed or corrected. |
| **New: a listing quality coach** | Evidence-weighted, never blocking, at most three suggestions, every one able to show what it rests on. |
| **New: a photo checklist at capture** | Six shots, bilingual, shown in both flows instead of one line in the flow used by sellers who already knew. |

Test status: `smoke` 198/198, `research` 78/78, `walk` 71/71, `visual` 55/55,
`devices` 66/66, `security` 202/202 (including the live-database layers),
`a11y` 15 screens clean, `keyboard` 13/13, `functional` 21/21, `settings`
13/13, `loading` 17/17, `contrast` clean, `audit` unchanged from baseline.

`integration` fails one check, **and it failed identically before any of this
work** — verified against a clean unzip of the original source. See
[The one red test](#the-one-red-test).

---

## 1. The bug that had nothing to do with research

`src/Marketplace.jsx` and `src/compliance/ui.js` each export a `C` map of
design tokens pointing at CSS custom properties. Neither map contained
`terraTx`, `btn` or `onBtn`. The app referenced them 149 times.

React drops a style property whose value is `undefined`. It does not warn. So:

- every primary button rendered with no background of its own
- every terracotta label inherited whatever colour sat above it

The CSS variables existed the entire time. `--c-terra-tx` even carries the
comment *"terracotta as TEXT — 4.6:1 on peach"*, so the contrast work was done
and then never reached the screen. `contrast.mjs` passed because it checks the
stylesheet, not the components. `visual` passed because it asserts layout, not
computed colour. jsdom has no computed styles at all.

This is the handover's own lesson — *assert the property, not the shape* —
arriving from a new direction. The new suite asserts the tokens exist in both
maps.

---

## 2. Counterfeit screening: from tripwires to a score

### What was wrong

v2.7 held one absolute AED floor per brand, category-blind:

```js
"Hermès": 4000, "Chanel": 3000, "Celine": 1200, …
```

*"A genuine Hermès rarely resells below AED 4,000."* True of a Birkin. False of
a Twilly, a card holder, a belt, a pair of espadrilles — all genuine Hermès,
all a few hundred dirhams.

The proof was already in the repo. Seed item 7 is **Celine sunglasses at
AED 800**, against a Celine floor of AED 1,200. The demo catalogue tripped the
app's own counterfeit screen. Any listing that did was sent to human review,
and the seller was told her price looked like a fake's.

### Why one signal is not enough

The Leipzig study on semi-automatic identification of counterfeit offers (2015)
tested this exact class of rule against real marketplace data. Two findings
shaped the rewrite:

1. Price is the only single indicator that survives contact with reality —
   seller rating and country of origin "cannot be used as reliable" on eBay.
2. A price-led score still reached only **~54–63% precision**. Roughly one flag
   in two was an honest seller.

A counterfeit accusation is not a neutral outcome. It is delivered to a woman
who has done nothing wrong, about the one thing nobody wants to be accused of,
at the moment she is deciding whether to use the app at all. A signal that is
wrong half the time must not, alone, make that accusation.

### What replaced it

**`src/data/resaleValue.js`** — a band model:

- **Brand tiers** (`ultra` / `premium` / `contemporary` / `modest`) assigned by
  published value retention, not by prestige. Hermès 138%, Goyard 132%, Van
  Cleef 112%, Rolex 104%, Miu Miu 104%, The Row 97%, Cartier 87% — Rebag's 6th
  annual Clair Report, December 2025.
- **Category bands** per tier: a bag, a piece of small leather, silk,
  sunglasses, a belt, shoes, ready-to-wear, jewellery, a watch, an abaya. The
  band lows are floor-of-genuine estimates in AED, deliberately conservative,
  and each carries the basis it was derived from.
- **Model-level floors** for the pieces where the published data is strongest:
  Birkin, Kelly, Constance, Classic Flap, Saint Louis, Speedy, Alhambra, Love,
  Trinity, Submariner, Datejust. A model floor only applies if the brand
  actually makes that model, so "speedy delivery" in a Ganni description is not
  a Louis Vuitton Speedy.
- **Condition adjustment.** Fair 0.55, Good 0.78, Excellent 1.0, Like New 1.15.
  Fair-condition resale is a real and growing legitimate segment — The RealReal
  reports fair-condition sales +32% YoY, driven by new buyers (+40%), and bags
  with visible wear +45%. A low price on a worn piece is expected, not
  suspicious.
- **No basis, no opinion.** An unknown brand returns `null` and is never
  screened on price. That is a frequent and correct answer.

**`src/compliance/listingRules.js`** — a score with a threshold of 3:

| Signal | Weight |
|---|---|
| Price below the band | 1 — never enough alone |
| Price under a **third** of the band | 3 — enough alone |
| "Inspired by", "style of", "similar to" | 2 |
| Bulk-trade phrasing (MOQ, wholesale, multiple available) | 2 |
| No provenance stated | 1 |
| Over-assertion ("100% authentic, real not fake") | 1 |

Signals that do not reach 3 are still shown — as advice, in the seller's
interest. A listing that reads as suspect to a machine reads as suspect to a
buyer too. Hard blocks (self-declared replicas, CITES materials, weapons,
pharma, alcohol, used intimates) are unchanged and remain absolute.

The over-assertion signal is a marketplace-trust heuristic, not a published
finding. It is weighted 1 so it can never flag a listing on its own, and the
code says so.

### Demonstrated in the suite

Now pass cleanly: Celine sunglasses at AED 800, an Hermès Twilly at AED 600, an
Hermès card holder at AED 1,100, a Gucci belt at AED 400, Louboutin heels at
AED 450.

Still caught: a Chanel Classic Flap at AED 400, an Hermès Birkin at AED 3,000
(model floor), any self-declared replica, exotic skins. A price modestly below
the band plus one other signal reaches review; either alone does not.

---

## 3. Two holes in the sell flow

**Authentication was hard-coded on.** Step 4 passed `hasAuthentication={true}`
unconditionally — the flag that switches *off* the price signal — while the
radio buttons had no state at all and a "Skip authentication for now" link sat
two rows below. Choosing the guided flow and skipping authentication published
an unauthenticated listing with the counterfeit price check disabled. The
premium path was the weakest one. It now reflects what the seller actually
selected.

**The brand field was guided-only.** Quick List — the faster and more popular
route, the one v2.7 had already been fixed once to screen at all — submitted
`brand:""`. The price band reads the brand; with no brand there is no band and
no check. Brand and the Arabic title now appear in both flows. "Quick" was
always about steps, not about withholding the two inputs that decide whether
the listing is screened and whether it is findable in Arabic.

**The authentication tiers themselves.** The screen offered "Free Photo Review
— AI scans your photos for authenticity signals", "Expert Verification AED 75"
and "White Glove Auth AED 150". No model performs the first and no partner
exists for the other two. Both paid tiers are now marked *not yet available*,
and the free tier is honestly described as photographing what came with the
piece. Saying "not yet" costs nothing. Charging AED 150 for a verification
nobody performs would end the business.

The seller agreement carried the same false promise — *"Chanel, Hermès, Rolex,
Cartier, Van Cleef and similar cannot be listed without authentication"* — and
now describes the control that actually exists: screening, human review, and
provenance photographs.

---

## 4. Things the app claimed that were not true

The trust module states the principle plainly: *"A brand-new seller does not
get a 4.9 and 138 reviews because the seed data had one."*

The seed data had one. Six of them — ratings 4.6 to 4.9 with 31 to 138 reviews,
all above the five-review threshold in `Stars`, so all of them displayed.

Removed or corrected:

- fabricated ratings and review counts on all six seed shops; they now carry
  `demo: true` and render a **"Sample shop · دكان تجريبي"** chip instead
- `rating: 5` written into every newly created shop in `repo.js` — invisible
  behind the threshold, but waiting for the day another screen read the field
  without the guard
- the "rating" cell in the shop header, which rendered an empty number under a
  label promising one
- **"Trusted by 10,000+ women in Dubai — ★★★★★ 4.9 from 2,000+ reviews"**,
  replaced with what is actually true today
- the "AI Tip" in the photo step, which borrowed the authority of a model that
  is not running
- "Add up to 6 photos" beside a counter reading `0/8`; the copy now reads the
  limit

On the last point beyond honesty: the UAE Consumer Protection Law (Federal Law
No. 15 of 2020) requires advertising that does not mislead, and the E-Commerce
Law (Federal Decree-Law No. 14 of 2023) applies to platforms. Invented review
counts on a pre-launch marketplace are not a growth tactic here, they are
exposure. Not legal advice — but it is the kind of thing counsel will ask about
before the licence, and it is cheaper to fix now.

---

## 5. New: listing quality coach

`src/sell/listingQuality.js` + `ListingQuality.jsx`. Three rules, each one a way
this pattern usually goes wrong:

1. **It never blocks.** Publishing stays one tap away at every score.
2. **At most three suggestions**, highest-weight first. A checklist of nine is
   a checklist nobody completes.
3. **Every suggestion can be expanded to show why**, and the why cites what it
   rests on. A nudge you cannot interrogate is a nag.

An untouched form scores 0, not the ~30 it would otherwise collect from
dropdown defaults the seller never chose — the same reasoning the sell flow's
progress bar already applied when it refused a head start.

What it checks, and why:

| Check | Weight | Evidence |
|---|---|---|
| Photo count (target 4) | 25 | eBay: listings meeting photo standards are 4.5% more likely to sell. Ma et al. (2019), 75,000 listing images: higher image quality → **1.25× sale probability for handbags, 1.17× for shoes** |
| Description ≥ 120 chars | 15 | Johnson, Vang & Van Der Heide (2015): own photographs and real detail beat stock and thin listings on bidders and final price |
| Provenance, high-value brands only | 15 | Gorton et al. (2024) eye-tracking: cheap purchases are decided on price and photos; expensive ones need trust signals *beyond* the image. OECD/EUIPO (2025): clothing, footwear and handbags lead global counterfeit seizures |
| Price inside the band | 15 | Rebag Clair 2025, The RealReal 2025 |
| Wear described on Good/Fair pieces | 12 | The RealReal 2025: fair-condition sales +32% YoY. Disclosing damage does not cost the sale; hiding it costs the sale and then the dispute |
| Arabic title | 10 | The product's own differentiator — without one the piece is invisible to everyone searching in Arabic |
| Title names the brand | 10 | Search matches the title first |
| Measurements, for clothing and shoes | 8 | Prevents the return, which is where the sale is lost |

**Deliberately not scored:** anything that would require judging the photograph
itself. There is no on-device model here, and a "photo quality" number inferred
from a file size would be a guess wearing the costume of a measurement.

Seller-facing pricing guidance uses the same bands from the other direction:
underpricing is framed as a cost to *her* — she gets less, and buyers read a
very cheap designer piece as a fake — never as a suspicion. Every band is
labelled a guide, not an appraisal.

---

## 6. New: photo checklist at capture

`src/sell/PhotoCoach.jsx`. Six shots in the order you would actually take them,
in English and Arabic: daylight near a window, plain background, whole piece
front and back, the label and serial or date code, any mark close up, and one
worn or held for scale.

Shown *before and during* capture, in both flows. Composition is something a
seller can act on while the bag is still on the table; a score delivered
afterwards is something she can only feel bad about.

---

## Sources

**Resale pricing and value retention**

- Rebag, *Clair Report*, 6th annual, December 2025 — value retention by brand
  and model. [Press release](https://www.prnewswire.com/news-releases/rebag-releases-its-sixth-annual-clair-report-a-comprehensive-luxury-appraisal-index-for-resale-302637452.html)
- The RealReal, *2025 Resale Report*, September 2025 — YoY resale movement,
  condition demand. [Investor release](https://investor.therealreal.com/news/news-details/2025/The-RealReals-2025-Resale-Report-09-04-2025/default.aspx)
- Khaleej Times, *UAE luxury resale* (2025) — local price range (AED 2,850 to
  AED 700,000+), market size ~AED 341m. [Article](https://www.khaleejtimes.com/lifestyle/fashion/uae-luxury-resale-fashion-2025)
- Salaam Gateway / SGIE 2025-26 — modest fashion spend USD 347bn in 2024,
  +6.2% YoY. [Article](https://salaamgateway.com/story/sgie-report-2026-how-modest-wear-is-reserving-a-spot-in-mainstream-fashion)

**Counterfeit detection**

- *Semi-Automatic Identification of Counterfeit Offers in Online Marketplaces*
  (2015) — price is the only reliable single indicator; ~54–63% precision
  alone. [PDF](https://dbs.uni-leipzig.de/files/research/publications/2016-2/pdf/product-counterfeits-15332861.2015.pdf)
- OECD / EUIPO, *Mapping Global Trade in Fakes 2025* — USD 467bn, 2.3% of world
  trade; clothing, footwear and handbags lead seizures. [EUIPO](https://www.euipo.europa.eu/en/publications/mapping-global-trade-in-fakes-2025)

**Listing conversion and photographs**

- Ma et al. (2019), 75,000 Letgo and eBay listing images — 1.25× handbags,
  1.17× shoes; eBay's own 4.5% figure; Johnson, Vang & Van Der Heide (2015);
  Gorton et al. (2024) eye-tracking. [Review of 12 sources](https://letsenhance.io/blog/all/photo-quality-marketplace-statistics/)

**UAE regulation**

- Federal Law No. 15 of 2020 (Consumer Protection) + Cabinet Decision No. 66 of
  2023; Federal Decree-Law No. 14 of 2023 (E-Commerce); Federal Decree-Law No.
  45 of 2021 (PDPL). [K&L Gates summary](https://www.klgates.com/Update-UAE-Consumer-Protection-and-E-Commerce-Laws-1-23-2024)

Nothing here is legal advice.

---

## The one red test

`integration` reports **13 passed, 1 failed** — *"Arabic survives a restart"*.

It fails identically on a clean unzip of the original v2.7 source, so it is not
a regression. The cause is not language persistence. The test walks past the
market gate with `tap("Shop Now")` and `tap("Skip")`, which do not open it —
the gate needs "look around anyway", an age, and two agreements, as
`visual.test.mjs` does. So by the time it reaches the language step the app is
still showing *"Not open here yet"*, the tap silently misses, and storage still
reads `en`. Language persistence itself works; the assertion has never actually
reached the screen it is testing.

Two ways to fix it, and the choice belongs to you: give `integration` the same
gate sequence `visual` uses, or make `tap()` fail loudly instead of returning
`false` — a helper that swallows a miss is how an assertion ends up testing
nothing at all.

---

## What I did not change

**The Supabase schema and its triggers.** Everything above is client-side. The
band model is deliberately a plain data module with no React and no browser
API, so the same tiers, bands and threshold can be ported to the screening
trigger. **Until that happens, the server still enforces the v2.7 rule.** The
client is the coach; the database is the control, and right now they disagree.
That is the first thing I would do next.

**Trust signals, moderation, messaging, offers.** They were right.

**Payments.** Still the product. Nothing in code shortens the licence.

**The empty room.** Thirty real sellers with good photographs still beats
everything on this page. The photo coach makes their listings better; it cannot
make them exist.

---

# Addendum — the launch batch

Added after the v2.8 upgrade above, working towards a **private beta behind the
market gate**: AE stays on `waitlist`, browsing is open to everyone, selling and
messaging are invite-only, no payments. See `LAUNCH-RUNBOOK.md` for the
step-by-step.

Two of these are not improvements. They are things that did not work at all.

## A · Listing to the server was broken, and failed silently

The client sends `category`, `subtitle`, `offers`, `isNew` and `hasStory` on
every new listing. `lili_items` had columns for none of them, so PostgREST
refused every insert with PGRST204 — and `repo.addItem` caught the error, wrote
a `console.warn` nobody reads, and saved the listing to the phone instead.

The seller saw her piece appear in her shop. It looked like it had worked. It
had never reached the database, and no other woman would ever see it.
`lili_items` held **zero rows**, which is what you would expect if this had
never once worked. Nothing caught it: the security suite is all negative tests —
"anonymous cannot write" — so nothing ever asserted that a signed-in seller can.

Fixed in four places:

- `category` and `subtitle` are now real columns, and the search vector is built
  from them too (migration `lili_items_add_category_and_subtitle`).
- `toRow` is an **allowlist** instead of a denylist. A denylist has to be updated
  every time the client grows a field and the cost of forgetting is silent and
  total; an allowlist just does not send the new field until someone adds it
  here and to the schema, next to each other.
- `repo.addItem` now distinguishes *offline* from *refused*. Offline still falls
  back to the device, marked `pending`. A refusal is thrown.
- `submit` in the sell flow is awaited, shows the failure, and keeps the form and
  photographs so she can retry. It also blocks a double tap, which previously
  created two listings.

## B · Messaging was a puppet show

`MessagesPage` kept its threads in React state and faked the other woman. A
`setTimeout` fired 1.2 seconds after you sent anything and drew a reply at
random from `["Thanks for reaching out!", "Yes, still available!", "Can you
share your size?"]`. The seller was never told anyone had written to her.

The server side is real and complete — `openConversation`, `sendMessage`,
`getMessages`, `watchMessages`, `markRead`, rows that cannot be edited, policies
admitting only the two participants. The handover describes it accurately. The
interface simply never called any of it, and `repo.js` had no messaging code at
all.

For a marketplace that makes introductions rather than taking payments, the
introduction *is* the product. Now:

- `src/data/conversations.js` — the missing repo, same local-first rule as the
  rest of the app.
- Real threads, live delivery, read receipts, and a send failure the sender
  actually sees.
- With no backend configured a message is stored and **marked undelivered**. The
  one thing this screen must never do again is answer on a seller's behalf.
- `src/messages/MeetSafely.jsx` — the safety layer that stands in for escrow,
  since there is none: meet in public, keep it in lili (these messages are
  immutable and are what a dispute can look at; a chat moved to another app is
  not), check the piece before money changes hands. It says plainly that lili
  holds no money.
- Reporting from **inside** the thread. Harassment happens in the conversation,
  and asking someone to leave it, find the shop and report from there is asking
  most people not to bother.

## C · The private beta, enforced by the database

An invite code compared in JavaScript is a string in a bundle anyone can read.
That is not a control, and shipping one would be the same decorative-safety
problem this release has spent its time removing. So:

- `lili_invites` — no `SELECT` policy at all. The code list is unreadable from
  any client, not filtered to zero rows.
- `lili_beta_members` + `lili_is_beta_member()`.
- `lili_redeem_invite(code)` — gated, one code one woman, case-insensitive and
  trimmed because codes get typed off a phone.
- `shops_create`, `items_create` and `conv_create` all require membership.
  Browsing policies are untouched: anyone can still read live listings.
- `lili_settings.beta_gate` — **one row opens the doors** at launch, with no
  migration and no deploy.
- The sell tab says *invite only* at the door rather than letting her photograph
  six pieces and meet a refusal at the end. The gate screen's old promise —
  "Buying, selling and messages switch on the day we're properly open here" —
  was untrue, because the browse override gave full access. Now it is true.

A device-only build (no backend) is not gated: there is no server to publish to,
so the beta is not a thing that exists in that mode.

## D · Screening now agrees with the client

The v2.8 bands are in the database (migration
`lili_screening_v28_bands_and_score`): brand tiers, category bands, model-level
floors, condition factors, and the same scored threshold of 3. Verified end to
end by inserting real rows through the trigger and reading the verdicts back —
the server and the client now return the same answer for every case in the
suite, including the Celine sunglasses that started this.

Every verdict records `rules: 'v2.8'`, so you can always tell which version of
the rules judged a listing.

One thing found while porting: the search vector was being rebuilt without
`unaccent`, while `lili_search` unaccents the query. Left alone, "Hermès" in a
title would never have matched a search for "Hermes". Corrected in migration
`lili_build_search_restore_unaccent`.

## Test status after the batch

`smoke` 198 · `research` **102** · `walk` 71 · `visual` 55 · `devices` 66 ·
`security` 202 (live database included) · `a11y` 15 screens clean · `keyboard`
13 · `functional` 21 · `settings` 13 · `loading` 17 · `oldwebview` 6 ·
`contrast` clean · `audit` unchanged.

`integration` still reports 13 passed, 1 failed — the same pre-existing test
fault described above, unrelated to any of this.

## Still open, and deliberately so

**Moderators cannot read a reported conversation, because nothing can.** That is
the design, and it means a harassment report can currently only end in a block.
Section 5 of `LAUNCH-RUNBOOK.md` lays out the three options. It needs a decision
from you before thirty women are talking to each other in private threads — and
the wrong way to resolve it is for a moderator read-path to arrive quietly, as a
convenience, with no audit row.

---

# Addendum 2 — the launch batch, continued

## E · Harassment reports can now be reviewed, without a moderator key

The gap was real and stated plainly in the go-live checklist: nothing could read
a reported conversation, so a harassment report could be filed and never
assessed. The only outcome available was a block, which she could already do
herself.

Three options were on the table. This is the one that hands **nobody** a power
they did not already have: the reporter may attach a copy of her own thread to
her own report, off by default, chosen at the moment she asks for help.

- `lili_case_evidence` — no RLS policy at all, so unreadable from any client.
  An UPDATE trigger refuses every edit; DELETE is deliberately allowed, because
  a lawful erasure request must not require a schema migration under pressure,
  and the audit row that a transcript existed survives either way.
- `lili_report_conversation(...)` — participants only, verified against the
  conversation row. An outsider gets `not_your_conversation`.
- `lili_case_transcript(case_id)` — moderators only, and **every read writes an
  audit row**. An audited path nobody audits is an unaudited path with extra
  steps.
- The reported party is not notified that a report exists. Both parties still
  learn the outcome through the existing statement of reasons.

Verified end to end against the live database: a participant can report and
attach, an outsider cannot, a non-moderator cannot read, the transcript cannot
be edited, the moderator read is audited, and the reported party's only
notification remains the message she had already received.

## F · The integration suite is green, and now tests what it claims

It had reported one failure for as long as anyone had run it, and the fault was
in the test. `tap()` returned `false` when a control was absent and no caller
checked, so after the reload in "Choices persist" the run was sitting on the
market gate while the Arabic assertion ran against a screen it had never left.
The check had never once tested language persistence.

Now: the real gate sequence is reused, steps that genuinely matter use
`mustTap()` which throws, and a new assertion fails the suite if any required
interaction was silently missed. **15 passed, 0 failed.**

## G · An invite can no longer be bound to a throwaway session

The app signs everyone in anonymously so a shopper never meets a wall just to
look. Redeeming an invite on an anonymous session would have bound the
membership to a uid that exists on one device — sign in properly later and
Supabase issues a different uid, taking the shop and every listing with it, with
a used-up code and no obvious way back. Redemption now requires a real account
and says why.

## H · What I checked and did not change

**The co-tenant app is not the hole it looked like.** The handover flags seven
`SECURITY DEFINER` admin functions any signed-in user can call. They can be
called; they are also authorised internally — every one begins with
`if not public.is_admin() then raise exception`. I probed it as a real
`authenticated` session: a lili user cannot make herself an admin (a trigger
pins `is_admin`), cannot suspend anyone, cannot read diagnostics, and cannot see
another person's journal entries.

What *is* true, and is worth a line in the privacy notice rather than a fix in
code: **one signup creates an identity in both apps.** `handle_new_user` writes a
`public.profiles` row for every new `auth.users` row, so a woman signing up to
sell a dress gets a profile in an unrelated journalling app carrying her email.
`is_public` defaults to false, so nothing is exposed — but it is processing she
was not told about.

**The market wall stays a wall.** I persisted the "have a look around anyway"
choice, on the reasoning that meeting the notice on every cold start is friction
in front of the only open door. The smoke suite disagreed, and it was right:
*"an unlicensed market shows its wall on every launch."* Carrying someone past a
legal notice once and never showing it again is exactly the shortcut a regulator
asks about. Reverted, and the reasoning is now recorded in both the code and the
suite so the next person does not have to rediscover it.

**Also fixed:** `vite-node` was missing from `devDependencies`, so `npm run
verify` failed on a clean install with `sh: 1: vite-node: not found`.

## Test status

`smoke` 198 · `research` **111** · `walk` 71 · `visual` 55 · `devices` 66 ·
`security` 202 · `a11y` 15 screens clean · `keyboard` 13 · `functional` 21 ·
`settings` 13 · `loading` 17 · `oldwebview` 6 · `contrast` clean ·
**`integration` 15 — green for the first time.**

---

# Addendum 3 — "enhance every feature"

That brief made me audit which features are actually wired to the server, by
checking every function `remote.js` exports against every call site in `src/`.
Messaging was not an isolated case. **Six complete server features had zero
callers.**

| Feature | Server | App, before this |
|---|---|---|
| Offers / haggling | full state machine, immutable amounts, 48-hour expiry | nothing called any of it |
| Notifications | `getNotifications`, `unreadCount`, `watchNotifications` | nothing called any of it |
| Moderation queue | `listCases`, `claimCase`, `decideCase`, `isModerator` | read a device store instead |
| Saved items | `getSaved`, `toggleSave` | device-only, never synced |
| Live feed | `watchItems` | unused |

## I · Offers were a slot machine

`OfferModal` waited two seconds and drew the seller's reply at random from
`["accept","counter","counter"]`, inventing a counter at 96% of whatever you
typed. The buyer watched an animation and believed a woman had answered her in
two seconds. The seller was never told an offer existed.

The pricing hint was invented too — *"similar items accept offers around"* 88–95%
of the asking price, which is not a fact about similar items, it is arithmetic
on this one.

Now: `src/data/offers.js` (the repo that should have existed), a real modal, and
`src/offers/OffersPage.jsx` — both sides of the haggle, replacing a profile row
that said "Soon" while the state machine sat unused underneath it. A buyer may
only withdraw; a seller may accept, decline or counter. That is not this file's
rule, it is `lili_offers`', and this only agrees with it. The pricing hint now
uses the published resale band and says nothing at all when there is no basis.

An accepted offer says plainly that lili does not take payment or hold the
piece. Until payments exist, "accepted" is a promise between two people and the
app must not imply more.

## J · Notifications reached nobody

The bell was a button with **no `onClick`** and a red dot that was permanently
lit — every user, forever, told something was waiting, with nowhere to look.

Underneath, `lili_notifications` had been filling correctly the whole time with
the moderation statement of reasons for both parties, screening outcomes, offer
events and message alerts. `WHAT-WOULD-MAKE-IT-BEST` describes fixing exactly
this: *"A right of reply that never arrives is not a right of reply."* The
composing was fixed. The reading never was, so the sentence stayed true one
layer further up.

Now the bell opens a real sheet, the badge is a real count asked of the server,
and marking read is the only change a person can make — rows are written by
triggers only, because a notifications table anyone can insert into is a channel
for pushing strangers arbitrary text inside the app.

## K · The moderation queue read the wrong database

Every function in `moderation.js` read a device store. Setting the moderator
claim on your account — exactly as the go-live checklist instructs — would have
opened a screen showing your own phone's copy of nothing.

It is now server-aware, gated by `lili_is_moderator()`, and shows the attached
conversation for a reported thread: on demand, never loaded with the case,
because opening a case should not silently count as reading someone's private
messages. Every transcript read writes an audit row and the moderator is told so.

Also guarded: **five unguarded `STATES[state].terminal` lookups**, three of them
on the server path. One unfamiliar state from the database would have taken down
the one screen you open when something has already gone wrong.

## L · Every wait now ends

Found while screenshotting: with the server unreachable, the notifications sheet
sat on "Loading…" indefinitely. No error, no empty state, no way out. The same
was true of the offers page and the background unread poll, which leaked a
pending promise every minute for as long as the app was open.

An unreachable server does not produce an error. It produces silence.
`repo.js` already knew this — it gives the feed a 1,200 ms budget under the
heading *"never block the first paint on the network"* — and the new screens did
not inherit the lesson. `src/ux/timeout.js` now gives them a budget: 6 s when
she tapped something and is watching, 4 s for a background refresh, and an
honest "we couldn't reach lili" with a Try again.

## Test status

`smoke` 198 · `research` **142** · `walk` 71 · `visual` 55 · `devices` 66 ·
`security` 202 · `a11y` 15 screens clean · `keyboard` 13 · `functional` 21 ·
`settings` 13 · `loading` 17 · `oldwebview` 6 · `integration` 15 · `contrast`
clean.

## Still not wired, and why

**Saved items** sync (`toggleSave`/`getSaved`) and the **live feed**
(`watchItems`) remain device-only. Both are real gaps and neither blocks a
private beta: a save that does not follow you to a new phone is a small loss,
and a feed that refreshes on open rather than live is normal. They are the next
two, and they are small now that the pattern is established.

---

# Addendum 4 — the last of the unwired features

## M · Saves were written onto the listing

`toggleSaved` did `updateItem(id, { saved: !item.saved })`. A save is a fact
about a **person and an item**, not a property of the item, and treating it as
one fails three ways at once against a server:

- `saved` is not a column on `lili_items`, so the allowlist strips it
- updating a listing you do not own is refused by the row-level policy, so
  saving another woman's piece could only ever fail
- and had it worked, one woman saving a bag would have marked it saved **for
  everyone looking at it**

`lili_saves` has always been the right shape — one row per person per item.
Saves are now an id set, read from the server, with the heart derived in exactly
one place. An optimistic tap that the server refuses puts the heart back rather
than lying about it.

Caught while fixing it: the demo catalogue's `saved` flags seeded the screen but
not the store, so the first tap moved the count *down* from 3 to 1. The set is
now seeded in `bootstrap`, where the items are, so there is one source of truth.

## N · Follows never left the phone

`repo.toggleFollow` wrote to device storage. `remote.toggleFollow` existed,
maintained the follower count through a trigger, and had no callers — so a
follow lived on one phone and no shop's follower count ever moved.

## O · The feed was a slideshow

`remote.watchItems` existed and was never called. A piece listed by one woman
did not appear for another until the app was reopened. In a beta of thirty
sellers all listing on the same evening, that is the difference between a
marketplace and a slideshow.

## P · Reports of listings and shops never reached a moderator

`ReportDialog` filed every case in device storage. Only the conversation path
(added earlier in this release) reached the server. So a woman reporting a
counterfeit listing was filing it **on her own phone**, where no moderator would
ever see it, and being handed a reference number that meant nothing.
`remote.enqueueCase` existed and had no callers. Every report now reaches the
server; conversations keep the dedicated consented-disclosure path.

Found while fixing that: the report submission was **unbounded**, so an
unreachable server would have left a woman staring at an unchanged screen after
reporting harassment. It now acknowledges within 2.5 seconds and says plainly
when the report is saved on her phone but has not reached us yet — the same
honesty the offline listing and message paths already had.

## Also

`betaGateOn` was added earlier in this release, never called, and **removed
rather than shipped** — a client-side reading of a switch that the row-level
policies decide is dead code that looks like a control.

The `integration` suite had a fixed 500 ms sleep asserting on whatever happened
to be on screen. It now waits for the receipt itself.

## The audit that started this, re-run

Every function `remote.js` exports now has a caller, except: `BACKEND` (a
constant), `canSignIn` (a pre-existing helper), and `uploadPhoto(s)` /
`uploadPhotoSet`, which `addItem` uses internally.

**There are no unwired server features left.**

## Test status

`smoke` 198 · `research` **154** · `walk` 71 · `visual` 55 · `devices` 66 ·
`security` 202 · `a11y` 15 screens clean · `keyboard` 13 · `functional` 21 ·
`settings` 13 · `loading` 17 · `oldwebview` 6 · `integration` 15 · `contrast`
clean.

---

# Addendum 5 — what lili charges

Researched against the platforms lili competes with, then built.

## The benchmarks

| Platform | Seller commission | Buyer fee |
|---|---|---|
| Vestiaire Collective | 25% under $100 · 20% to $499 · 18% to $1,999 · 15% to $4,999 · **12% above $5,000** | — |
| Poshmark | $2.95 under $15, else 20% | — |
| Mercari | 10% | 3.6% buyer protection |
| Grailed | 9% above $120, 6% below | — |
| Whatnot | 8% | — |
| Depop (US) | **0%** | processing 3.3% + $0.45 |
| Vinted (US) | **0%** | buyer protection fee |
| eBay | 13.6% incl. processing | — |

Two things fall out of that table.

**Commission slopes down as price goes up, everywhere it is tiered.** The reason
is arithmetic: UAE card processing is about 2.5–2.9% plus AED 1 per transaction
(Telr 2.49% + AED 0.50, Network International 2.4–2.9% + AED 1, Stripe 2.9% +
AED 1, Tap 2.75%). A flat rate barely clears the fixed cost on a AED 260 abaya
and is a number that sends a AED 40,000 seller to The Luxury Closet.

**The volume platforms have moved the fee to the buyer.** Vinted and Depop
charge sellers nothing and take their margin from a buyer-paid protection fee.

## What was built

A tiered schedule in `src/data/fees.js`, versioned so a sale can always be
priced by the rules in force when it was made:

| Sale price | lili's fee |
|---|---|
| Under AED 500 | 10% |
| AED 500 – 1,999 | 9% |
| AED 2,000 – 4,999 | 8% |
| AED 5,000 – 14,999 | 7% |
| AED 15,000 and above | 6% |

Minimum AED 15 — which never actually bites, because the market's AED 200
listing floor already clears it. **Blended take rate on a realistic catalogue:
7.6%**, inside the 6–10% the business asked for, and competitive against every
comparable at every tier.

VAT at 5% is **inclusive**: the rate she sees is the rate she pays, and the tax
comes out of it. That is the display the Consumer Protection Law's Executive
Regulations expect. (Whether lili is agent or principal for VAT on the *sale
itself* is a different, unsettled question and stays in the market readiness
list.)

## The two fees that disagreed

The app stated the fee in two places that had never been reconciled:

- the item detail told the **buyer**: "+ 8-10% LILI fee", charged on top
- the sell flow told the **seller**: "lili takes 10%", taken off

Read together that is a take rate near 20% that nobody had decided and neither
screen knew the other was claiming. One fee now, in one module: the seller pays
a commission, the buyer pays the price on the tag.

The payout box leads with **what she receives**, because leading with the
deduction is how a fee reads as a penalty. And it says plainly that **nothing is
deducted yet** — `COLLECTION_LIVE` is false until there is a processor, so no
screen can imply money is moving that is not.

## What was deliberately NOT built

**A buyer-paid protection fee.** It is where the volume platforms have gone and
it suits a market that needs supply more than margin. lili cannot charge for it:
buyer protection means holding the money and refunding it when something goes
wrong, and lili holds nothing. Charging a protection fee while protecting
nothing is the same class of claim as the invented reviews this release removed.
It goes in when escrow does — and when it does, it is the lever that lets the
seller-side rate come down.

## Price-drop alerts — the one component worth copying now

Poshmark and Depop both do it, and it was the only mechanic whose plumbing was
already finished: saves reach the server, notifications are delivered and read.

When a seller lowers a price, everyone who saved that piece is told. Only a real
drop (≥5% **and** ≥AED 20), never on a rise, never to the seller herself, and at
most once per person per piece per day — because a channel that can be made to
fire repeatedly is a channel people switch off, and there is no switching it
back on once they have stopped trusting it.

## Four more things found doing it

**Offer notifications were filed as `kind = 'message'`.** The CHECK constraint on
`lili_notifications.kind` was written before offers existed and never extended,
so the offer trigger worked around it by lying about the type. An offer arriving
wore the chat icon and routed to the wrong screen. A notification whose type is
a lie cannot be routed, filtered or counted. Constraint extended, trigger
corrected, and an offer now links to the screen where she can actually answer it.

**The Saved screen's "Price drops" tab filtered on `item.priceDrop`, which
nothing ever set** — a filter for a thing the app did not record, permanently
empty. `previous_price` is now written by the same trigger that sends the alert,
and is server-owned so a seller cannot invent a discount.

**Three screens lost the heart when saves became an id set.** `SavedPage`,
`ShopViewPage` and `ProfilePage` were still receiving raw `items`. Caught by
reading the wiring rather than by a test — the suite passed because the seed
flags happened to line up on first render.

**The payout test asserted a hard-coded 900** — a flat 10% typed into the test as
well as the copy. It reads the fee module now. A test that repeats the number
cannot notice the schedule changing; one that asks the schedule can.

## Test status

`smoke` 198 · `research` **175** · `walk` 71 · `visual` 55 · `devices` 66 ·
`security` 202 · `a11y` 15 screens clean · `keyboard` 13 · `functional` 21 ·
`settings` 13 · `loading` 17 · `oldwebview` 6 · `integration` 15 · `contrast`
clean.
