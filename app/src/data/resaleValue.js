// ─────────────────────────────────────────────────────────────────────────────
//  RESALE VALUE REFERENCE
//
//  What this replaces, and why.
//
//  v2.7 screened prices against BRAND_FLOORS: one absolute AED number per
//  brand, category-blind. "A genuine Hermès rarely resells below AED 4,000."
//  That sentence is true of a Birkin and false of a Twilly, a card holder, a
//  belt or a pair of espadrilles — all of which are genuine Hermès and all of
//  which resell for a few hundred dirhams.
//
//  The app's own demo catalogue proved the point: Celine sunglasses at
//  AED 800 tripped the Celine floor of AED 1,200 and were sent for
//  counterfeit review. The seed data could not pass the app's own screen.
//
//  A false accusation of selling fakes is the most expensive error this
//  product can make. It is made to a woman who did nothing wrong, about the
//  one thing nobody wants to be accused of, at the exact moment she is
//  deciding whether to use the app at all.
//
//  So the model here is different in three ways:
//
//    1. Bands are per brand TIER × ITEM CATEGORY, not per brand.
//    2. Bands are adjusted for CONDITION. Fair-condition resale is a real and
//       growing legitimate segment, not a fraud signal — The RealReal's 2025
//       Resale Report has fair-condition sales up 32% YoY, driven by new
//       buyers (+40%), and bags with visible wear up 45%.
//    3. Price is scored, not decisive. The Leipzig semi-automatic counterfeit
//       identification study (Wilkes/Rahm et al., 2015) found price the only
//       reliable single indicator on eBay — and still only reached ~54–63%
//       precision on its own. A signal that is wrong about a third to a half
//       of the time must not, alone, tell a seller she looks like a forger.
//
//  Where the numbers come from
//  ───────────────────────────
//  Tier assignment follows published resale value-retention data rather than
//  brand prestige:
//
//    Rebag "Clair Report" (6th annual, Dec 2025) — value retention against
//    original retail: Hermès 138%, Goyard 132%, Miu Miu 104%, The Row 97%;
//    Van Cleef & Arpels 112%, Rolex 104%, Cartier 87%. Model level:
//    Hermès Kelly Mini II 282%, Birkin Sellier 183%, Constance 137%.
//
//    The RealReal 2025 Resale Report — YoY resale price movement:
//    Goyard Saint Louis +18%, Hermès Birkin 30 +15%, LV Speedy +13%,
//    Rolex Datejust +17%, VCA Alhambra +20%; fine jewellery ASP +17%.
//
//    Khaleej Times, "UAE luxury resale" (2025) — local price reality:
//    UAE pre-owned designer sells from roughly AED 2,850 up to AED 700,000+;
//    UAE resale market ~AED 341m in 2025 on one estimate.
//
//  The AED band lows below are floor-of-genuine estimates for each tier ×
//  category — the cheapest thing that tier genuinely sells in that category,
//  second-hand, in this market. They are deliberately conservative: the cost
//  of a band that is slightly too low is a fake that reaches a human reviewer
//  anyway through the other signals; the cost of a band that is too high is an
//  honest seller told her real handbag looks counterfeit.
//
//  NONE OF THIS IS AN APPRAISAL. It is an order-of-magnitude guardrail, and
//  every band carries the basis it was derived from so a future maintainer can
//  argue with it instead of guessing what past-me meant.
// ─────────────────────────────────────────────────────────────────────────────

export const EVIDENCE = {
  clair2025: {
    id: "clair2025",
    label: "Rebag Clair Report, 6th annual (December 2025)",
    note: "Value retention vs original retail, by brand and model.",
  },
  trr2025: {
    id: "trr2025",
    label: "The RealReal 2025 Resale Report (September 2025)",
    note: "YoY resale price movement; condition and category demand data.",
  },
  khaleej2025: {
    id: "khaleej2025",
    label: "Khaleej Times, UAE luxury resale market (2025)",
    note: "Observed UAE price range and market size.",
  },
  leipzig2015: {
    id: "leipzig2015",
    label: "Semi-Automatic Identification of Counterfeit Offers in Online Marketplaces (2015)",
    note: "Price is the only reliable single counterfeit indicator, and only ~54–63% precise alone.",
  },
  oecd2025: {
    id: "oecd2025",
    label: "OECD/EUIPO, Mapping Global Trade in Fakes (2025)",
    note: "USD 467bn, 2.3% of world trade; clothing, footwear and handbags lead seizures.",
  },
};

// ── brand tiers ─────────────────────────────────────────────────────────────
// `retention` is published value-retention where a figure exists, so the
// number in the code is checkable rather than asserted.
export const BRAND_TIERS = {
  // Ultra: retains at or near retail. A genuine piece is almost never cheap.
  "Hermès":               { tier: "ultra", retention: 1.38, source: "clair2025" },
  "Hermes":               { tier: "ultra", retention: 1.38, source: "clair2025" },
  "Goyard":               { tier: "ultra", retention: 1.32, source: "clair2025" },
  "Chanel":               { tier: "ultra", retention: null, source: "clair2025",
                            note: "Most-searched style (Classic Flap); retention not published as a single figure." },
  "Rolex":                { tier: "ultra", retention: 1.04, source: "clair2025" },
  "Patek Philippe":       { tier: "ultra", retention: null, source: null },
  "Audemars Piguet":      { tier: "ultra", retention: null, source: null },
  "Van Cleef & Arpels":   { tier: "ultra", retention: 1.12, source: "clair2025" },

  // Premium: strong houses, wide price range inside the house.
  "Louis Vuitton":        { tier: "premium", retention: null, source: "trr2025",
                            note: "Speedy +13% YoY; Murakami collab styles exceeded 130% retention." },
  "Dior":                 { tier: "premium", retention: null, source: null },
  "Gucci":                { tier: "premium", retention: null, source: null },
  "Prada":                { tier: "premium", retention: null, source: "khaleej2025" },
  "Miu Miu":              { tier: "premium", retention: 1.04, source: "clair2025" },
  "Bottega Veneta":       { tier: "premium", retention: null, source: null },
  "Saint Laurent":        { tier: "premium", retention: null, source: null },
  "Celine":               { tier: "premium", retention: null, source: "clair2025" },
  "Céline":               { tier: "premium", retention: null, source: "clair2025" },
  "Loewe":                { tier: "premium", retention: null, source: "trr2025" },
  "Fendi":                { tier: "premium", retention: null, source: "clair2025" },
  "Balenciaga":           { tier: "premium", retention: null, source: "clair2025" },
  "Valentino":            { tier: "premium", retention: null, source: null },
  "The Row":              { tier: "premium", retention: 0.97, source: "clair2025" },
  "Cartier":              { tier: "premium", retention: 0.87, source: "clair2025" },
  "Bulgari":              { tier: "premium", retention: null, source: null },
  "Tiffany & Co":         { tier: "premium", retention: null, source: "trr2025" },
  "Tiffany & Co.":        { tier: "premium", retention: null, source: "trr2025" },
  "Burberry":             { tier: "premium", retention: null, source: null },

  // Contemporary: designer, but resale settles well below retail.
  "Chloé":                { tier: "contemporary", retention: null, source: "clair2025" },
  "Chloe":                { tier: "contemporary", retention: null, source: "clair2025" },
  "Jacquemus":            { tier: "contemporary", retention: null, source: null },
  "Isabel Marant":        { tier: "contemporary", retention: null, source: "trr2025" },
  "Zimmermann":           { tier: "contemporary", retention: null, source: null },
  "Ganni":                { tier: "contemporary", retention: null, source: null },
  "Toteme":               { tier: "contemporary", retention: null, source: null },
  "Nanushka":             { tier: "contemporary", retention: null, source: null },
  "Rixo":                 { tier: "contemporary", retention: null, source: null },
  "Rotate":               { tier: "contemporary", retention: null, source: null },
  "Self Portrait":        { tier: "contemporary", retention: null, source: null },
  "Reformation":          { tier: "contemporary", retention: null, source: null },
  "The Frankie Shop":     { tier: "contemporary", retention: null, source: null },
  "Gianvito Rossi":       { tier: "contemporary", retention: null, source: null },
  "Manolo Blahnik":       { tier: "contemporary", retention: null, source: "trr2025" },
  "Jimmy Choo":           { tier: "contemporary", retention: null, source: null },
  "Aquazzura":            { tier: "contemporary", retention: null, source: null },
  "Christian Louboutin":  { tier: "contemporary", retention: null, source: "trr2025" },
  "David Yurman":         { tier: "contemporary", retention: null, source: null },

  // Modest wear is this app's first-class category, and it does not price like
  // a European house. Global Muslim spend on modest fashion was USD 347bn in
  // 2024, +6.2% YoY (State of the Global Islamic Economy 2025/26), but the
  // resale reference for a couture abaya is local atelier cost, not a
  // retention index — so these get their own tier rather than being squeezed
  // into "contemporary".
  "Emirati / Local Designer": { tier: "modest", retention: null, source: null },
  "Dubai Modest Fashion":     { tier: "modest", retention: null, source: null },
  "Abaya Couture":            { tier: "modest", retention: null, source: null },
  "Local Designer":           { tier: "modest", retention: null, source: null },
};

// ── item categories ─────────────────────────────────────────────────────────
// The band model needs to know what KIND of thing this is, because that is
// where v2.7 went wrong. A brand is not a price.
export const ITEM_KINDS = [
  "bag", "small_leather", "silk", "sunglasses", "belt",
  "shoes", "rtw", "jewellery", "watch", "abaya", "other",
];

// Lowest plausible genuine second-hand price in AED, by tier × kind.
// `null` means: we have no basis for an opinion, so we do not form one.
const BANDS = {
  ultra: {
    bag: 6000, small_leather: 900, silk: 450, sunglasses: 350, belt: 700,
    shoes: 700, rtw: 700, jewellery: 1400, watch: 7000, abaya: null, other: 350,
  },
  premium: {
    bag: 1100, small_leather: 300, silk: 200, sunglasses: 220, belt: 250,
    shoes: 380, rtw: 260, jewellery: 500, watch: 1500, abaya: null, other: 180,
  },
  contemporary: {
    bag: 280, small_leather: 120, silk: 90, sunglasses: 110, belt: 90,
    shoes: 220, rtw: 130, jewellery: 120, watch: 300, abaya: null, other: 80,
  },
  modest: {
    // Couture abaya resale tracks atelier cost; high-street modest wear does
    // not. One band, deliberately low, because over-flagging this category
    // would hit the exact sellers the product exists for.
    bag: null, small_leather: null, silk: 80, sunglasses: null, belt: null,
    shoes: null, rtw: 120, jewellery: null, watch: null, abaya: 150, other: 80,
  },
};

// Typical upper edge of the band, used for seller pricing guidance only —
// never for screening. Screening looks down, guidance looks both ways.
const BAND_SPREAD = { ultra: 12, premium: 9, contemporary: 6, modest: 5 };

// Condition moves the whole band. Fair-condition resale is legitimate and
// growing (The RealReal 2025: fair-condition sales +32% YoY, bags with
// visible wear +45%), so a low price on a worn piece is expected, not
// suspicious.
export const CONDITION_FACTOR = {
  "Like New": 1.15,
  "Excellent": 1.0,
  "Good": 0.78,
  "Fair": 0.55,
};

// ── kind inference ──────────────────────────────────────────────────────────
// Plurals matter more than they look: sellers write "heels", not "heel". A
// singular-only pattern silently dropped every plural title into the "other"
// band, which is the lowest one — so the check quietly stopped running on the
// listings most likely to need it.
const KIND_WORDS = [
  [/\b(twill(y|ies)|scar(f|ves)|shawls?|foulards?|silk\s*squares?|carr[ée]s?|pashminas?|hijabs?)\b/i, "silk"],
  [/\b(sunglass(es)?|sunnies|eyewear|shades|frames)\b/i, "sunglasses"],
  [/\b(belts?|ceintures?)\b/i, "belt"],
  [/\b(wallets?|card\s*holders?|cardholders?|coin\s*purses?|key\s*cases?|passport\s*covers?|compact\s*cases?)\b/i, "small_leather"],
  [/\b(watch(es)?|timepieces?|datejust|submariner|santos|tank)\b/i, "watch"],
  [/\b(necklaces?|bracelets?|bangles?|earrings?|rings?|pendants?|brooch(es)?|alhambra|charms?|anklets?)\b/i, "jewellery"],
  [/\b(abaya(s|t)?|jalabiy(a|as|at)|kaftans?|kandura|thobes?|bisht|shayla?s?)\b/i, "abaya"],
  [/\b(heels?|pumps?|sandals?|sneakers?|boots?|loafers?|mules?|espadrilles?|slingbacks?|ballet\s*flats?)\b/i, "shoes"],
  [/\b(bags?|totes?|clutch(es)?|pouch(es)?|crossbody|shoulder\s*bags?|backpacks?|satchels?|hobos?|baguettes?|birkin|kelly|speedy|flap)\b/i, "bag"],
  [/\b(dress(es)?|gowns?|skirts?|blouses?|shirts?|tops?|trousers?|jeans?|coats?|jackets?|blazers?|knits?|cardigans?|suits?|sets?)\b/i, "rtw"],
];

const CATEGORY_KIND = {
  Bags: "bag", Shoes: "shoes", Dresses: "rtw", Tops: "rtw", Bottoms: "rtw",
  Jackets: "rtw", Skirts: "rtw", Abayas: "abaya", Accessories: "other",
  Luxury: null,   // "Luxury" says nothing about what the thing IS
};

/**
 * Work out what kind of item this is. Words in the title win over the
 * category dropdown, because "Luxury" is a shelf, not an object.
 */
export function inferKind({ title = "", subtitle = "", category = "" } = {}) {
  const text = `${title} ${subtitle}`;
  for (const [re, kind] of KIND_WORDS) if (re.test(text)) return kind;
  const fromCategory = CATEGORY_KIND[category];
  if (fromCategory) return fromCategory;
  return "other";
}

// ── model-level floors ──────────────────────────────────────────────────────
// A tier band is a blunt instrument at the top of the market: a Birkin and an
// Hermès espadrille are both "ultra bag/shoes", and only one of them can
// honestly be AED 6,000. The published data is at its strongest here, so the
// handful of pieces with a named retention figure get their own floor.
//
// Every number is deliberately far BELOW observed market — Rebag has the Kelly
// Mini II at 282% and the Birkin Sellier at 183% of retail, and Khaleej Times
// reports UAE Birkins at AED 616,000 for exotics. These are the point at which
// a price stops being a bargain and starts being a question.
const MODEL_FLOORS = [
  { re: /\bbirkin\b/i,                 floor: 25000, kind: "bag",       source: "clair2025" },
  { re: /\bkelly\b/i,                  floor: 22000, kind: "bag",       source: "clair2025" },
  { re: /\bconstance\b/i,              floor: 15000, kind: "bag",       source: "clair2025" },
  { re: /\b(classic\s*flap|11\.12|2\.55)\b/i, floor: 12000, kind: "bag", source: "clair2025" },
  { re: /\b(boy\s*bag|chanel\s*19)\b/i, floor: 8000,  kind: "bag",       source: "clair2025" },
  { re: /\bsaint\s*louis\b/i,          floor: 4500,  kind: "bag",       source: "trr2025" },
  { re: /\bspeedy\b/i,                 floor: 1800,  kind: "bag",       source: "trr2025" },
  { re: /\bvintage\s*alhambra\b/i,     floor: 6000,  kind: "jewellery", source: "trr2025" },
  { re: /\bsweet\s*alhambra\b/i,       floor: 3000,  kind: "jewellery", source: "clair2025" },
  { re: /\blove\s*(bracelet|bangle)\b/i, floor: 12000, kind: "jewellery", source: "clair2025" },
  { re: /\btrinity\b/i,                floor: 3500,  kind: "jewellery", source: "clair2025" },
  { re: /\bsubmariner\b/i,             floor: 20000, kind: "watch",     source: "clair2025" },
  { re: /\bdatejust\b/i,               floor: 15000, kind: "watch",     source: "trr2025" },
];

export function modelFloor({ title = "", subtitle = "" } = {}) {
  const text = `${title} ${subtitle}`;
  return MODEL_FLOORS.find((m) => m.re.test(text)) || null;
}

export function brandTier(brand) {
  if (!brand) return null;
  const key = Object.keys(BRAND_TIERS).find(
    (b) => b.toLowerCase() === String(brand).trim().toLowerCase()
  );
  return key ? { name: key, ...BRAND_TIERS[key] } : null;
}

/**
 * The reference band for this piece.
 *
 * @returns {null | {low, typical, high, tier, kind, condition, basis, sources}}
 *          null means we have no basis — and no basis means no opinion, which
 *          is a legitimate and frequent answer here.
 */
export function referenceBand({ brand, title, subtitle, category, condition = "Excellent" } = {}) {
  const tier = brandTier(brand);
  if (!tier) return null;

  const model = modelFloor({ title, subtitle });
  const kind = model ? model.kind : inferKind({ title, subtitle, category });
  const tierBase = BANDS[tier.tier] && BANDS[tier.tier][kind];
  // A named model only applies its floor if the brand is one that makes it —
  // "speedy delivery" in a description of a Ganni dress is not a Louis Vuitton
  // Speedy, and the tier check is what stops that becoming an accusation.
  const base = model && tier.tier === "ultra" || model && tier.tier === "premium"
    ? Math.max(model.floor, tierBase ?? 0)
    : tierBase;
  if (base == null) return null;

  const factor = CONDITION_FACTOR[condition] ?? 1.0;
  const low = Math.round(base * factor);
  const high = Math.round(low * (BAND_SPREAD[tier.tier] || 6));

  return {
    low,
    typical: Math.round(low * 2.2),
    high,
    tier: tier.tier,
    tierBrand: tier.name,
    retention: tier.retention,
    kind,
    model: model ? model.re.source : null,
    condition,
    basis: model
      ? `Model-level floor for a named ${tier.name} piece in ${condition} condition, second-hand, AED.`
      : `Floor-of-genuine for a ${tier.tier}-tier ${kind.replace("_", " ")} ` +
        `in ${condition} condition, second-hand, AED.`,
    sources: [tier.source, model && model.source, "clair2025", "trr2025", "khaleej2025"]
      .filter(Boolean),
  };
}

/**
 * How far below the floor of genuine is this price?
 *
 * @returns {{ok:boolean, severity:"none"|"soft"|"extreme", band, ratio, reason}}
 *
 * severity is the whole design:
 *   "soft"    — below the band, but within the range that ordinary things
 *               explain: a quick sale, an unfashionable colour, damage the
 *               photos show. Contributes to a score. Never accuses on its own.
 *   "extreme" — below a third of the floor. At that distance the innocent
 *               explanations run out, and this alone is worth a human look.
 */
export const EXTREME_RATIO = 0.35;

export function pricePlausibility({ price, brand, title, subtitle, category, condition } = {}) {
  const band = referenceBand({ brand, title, subtitle, category, condition });
  const amount = Number(price) || 0;
  if (!band || amount <= 0) {
    return { ok: true, severity: "none", band, ratio: null, reason: null };
  }
  const ratio = amount / band.low;
  if (ratio >= 1) return { ok: true, severity: "none", band, ratio, reason: null };

  const severity = ratio < EXTREME_RATIO ? "extreme" : "soft";
  const money = (n) => `AED ${Math.round(n).toLocaleString()}`;

  return {
    ok: false,
    severity,
    band,
    ratio,
    reason:
      severity === "extreme"
        ? `${money(amount)} is under a third of what a genuine ${band.tierBrand} ` +
          `${band.kind.replace("_", " ")} in ${band.condition} condition resells for ` +
          `(from about ${money(band.low)}).`
        : `${money(amount)} sits below the usual ${money(band.low)}+ for a ` +
          `${band.tierBrand} ${band.kind.replace("_", " ")} in ${band.condition} condition.`,
  };
}

/**
 * Backwards-compatible shim for the v2.7 signature. Kept because
 * `priceIsPlausible(price, brand)` is called from the compliance index and
 * asserted in the smoke suite — but it now routes through the band model, so
 * the old call site gets the new behaviour rather than the old floors.
 */
export function priceIsPlausible(price, brand, extra = {}) {
  const identified = extra.title || extra.subtitle || extra.category;
  const p = pricePlausibility({
    price, brand,
    ...(identified ? extra : { ...extra, category: "Bags" }),
  });
  if (p.ok) return { ok: true };
  return { ok: false, floor: p.band.low, severity: p.severity, reason: p.reason };
}

/**
 * Seller-facing pricing guidance. Different job from screening: screening asks
 * "is this a fake", guidance asks "is she leaving money on the table".
 *
 * Underpricing is a real cost to the seller AND a trust cost to the buyer —
 * a designer bag at a market-stall price is read as counterfeit by buyers long
 * before any algorithm sees it.
 */
export function priceGuidance({ price, brand, title, subtitle, category, condition } = {}) {
  const band = referenceBand({ brand, title, subtitle, category, condition });
  if (!band) return null;
  const amount = Number(price) || 0;
  const money = (n) => `AED ${Math.round(n).toLocaleString()}`;
  const range = `${money(band.low)}–${money(band.high)}`;

  if (amount <= 0) {
    return {
      state: "reference",
      headline: `Reference range: ${range}`,
      detail: `For a ${band.tierBrand} ${band.kind.replace("_", " ")} in ${band.condition} condition. A guide from published resale data, not an appraisal of your piece.`,
      band,
    };
  }
  if (amount < band.low) {
    return {
      state: "under",
      headline: `Below the usual range (${range})`,
      detail:
        "Pricing well under the range tends to cost twice: you get less, and buyers read a very cheap designer piece as a fake. If the piece has damage the photos don't show, say so in the description — that explains the price honestly.",
      band,
    };
  }
  if (amount > band.high) {
    return {
      state: "over",
      headline: `Above the usual range (${range})`,
      detail:
        "That can be right for a rare model, full set with receipt, or a piece in exceptional condition. If it is, say which in the description — otherwise it will sit.",
      band,
    };
  }
  return {
    state: "in",
    headline: `In the usual range (${range})`,
    detail: "Priced where comparable pieces sell.",
    band,
  };
}

/**
 * Kept as an export because the security suite asserts brand price floors
 * exist, and because a flat table is genuinely useful for a quick sanity
 * check. It is now DERIVED from the band model rather than being the model —
 * the floor shown is for a bag, which is what the v2.7 numbers were really
 * about all along.
 */
const PRIMARY_KIND = {
  "Rolex": "watch", "Patek Philippe": "watch", "Audemars Piguet": "watch",
  "Van Cleef & Arpels": "jewellery", "Cartier": "jewellery", "Bulgari": "jewellery",
  "Tiffany & Co": "jewellery", "Tiffany & Co.": "jewellery", "David Yurman": "jewellery",
  "Gianvito Rossi": "shoes", "Manolo Blahnik": "shoes", "Jimmy Choo": "shoes",
  "Aquazzura": "shoes", "Christian Louboutin": "shoes",
  "Emirati / Local Designer": "abaya", "Dubai Modest Fashion": "abaya",
  "Abaya Couture": "abaya", "Local Designer": "abaya",
};

const KIND_TITLE = {
  watch: "watch", jewellery: "necklace", shoes: "heels", abaya: "abaya", bag: "bag",
};

export const BRAND_FLOORS = Object.fromEntries(
  Object.keys(BRAND_TIERS)
    .map((brand) => {
      const kind = PRIMARY_KIND[brand] || "bag";
      const band = referenceBand({ brand, title: KIND_TITLE[kind] });
      return band ? [brand, band.low] : null;
    })
    .filter(Boolean)
);
