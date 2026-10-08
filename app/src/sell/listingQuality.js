import { referenceBand, priceGuidance, brandTier, inferKind } from "../data/resaleValue.js";

// ─────────────────────────────────────────────────────────────────────────────
//  LISTING QUALITY
//
//  A coach, never a gate. Nothing here can stop a listing being published.
//
//  Why it exists: the handover's own next-steps list put photo quality above
//  every algorithm, and the published work agrees. What it does NOT do is
//  invent a number. Every check below is a thing that can actually be observed
//  from the form — a count, a length, a word present or absent — and every
//  check carries the evidence it rests on, so a future maintainer can dispute
//  the weight rather than guess at the intent.
//
//  The evidence, in short:
//
//    · eBay's own guidance: listings meeting its photo standards are 4.5% more
//      likely to sell; minimum 500px on the longest side.
//    · Ma et al. (2019), 75,000 marketplace images from Letgo and eBay: higher
//      image quality raised the probability of sale 1.17× for shoes and 1.25×
//      for handbags — the effect is strongest in exactly this app's categories.
//    · Johnson, Vang & Van Der Heide (2015): listings with the seller's own
//      photographs, rather than stock images, drew more bidders and higher
//      final prices.
//    · Gorton et al. (2024), eye-tracking on eBay: cheap purchases are decided
//      on price and photos alone; expensive ones need trust signals BEYOND the
//      image. A resale Birkin is the second kind, which is why provenance is
//      weighted as heavily as the photographs here.
//    · The RealReal 2025 Resale Report: fair-condition sales +32% YoY and bags
//      with visible wear +45%. Disclosing damage does not cost the sale. It is
//      hiding it that costs the sale, and then the dispute.
//    · OECD/EUIPO (2025): clothing, footwear and handbags lead counterfeit
//      seizures worldwide — so a genuine seller's provenance photographs are
//      doing real work against a real background suspicion.
//
//  What deliberately is NOT scored: anything that would need to judge the
//  photograph itself. There is no on-device model here, and a score that
//  guesses at "photo quality" from a file size would be a number pretending to
//  be a measurement.
// ─────────────────────────────────────────────────────────────────────────────

export const EVIDENCE = {
  ebayPhotos: "eBay seller guidance — listings meeting photo standards are 4.5% more likely to sell.",
  ma2019: "Ma et al. (2019), 75,000 listing images: higher image quality → 1.25× sale probability for handbags, 1.17× for shoes.",
  johnson2015: "Johnson, Vang & Van Der Heide (2015): own photographs beat stock images on bidders and final price.",
  gorton2024: "Gorton et al. (2024), eye-tracking: high-value purchases need trust signals beyond the image.",
  trr2025: "The RealReal 2025 Resale Report: fair-condition sales +32% YoY; bags with visible wear +45%.",
  oecd2025: "OECD/EUIPO (2025): clothing, footwear and handbags lead global counterfeit seizures.",
  bilingual: "lili's own bilingual search: an Arabic title is what makes the piece findable to a woman searching in Arabic.",
};

// Four is the point at which the marginal photo stops earning its place for a
// single garment; the research supports "more and better", not a magic number,
// so this is stated as the app's chosen target rather than a finding.
export const PHOTO_TARGET = 4;
const DESC_TARGET = 120;      // characters — roughly three honest sentences

// ── the three content checks, in both languages ─────────────────────────────
//
// v2.9.1, and this was the app penalising the sellers it most wants.
//
// All three were English-only, and all three used `\b`. A word boundary is
// defined against the ASCII word characters, so `\b` against Arabic does not
// mean what it looks like it means — it matches at the edge of every Arabic
// run, or fails entirely, depending on what sits beside it. Either way a
// seller who wrote an honest Arabic description — the receipt she has, the
// scuff on the corner, the measurements — scored zero on all three and was
// told her listing was incomplete.
//
// In an app whose entire differentiation is that it is bilingual, and whose
// sell flow tells her the Arabic title is what makes her piece findable.
//
// The Arabic alternates below are the words a Dubai seller actually writes,
// not dictionary forms: مقاس for size rather than قياس, خدش for a scratch,
// فاتورة for the receipt. Arabic has no word boundary to anchor, so those
// alternates are matched without one — which is correct, because Arabic
// prefixes attach directly to the noun (بالفاتورة is "with the receipt").
const PROVENANCE_WORDS = new RegExp(
  "\\b(receipt|invoice|authenticity\\s*card|auth\\s*card|serial|date\\s*code|hologram|" +
  "dust\\s*bag|dustbag|box|papers|certificate|purchased\\s*(at|from)|bought\\s*(at|from)|boutique)\\b" +
  "|(فاتورة|إيصال|ايصال|بطاقة\\s*الأصالة|بطاقة\\s*اصالة|الرقم\\s*التسلسلي|كيس\\s*الغبار|العلبة|الصندوق|شهادة|اشتريتها|مشتراة)", "i");

const FLAW_WORDS = new RegExp(
  "\\b(scratch|scuff|mark|stain|wear|worn|fade|faded|pull|snag|loose|repair|crack|peel|tarnish|missing|patina|corner)\\b" +
  "|(خدش|خدوش|كشط|بقعة|بقع|أثر|اثر|استعمال|إستعمال|باهت|تلف|تشقق|مفقود|ناقص|اهتراء|تمزق)", "i");

const MEASURE_WORDS = new RegExp(
  "\\b(\\d+\\s*(cm|mm|inch|in|\")|bust|waist|hip|length|shoulder|strap\\s*drop|heel\\s*height|" +
  "fits\\s*like|true\\s*to\\s*size|runs\\s*(small|large))\\b" +
  "|(مقاس|المقاس|الطول|العرض|الخصر|الصدر|الكتف|الورك|سم|سنتيمتر|يناسب|مناسب\\s*لمقاس)", "i");

const ARABIC = /[؀-ۿ]/;

const NEEDS_MEASUREMENTS = new Set(["rtw", "shoes", "abaya"]);

/**
 * Score a listing in progress.
 *
 * @returns {{score:number, grade:string, checks:Array, top:Array}}
 *   checks[] each: {id, state:"pass"|"improve"|"missing", weight, title, why,
 *                   evidence}
 */
export function scoreListing({
  title = "", titleAr = "", desc = "", brand = "", price = 0,
  category = "", condition = "Excellent", photos = [], subtitle = "",
} = {}) {
  const photoCount = Array.isArray(photos) ? photos.length : Number(photos) || 0;
  const text = `${title} ${subtitle} ${desc}`;
  const kind = inferKind({ title, subtitle, category });
  const tier = brandTier(brand);
  const isHighValue = tier && (tier.tier === "ultra" || tier.tier === "premium");
  const checks = [];

  // ── photographs ──────────────────────────────────────────────────────────
  checks.push({
    id: "photos",
    weight: 25,
    state: photoCount === 0 ? "missing" : photoCount < PHOTO_TARGET ? "improve" : "pass",
    title:
      photoCount === 0 ? "Add photos"
      : photoCount < PHOTO_TARGET ? `${photoCount} photo${photoCount > 1 ? "s" : ""} — ${PHOTO_TARGET} sells better`
      : `${photoCount} photos`,
    why:
      photoCount === 0
        ? "A listing without a photograph does not sell. Not rarely — it does not sell."
        : photoCount < PHOTO_TARGET
        ? "Front, back, label, and any flaw close up. The extra shots are the ones that answer the question a buyer would otherwise message you about — or not bother to."
        : "Enough angles for a buyer to decide without messaging first.",
    evidence: `${EVIDENCE.ma2019} ${EVIDENCE.ebayPhotos}`,
  });

  // ── title ────────────────────────────────────────────────────────────────
  const titleLen = title.trim().length;
  const titleNamesBrand = brand ? title.toLowerCase().includes(brand.toLowerCase().split(" ")[0]) : false;
  checks.push({
    id: "title",
    weight: 10,
    state: titleLen === 0 ? "missing"
      : titleLen < 12 || (brand && !titleNamesBrand) ? "improve" : "pass",
    title: titleLen === 0 ? "Add a title" : titleNamesBrand || !brand ? "Title reads well" : "Put the brand in the title",
    why: "Search matches on the title first. Brand plus what the thing actually is — \"Chanel Classic Flap, medium\" finds buyers that \"gorgeous bag\" never will.",
    evidence: EVIDENCE.bilingual,
  });

  // ── Arabic title ─────────────────────────────────────────────────────────
  checks.push({
    id: "arabic",
    weight: 10,
    state: ARABIC.test(titleAr) ? "pass" : "improve",
    title: ARABIC.test(titleAr) ? "Arabic title added" : "Add an Arabic title",
    why: "Half this market searches in Arabic. Without an Arabic title your piece is only findable by half the women who would buy it.",
    evidence: EVIDENCE.bilingual,
  });

  // ── description ──────────────────────────────────────────────────────────
  const descLen = desc.trim().length;
  checks.push({
    id: "description",
    weight: 15,
    state: descLen === 0 ? "missing" : descLen < DESC_TARGET ? "improve" : "pass",
    title: descLen === 0 ? "Say something about it"
      : descLen < DESC_TARGET ? "Description is thin" : "Description is solid",
    why: "Where you bought it, how often you wore it, why you're letting it go. Three sentences is enough, and it is the difference between a listing and an advert.",
    evidence: EVIDENCE.johnson2015,
  });

  // ── condition honesty ────────────────────────────────────────────────────
  const wornCondition = condition === "Good" || condition === "Fair";
  const flawsMentioned = FLAW_WORDS.test(text);
  checks.push({
    id: "condition",
    weight: 12,
    state: !wornCondition ? "pass" : flawsMentioned ? "pass" : "improve",
    title: !wornCondition ? "Condition stated"
      : flawsMentioned ? "Wear described" : "Describe the wear",
    why: "Buyers pay for worn pieces — what they will not forgive is finding the mark themselves. Naming it, and photographing it, is what makes the price make sense.",
    evidence: EVIDENCE.trr2025,
  });

  // ── measurements ─────────────────────────────────────────────────────────
  if (NEEDS_MEASUREMENTS.has(kind)) {
    checks.push({
      id: "measurements",
      weight: 8,
      state: MEASURE_WORDS.test(text) ? "pass" : "improve",
      title: MEASURE_WORDS.test(text) ? "Fit described" : "Add measurements",
      why: "Sizes are not the same across brands or countries. A bust and a length in centimetres prevents the return, and the return is where the sale is lost.",
      evidence: EVIDENCE.johnson2015,
    });
  }

  // ── provenance, for the pieces where it decides the sale ─────────────────
  if (isHighValue) {
    const hasProvenance = PROVENANCE_WORDS.test(text);
    checks.push({
      id: "provenance",
      weight: 15,
      state: hasProvenance ? "pass" : "improve",
      title: hasProvenance ? "Provenance mentioned" : "Show what came with it",
      why: "At this price a buyer is not deciding on the photograph alone. Receipt, card, serial, dust bag, box — photograph whatever exists. It is also what keeps your listing out of our review queue.",
      evidence: `${EVIDENCE.gorton2024} ${EVIDENCE.oecd2025}`,
    });
  }

  // ── price ────────────────────────────────────────────────────────────────
  const guidance = priceGuidance({ price, brand, title, subtitle, category, condition });
  if (guidance) {
    checks.push({
      id: "price",
      weight: 15,
      state: guidance.state === "in" ? "pass" : guidance.state === "reference" ? "missing" : "improve",
      title: guidance.headline,
      why: guidance.detail,
      evidence: "Band derived from Rebag Clair 2025 and The RealReal 2025 retention data — a guide, not an appraisal.",
      band: guidance.band,
    });
  }

  const possible = checks.reduce((n, c) => n + c.weight, 0);
  const earned = checks.reduce(
    (n, c) => n + (c.state === "pass" ? c.weight : c.state === "improve" ? c.weight * 0.4 : 0),
    0
  );

  // An untouched form scores zero, not the ~30 it would otherwise collect from
  // defaults the seller never chose (the condition dropdown starts at a value,
  // so the condition check "passes" before she has typed anything). A progress
  // number that starts a third of the way along is the same dark pattern as a
  // progress bar with a head start, and this app already refused that one in
  // the sell flow.
  const started = title.trim().length > 0 || photoCount > 0;
  const score = started && possible ? Math.round((earned / possible) * 100) : 0;

  const grade = score >= 80 ? "ready" : score >= 55 ? "good" : "thin";

  // Highest-weight problems first. Three at most — a list of nine things to fix
  // is a list nobody fixes.
  const top = checks
    .filter((c) => c.state !== "pass")
    .sort((a, b) => (b.weight * (b.state === "missing" ? 1.5 : 1)) - (a.weight * (a.state === "missing" ? 1.5 : 1)))
    .slice(0, 3);

  return { score, grade, checks, top, kind, tier: tier ? tier.tier : null };
}

// ── the photo checklist ─────────────────────────────────────────────────────
// Shown at capture, not after. Composition is a thing the seller can act on in
// the moment; a score afterwards is a thing she can only feel bad about.
export const PHOTO_CHECKLIST = [
  { id: "daylight", en: "Daylight, near a window", ar: "ضوء النهار بجانب النافذة",
    why: "Phone cameras are honest in daylight and grainy under warm indoor bulbs." },
  { id: "plain", en: "Plain background", ar: "خلفية بسيطة",
    why: "A cluttered bed makes the piece hard to see and the seller hard to trust." },
  { id: "whole", en: "The whole piece, front and back", ar: "القطعة كاملة، أمام وخلف", },
  { id: "label", en: "The label, and the serial or date code", ar: "الليبل والرقم التسلسلي",
    why: "This is the photo that ends the authenticity conversation before it starts." },
  { id: "flaw", en: "Any mark or wear, close up", ar: "أي علامة أو استخدام عن قرب",
    why: "Showing it costs you nothing. Hiding it costs you the sale and the dispute." },
  { id: "scale", en: "Worn or held, for scale", ar: "مرتدية أو ممسوكة لتوضيح الحجم" },
];
