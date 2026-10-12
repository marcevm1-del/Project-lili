# v2.11.8 – v2.11.9 — the design critique, fixed and held in place

Client only. No migration, no new dependency, no change to what the database
enforces. Payments stay switched off.

**588 research checks (+41) · every local suite green, including `audit`,
which was already over budget on 0d7abdc.** `security`, `legal`, `authflow`
and `preflight` need the live project and were not run from this environment.

---

## What a shopper sees differently

- **Typefaces.** Newsreader (Latin display), Noto Naskh Arabic (Arabic
  display) and IBM Plex Sans Arabic (Arabic body), self-hosted under OFL with
  their licences, behind `--font-display` / `--font-sans`. The display face was
  `Georgia, serif`, which Android does not ship. The Arabic faces are declared
  for italic too and point at the upright file, so an italic heading never
  fakes a slant on Arabic.
- **One language per label.** Follow, Make an Offer, Message Seller, Buy,
  Reserved, shop names, filter and photo counts, the offer and report
  headers, the photo coach, preference headings. Category tiles stay
  bilingual on purpose (`data-bilingual`), because shoppers search both ways.
- **Arabic layout.** Language rows align with the interface; button labels
  are centred again (a global RTL rule had pushed every one to the edge).
- **The item page.** A 4:5 photo (about 58% of the screen, not 45%); a
  Condition chip that opens what the grade means; "Saved by N" from the
  database's own count; a "Before you meet for this one" note from AED 5,000,
  which says lili screens but does not authenticate and names no service.
- **Prices.** The offer sheet quotes the same range as the listing (it said
  "from about AED 280" on an AED 1,800 piece). While nothing is collected,
  the sell screens lead with what she keeps — the full price — and give the
  fee "from launch".
- **Glyphs mean what they say.** The shortlist is a list, not a shopping bag;
  stock terms carry a tag, not a trending arrow; offers are a price tag.
- **Removed:** the three-chip reassurance rows (splash, profile), npm
  instructions in user copy, a shop "story" viewer that played invented
  captions, NEW badges on every saved card, "0 Listings / 0 Followers" on a
  new account.
- **Search** says it works in both languages, with two examples to tap, and
  each result says how it matched.
- **No-photo tiles** show the brand as a designed label instead of a large
  icon. Real photography is still the biggest gap and is not something code
  can supply.

## What a seller sees differently

- **Photos first.** A single listing opens on the photo step; the seller type
  and shop name are asked at publish and the piece goes live straight after.
  "Several at once" still opens a shop first.
- **Lower price.** Each piece in My Shop shows its saves and can be lowered.
  The hint uses `lili.notify_price_drop`'s own numbers (5% and AED 20): it
  says whether the people who saved it will be told. The database sends the
  notifications; the client sends nothing.
- **Condition grades** show their meaning under the picker — the same
  sentence the buyer reads.
- **Share this meet** with someone you trust: place, time and that it is a
  lili handover, through the phone's share sheet or WhatsApp.

## Under the hood

- First paint 439 kB → 383 kB (budget 420): Sell, Messages, Shops and Cart
  load on first tap.
- Theme tokens for backdrops, elevation, danger and success tints, the field
  fill and media overlays; content colours in `src/theme/swatches.js`. No hex
  literal is left in a component except a brand's own logo and seed rows.
- `uxlaws` fails the build on a two-language label (it only warned), knows
  the two shapes that used to slip past it, and visits the item page, the
  photo step, preferences, offers and language.
- `research` sections 64–67 hold all of the above in place, including the
  client's price-drop numbers against the SQL trigger.

## Second pass, same release

- **Every header in one language.** The shared screen header (Settings,
  Help, Privacy, Sign in, Orders and 23 more) printed an English title over
  an Arabic subtitle that repeated it. It now shows the interface's
  language; in Arabic the Arabic line is the title. The language picker and
  the four first-run gate screens keep both on purpose. Notifications,
  Offers and the help questions follow the same rule.
- **Search in Arabic** names categories in Arabic, and the category tiles
  lead with the interface's language.
- **Accessibility.** The shared back arrow and the photo-remove button had
  no name; four thumbnails had no `alt`. `research` now parses every
  `<button>` in the source and fails on an unnamed one, and every `<img>`
  needs an `alt`.
- **Numbers that add up.** While nothing is collected the fee row reads
  AED 0, with the launch fee in words — it showed AED 81 under "You
  receive AED 900".
- **Smaller fixes.** NEW only when it sets a piece apart; the shop name no
  longer sits under its own banner; empty-state icons centred over their
  text; the selected Orders tab is the strong one; the photo coach says "4
  of these" above six tips; text below the 11px floor removed; the listing
  advice reads as a list; a warning carried to a later sell step offers
  "Go back"; the age check's placeholder is "YYYY", not a sample year.
- **The checks reach further.** `uxlaws` opens Help and Privacy and fails if
  any screen it should measure was never reached — it had silently stopped
  at Offers.

## Decisions left to you

- **The resale range is very wide** (`BAND_SPREAD` is 5–12×, so a Chanel flap
  reads "AED 12,000–144,000"). Tightening it needs better data, not code.
- **The market gate** is unchanged, as decided.
- **"She"** throughout the copy assumes a women-only marketplace. If that is
  the policy, say so at sign-up; if not, the copy should change.
- **775 strings are still English-only.** The language screen promises a
  person translates them, so none were machine-translated here.
