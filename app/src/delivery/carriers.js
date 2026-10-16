// ─────────────────────────────────────────────────────────────────────────────
//  DELIVERY IN THE UAE AND THE GCC
//
//  Yaga's idea, carried over: a seller switches on every courier she's happy to
//  send a piece with, picks the parcel size once, and the buyer chooses at
//  checkout and pays the delivery fee. "Shops with more options sell faster."
//
//  The carriers are the ones that actually serve this region. Fees live in the
//  database (lili_delivery_rates) so lili can correct them without a release;
//  until lili confirms a rate with the carrier the app calls it "estimated".
//
//  v1: the seller books the shipment herself with the carrier she chose, at its
//  counter or online, and adds the tracking number; the buyer's delivery fee is
//  paid to her with the sale. Labels booked by lili come when lili has carrier
//  accounts.
// ─────────────────────────────────────────────────────────────────────────────

export const CARRIERS = [
  { key: "aramex", name: "Aramex", nameAr: "أرامكس", regions: ["UAE", "GCC"],
    about: "Door to door. Drop it at an Aramex counter or book a pickup.",
    aboutAr: "من الباب إلى الباب. سلّميها في أحد فروع أرامكس أو احجزي استلاماً.",
    track: (n) => `https://www.aramex.com/track/results?ShipmentNumber=${encodeURIComponent(n)}` },
  { key: "emirates_post", name: "Emirates Post", nameAr: "بريد الإمارات", regions: ["UAE"],
    about: "Post it from any Emirates Post office, delivered to the door.",
    aboutAr: "أرسليها من أي مكتب لبريد الإمارات، وتُسلَّم إلى الباب." },
  { key: "quiqup", name: "Quiqup same-day", nameAr: "كويك أب في نفس اليوم", regions: ["UAE"],
    about: "A rider collects from you and delivers the same day.",
    aboutAr: "يستلمها مندوب منكِ ويوصلها في اليوم نفسه." },
  { key: "smsa", name: "SMSA Express", nameAr: "سمسا إكسبرس", regions: ["UAE", "GCC"],
    about: "Covers Saudi Arabia and the Gulf. Drop off at an SMSA branch.",
    aboutAr: "تغطي السعودية والخليج. سلّميها في أحد فروع سمسا." },
  { key: "dhl", name: "DHL Express", nameAr: "دي إتش إل إكسبرس", regions: ["UAE", "GCC"],
    about: "Express across the UAE and the GCC. Drop off at a DHL point or book a pickup.",
    aboutAr: "توصيل سريع في الإمارات والخليج. سلّميها في نقطة DHL أو احجزي استلاماً.",
    track: (n) => `https://www.dhl.com/ae-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(n)}` },
];
export const COURIERS = CARRIERS;
export const carrier = (key) => CARRIERS.find((c) => c.key === key) || null;

// Meeting in person was removed (migration 39): every piece now goes by
// courier. A listing that names no courier we know is offered the two that
// reach every emirate, the same default the database gives a new listing.
export const DEFAULT_DELIVERY = ["aramex", "emirates_post"];

/** The couriers a piece can go by: the seller's choice, or the default. */
export function deliveryWays(item) {
  const ways = (Array.isArray(item && item.delivery) ? item.delivery : []).filter((k) => carrier(k));
  return ways.length ? ways : DEFAULT_DELIVERY;
}

/** Parcel sizes, the way couriers in the region price them. */
export const PARCEL_SIZES = [
  { key: "XS", label: "Extra small", fits: "Jewellery, a scarf, sunglasses", dims: "up to 30 × 20 × 5 cm · 0.5 kg",
    labelAr: "صغير جداً", fitsAr: "مجوهرات، وشاح، نظارة شمسية", dimsAr: "حتى 30 × 20 × 5 سم · 0.5 كغ" },
  { key: "S",  label: "Small",       fits: "A top, a dress, a small bag",   dims: "up to 40 × 30 × 10 cm · 1 kg",
    labelAr: "صغير", fitsAr: "بلوزة، فستان، حقيبة صغيرة", dimsAr: "حتى 40 × 30 × 10 سم · 1 كغ" },
  { key: "M",  label: "Medium",      fits: "Shoes in their box, a handbag", dims: "up to 45 × 35 × 20 cm · 3 kg",
    labelAr: "متوسط", fitsAr: "حذاء في علبته، حقيبة يد", dimsAr: "حتى 45 × 35 × 20 سم · 3 كغ" },
  { key: "L",  label: "Large",       fits: "A coat, boots, a large bag",    dims: "up to 60 × 40 × 40 cm · 5 kg",
    labelAr: "كبير", fitsAr: "معطف، جزمة، حقيبة كبيرة", dimsAr: "حتى 60 × 40 × 40 سم · 5 كغ" },
  { key: "XL", label: "Extra large", fits: "A bundle, a suitcase-size bag", dims: "up to 60 × 50 × 60 cm · 10 kg",
    labelAr: "كبير جداً", fitsAr: "مجموعة قطع، حقيبة بحجم حقيبة سفر", dimsAr: "حتى 60 × 50 × 60 سم · 10 كغ" },
];

// The starting estimates migration 33 seeds into lili_delivery_rates, kept here
// so fees still show with no connection or for sample pieces. The database is
// the source: lili corrects fees there, and a fee confirmed with the courier
// only ever comes from it. The research suite checks the two match.
const SEEDED = {
  aramex_UAE: "XS:20 S:25 M:30 L:40 XL:55",
  aramex_GCC: "XS:60 S:75 M:95 L:130 XL:180",
  emirates_post_UAE: "XS:15 S:20 M:28 L:35 XL:50",
  smsa_UAE: "XS:20 S:25 M:32 L:40 XL:55",
  smsa_GCC: "XS:55 S:70 M:90 L:120 XL:170",
  quiqup_UAE: "XS:25 S:25 M:30 L:35 XL:45",
  dhl_UAE: "XS:30 S:35 M:45 L:60 XL:85",
  dhl_GCC: "XS:120 S:150 M:200 L:260 XL:350",
};
export const ESTIMATED_RATES = Object.entries(SEEDED).flatMap(([k, v]) => {
  const [carrierKey, region] = [k.slice(0, k.lastIndexOf("_")), k.slice(k.lastIndexOf("_") + 1)];
  return v.split(" ").map((p) => { const [size, fee] = p.split(":"); return { carrier: carrierKey, size, region, fee: Number(fee), confirmed: false }; });
});

/** Where a buyer can have it sent. Everything outside the UAE is "GCC". */
export const COUNTRIES = [
  { code: "AE", name: "United Arab Emirates", nameAr: "الإمارات العربية المتحدة", region: "UAE" },
  { code: "SA", name: "Saudi Arabia", nameAr: "السعودية", region: "GCC" },
  { code: "KW", name: "Kuwait", nameAr: "الكويت", region: "GCC" },
  { code: "QA", name: "Qatar", nameAr: "قطر", region: "GCC" },
  { code: "BH", name: "Bahrain", nameAr: "البحرين", region: "GCC" },
  { code: "OM", name: "Oman", nameAr: "عُمان", region: "GCC" },
];
// In the reader's language (the Arabic is a draft awaiting native review, like
// the rest of i18n/drafts.js). `lang` is passed in so this file stays import-free.
export const inLang = (o, field, lang) => (lang === "ar" && o && o[`${field}Ar`]) || (o && o[field]) || "";

export const regionFor = (code) => (COUNTRIES.find((c) => c.code === code) || COUNTRIES[0]).region;

// The order rules the database enforces (migration 33). The policies quote
// these through legal/facts.js and the research suite checks both agree.
export const SHIP_WITHIN_DAYS = 4;
export const AUTO_RELEASE_DAYS = 14;
export const UNPAID_MINUTES = 30;

export const ORDER_STATES = {
  awaiting_payment: { label: "Waiting for payment", labelAr: "بانتظار الدفع",            tone: "wait" },
  paid:             { label: "Paid · to be sent",    labelAr: "مدفوع · بانتظار الإرسال", tone: "act" },
  shipped:          { label: "On its way",           labelAr: "في الطريق",              tone: "act" },
  completed:        { label: "Completed",            labelAr: "مكتمل",                  tone: "done" },
  cancelled:        { label: "Cancelled",            labelAr: "ملغى",                   tone: "off" },
  refunded:         { label: "Refunded",             labelAr: "أُعيد المبلغ",            tone: "off" },
  disputed:         { label: "Problem reported",     labelAr: "تم الإبلاغ عن مشكلة",     tone: "warn" },
};

export const ISSUE_REASONS = [
  ["not_received", "It hasn't arrived", "لم تصل بعد"],
  ["not_as_described", "Not as described", "ليست كما في الوصف"],
  ["damaged", "It arrived damaged", "وصلت تالفة"],
  ["counterfeit", "I think it's not genuine", "أظن أنها غير أصلية"],
  ["other", "Something else", "شيء آخر"],
];
