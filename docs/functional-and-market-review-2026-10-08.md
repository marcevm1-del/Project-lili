# Functional test and market comparison — 8 October 2026

## 1 · Does it work?

Every user-facing flow the database supports was run end to end on the live
project, as a seller, a buyer and a signed-out visitor, inside one transaction
that is rolled back afterwards. The script is `supabase/tests/functional_test.sql`;
anyone can re-run it from the SQL editor.

| Area | Checks | Result |
|---|---|---|
| Invites and beta gate | mint code, bad code refused, redeem (case-insensitive), membership granted, signed-out refused | ✅ all pass |
| Listing and browse | listing goes live, visible signed out, shop stats | ✅ |
| Search | exact, typo ("scraf"), accent-free ("hermes"), Arabic (عباية), Arabic slang (شنطة), aliases | ✅ after fix (see below) |
| Saves, follows, price drop | save count, follower count, price-drop alert, previous price shown | ✅ |
| Messaging | notification, thread preview, mark read, **cannot edit a message**, signed-out cannot read | ✅ |
| Offers | notify seller, seller accepts, buyer told, cannot withdraw after accept, buyer cannot accept own offer, hourly expiry job | ✅ |
| Safe meets | proposer cannot confirm own plan, other side confirms, check-in, notification | ✅ |
| Reports and moderation | duplicate report refused, queue, claim, decide, listing removed, strike, both parties told | ✅ |
| Conversation reports | transcript captured, moderator reads it (audited), others cannot, evidence frozen | ✅ |
| Analytics and export | consented event logged, nobody can read events back, full data export (19 sections) | ✅ |
| Rate limits | third attempt over a limit of two is refused | ✅ |
| Account deletion | erasure receipt, other person keeps the thread | ❌ until the pending SQL is run |

### Bugs this test found (in addition to the 15 earlier today)

1. **Account deletion failed for anyone who had reported a chat.** The evidence
   record refused the one change deletion makes (clearing who disclosed it),
   and those columns were marked required while their links say "clear on
   delete". Guard fixed live; the column change is in the pending SQL.
2. **Bilingual search never matched a translation.** The synonym bridge
   required a listing to contain *every* synonym at once. Fixed live.
3. **Search terms matched inside words** ("ring" in "earrings", "new" in
   "newspaper"). Fixed live.
4. **One swapped letter missed** ("scraf" → "scarf"). Threshold set to pg_trgm's default. Fixed live.
5. **Anyone could list who follows which shop**, signed in or not. Now each
   person sees only her own follows; counts stay public on the shop.

Leftover test data: the founder account holds one stale notification
("this must be redacted, not deleted") from an earlier erasure probe. Harmless;
delete it from the dashboard if wanted.

## 2 · How lili compares

Comparators: the closest models a Gulf resale app is measured against.
Figures are from third-party sources and change often; check each platform's
own fee page before quoting them. `?` = not verified.

| | **lili** | Vinted | Vestiaire Collective | The Luxury Closet | Depop | Dubizzle |
|---|---|---|---|---|---|---|
| Model | Invite-only, women, C2C introductions | Mass C2C | Luxury C2C | Luxury consignment (Dubai) | Social C2C | Classifieds (UAE) |
| Who pays | Free (no payments yet) | Buyer protection fee, seller pays nothing | Seller commission (~12–25%) | Seller commission | Varies by country | Free listing; paid boosts |
| Payment & escrow | ❌ meet and pay in person | ✅ held until delivery | ✅ | ✅ | ✅ | ❌ cash in person |
| Authentication | Text + price screening, human review | Optional paid check | Physical check for many items | Brand-trained check before listing | ❌ | ❌ |
| Shipping | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Offers / haggling | ✅ 48 h offers, counters | ✅ | ✅ | limited | ✅ | chat only |
| Seller reviews | ❌ (reply-time trust signal only) | ✅ | ✅ | n/a (store) | ✅ | limited |
| Follows / social | ✅ follow shops | ✅ | ✅ | ❌ | ✅ core | ❌ |
| Price-drop alerts | ✅ | ✅ (favourites) | ✅ | ? | ✅ | ❌ |
| Arabic search | ✅ bridged, typo-tolerant | ❌ | partial | ✅ | ❌ | ✅ |
| In-person safety | ✅ two-sided meet plan, check-in, report with transcript | n/a | n/a | n/a | n/a | basic advice |
| Transparent moderation | ✅ statement of reasons to both sides, appeal path | partial | partial | n/a | partial | partial |
| Data rights (export / erase) | ✅ in-app | ✅ | ✅ | ✅ | ✅ | ✅ |

### Where lili is ahead
- **Safety for meeting in person.** No comparator has a two-sided meet plan
  with check-in and a report path that carries the conversation. For a
  meet-and-pay model this is the product, and it is built.
- **Arabic-first search** with transliteration ("3abaya", شنطة) — the global
  apps do not do this.
- **Moderation people can see:** both sides get the reasons and an appeal.
- **Curated, invite-only supply** — the opposite of Dubizzle's open listings.

### Gaps that matter most, in order
1. **No payment or escrow.** Every comparator except Dubizzle holds money until
   the buyer is satisfied. This is the licence and processor path in the launch
   notes; nothing in code can shorten it. Until then lili competes with
   Dubizzle and Instagram, not with Vinted.
2. **No seller reviews.** Vinted, Vestiaire and Depop all lean on them.
   lili already records a meet as `done` with a check-in; a one-tap rating
   after a `done` meet would use data the database already has.
3. **No authentication beyond screening.** Vestiaire and The Luxury Closet sell
   on it. A paid "send it to be checked" option with a partner (as Vinted does)
   fits the seams already in the code.
4. **No shipping.** Fine for Dubai-only meets; limits reach across emirates.
5. **Phone verification before selling** (named in the launch notes) is not in
   the database yet.
6. **No saved-search alerts** — price-drop alerts exist; "tell me when a Celine
   bag under AED 3,000 is listed" does not. `lili_missing_demand` already
   records what people search for and do not find.
7. **Push notifications** — tokens are stored, nothing sends them.

Sources consulted (third-party, may be out of date):
[Vinted fee calculator (size.ly)](https://www.size.ly/tools/vinted-fee-calculator),
[Vinted fees 2026 (underpriced.app)](https://www.underpriced.app/blog/vinted-fees-2026),
[Vestiaire Collective selling guide 2026](https://www.underpriced.app/blog/vestiaire-collective-selling-guide-2026),
[Is Vestiaire Collective authentic (closo.co)](https://closo.co/blogs/platform-specific-guides/is-vestiaire-collective-authentic),
[The Luxury Closet Circle (subger.com)](https://subger.com/en/ca/service/luxury-closet-circle),
[Dubizzle fashion app Shedd (Gulf Business)](https://gulfbusiness.com/?p=79723),
[Dubizzle user poll (OLX Group)](https://www.olxgroup.com/news/dubizzle-poll-reveals-70-of-users-are-eco-conscious/).
