// ─────────────────────────────────────────────────────────────────────────────
//  DELIVERY IN THE UAE AND THE GCC
//
//  Yaga's idea, carried over: a seller switches on every way she's happy to get
//  a piece to a buyer, picks the parcel size once, and the buyer chooses at
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
  { key: "meet", name: "Meet in person", regions: ["UAE"],
    about: "Hand it over somewhere busy and public. No delivery fee." },
  { key: "aramex", name: "Aramex", regions: ["UAE", "GCC"],
    about: "Door to door. Drop it at an Aramex counter or book a pickup.",
    track: (n) => `https://www.aramex.com/track/results?ShipmentNumber=${encodeURIComponent(n)}` },
  { key: "emirates_post", name: "Emirates Post", regions: ["UAE"],
    about: "Post it from any Emirates Post office, delivered to the door." },
  { key: "quiqup", name: "Quiqup same-day", regions: ["UAE"],
    about: "A rider collects from you and delivers the same day." },
  { key: "smsa", name: "SMSA Express", regions: ["UAE", "GCC"],
    about: "Covers Saudi Arabia and the Gulf. Drop off at an SMSA branch." },
  { key: "dhl", name: "DHL Express", regions: ["UAE", "GCC"],
    about: "Express across the UAE and the GCC. Drop off at a DHL point or book a pickup.",
    track: (n) => `https://www.dhl.com/ae-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(n)}` },
];
export const COURIERS = CARRIERS.filter((c) => c.key !== "meet");
export const carrier = (key) => CARRIERS.find((c) => c.key === key) || null;

/** Parcel sizes, the way couriers in the region price them. */
export const PARCEL_SIZES = [
  { key: "XS", label: "Extra small", fits: "Jewellery, a scarf, sunglasses", dims: "up to 30 × 20 × 5 cm · 0.5 kg" },
  { key: "S",  label: "Small",       fits: "A top, a dress, a small bag",   dims: "up to 40 × 30 × 10 cm · 1 kg" },
  { key: "M",  label: "Medium",      fits: "Shoes in their box, a handbag", dims: "up to 45 × 35 × 20 cm · 3 kg" },
  { key: "L",  label: "Large",       fits: "A coat, boots, a large bag",    dims: "up to 60 × 40 × 40 cm · 5 kg" },
  { key: "XL", label: "Extra large", fits: "A bundle, a suitcase-size bag", dims: "up to 60 × 50 × 60 cm · 10 kg" },
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
  { code: "AE", name: "United Arab Emirates", region: "UAE" },
  { code: "SA", name: "Saudi Arabia", region: "GCC" },
  { code: "KW", name: "Kuwait", region: "GCC" },
  { code: "QA", name: "Qatar", region: "GCC" },
  { code: "BH", name: "Bahrain", region: "GCC" },
  { code: "OM", name: "Oman", region: "GCC" },
];
export const regionFor = (code) => (COUNTRIES.find((c) => c.code === code) || COUNTRIES[0]).region;

// The order rules the database enforces (migration 33). The policies quote
// these through legal/facts.js and the research suite checks both agree.
export const SHIP_WITHIN_DAYS = 4;
export const AUTO_RELEASE_DAYS = 14;
export const UNPAID_MINUTES = 30;

export const ORDER_STATES = {
  awaiting_payment: { label: "Waiting for payment", tone: "wait" },
  paid:             { label: "Paid · to be sent",    tone: "act" },
  shipped:          { label: "On its way",           tone: "act" },
  completed:        { label: "Completed",            tone: "done" },
  cancelled:        { label: "Cancelled",            tone: "off" },
  refunded:         { label: "Refunded",             tone: "off" },
  disputed:         { label: "Problem reported",     tone: "warn" },
};

export const ISSUE_REASONS = [
  ["not_received", "It hasn't arrived"],
  ["not_as_described", "Not as described"],
  ["damaged", "It arrived damaged"],
  ["counterfeit", "I think it's not genuine"],
  ["other", "Something else"],
];
