// ─────────────────────────────────────────────────────────────────────────────
//  AGREEMENTS
//
//  Fourteen tick-boxes at signup would be bad product AND weaker law. Two
//  reasons it gets split instead:
//
//    1. Bundling data consent into contract acceptance INVALIDATES the consent
//       under the PDPL and GDPR. "Agree to terms and marketing" as one tick is
//       not consent to marketing. So consent stays on its own screen.
//    2. A buyer must not be made to agree to seller obligations. Ask for the
//       seller agreement when someone opens a shop, not when they sign up to
//       browse — otherwise every clause is buried under a tick nobody read,
//       which is exactly the fact pattern that gets terms struck out.
//
//  Three surfaces, in order of when they appear:
//
//    ACCEPT        signup   — the contract. Two ticks. Required.
//    ACKNOWLEDGE   signup   — disclosures. Read, not agreed. No ticks.
//    SELLER        shop     — obligations. Per-clause ticks. Required.
//
//  Some of the fourteen areas are lili's obligations, not the user's — the
//  trade licence, VAT registration, payment licensing. Those are disclosed in
//  ACKNOWLEDGE. Asking a user to tick a box about our licence would be theatre.
// ─────────────────────────────────────────────────────────────────────────────

// v2.12: the full policies (src/legal) replace the summaries; a material
// change, so everyone is asked again, as the Terms of Use promise.
export const AGREEMENT_VERSION = "2026-10-09";

// ── signup: the contract ───────────────────────────────────────────────────
export const ACCEPT = [
  {
    id: "platform-terms",
    title: "lili's Terms of Use",
    titleAr: "شروط الاستخدام",
    body:
      "The rules for using lili itself — your account, how you behave here, " +
      "and what we can do if you break them. This is the only contract lili " +
      "is a party to.",
    bodyAr: "قواعد استخدام منصة lili — حسابك وسلوكك وما يترتب على مخالفتها.",
    required: true,
  },
  {
    id: "privacy-notice",
    title: "Privacy Notice",
    titleAr: "إشعار الخصوصية",
    body:
      "What we hold about you, why, how long, and how to get it back or have " +
      "it deleted. Your data choices are set separately on the next screen — " +
      "agreeing here does not opt you into anything.",
    bodyAr: "ما نحتفظ به عنك ولماذا وكيف تحصل عليه أو تحذفه.",
    required: true,
  },
];

// ── signup: disclosures, read not ticked ───────────────────────────────────
export const ACKNOWLEDGE = [
  {
    id: "not-the-seller",
    icon: "handshake",
    title: "lili is the marketplace, not the shop",
    titleAr: "lili سوق وليست المتجر",
    body:
      // v2.9. This said "we hold the payment until it arrives and step in if
      // it goes wrong". lili holds no money — there is no processor and no
      // escrow — and this is the sentence she taps to agree to. Telling her
      // she is covered in the document that creates the relationship is the
      // worst place in the app to be wrong.
      "Everything here belongs to the person selling it. She sets the price " +
      "and the piece is hers until you meet. Your purchase is an agreement " +
      "with her, not with us: lili does not hold your money and cannot refund " +
      "you. Check the piece before you pay, and tell us if she breaks the " +
      "rules — that part we can act on.",
    bodyAr: "كل قطعة تخص بائعتها، والشراء اتفاق معها. lili لا تحتفظ بأموالك ولا يمكنها إعادتها — تأكدي من القطعة قبل الدفع.",
  },
  {
    id: "seller-types",
    icon: "tag",
    title: "Private and business sellers owe you different things",
    titleAr: "حقوقك تختلف حسب نوع البائعة",
    body:
      "A business seller owes you statutory returns and warranties. Someone " +
      "selling her own wardrobe generally does not. Every listing says which " +
      "one you're dealing with, before you pay.",
    bodyAr: "البائعة التجارية ملزمة بالإرجاع والضمان، بخلاف البيع الشخصي.",
  },
  {
    id: "how-we-operate",
    icon: "bank",
    title: "How lili is licensed and regulated",
    titleAr: "تراخيص lili",
    body:
      "lili trades only in markets where it holds the right licence, as a " +
      "marketplace rather than a retailer. Your payment is held by a licensed " +
      "payment provider, never in a lili account. Where VAT applies to our " +
      "commission, it is shown.",
    bodyAr: "نعمل فقط في الأسواق المرخّصة، ويحتفظ مزوّد دفع مرخّص بمبلغك وليس lili.",
  },
  {
    id: "disputes",
    icon: "scales",
    title: "If something goes wrong",
    titleAr: "إذا حدث خطأ",
    body:
      "Talk to the seller first, then bring us in — we read the listing, the " +
      "messages and the tracking, and decide with reasons. Using our process " +
      "never removes your right to go to the consumer authority or to court.",
    bodyAr: "تواصلي مع البائعة أولاً ثم معنا، ويبقى حقك في اللجوء للجهات المختصة.",
  },
];

// ── opening a shop: the obligations ────────────────────────────────────────
// Built on the four clauses from the original disclaimer draft, corrected and
// extended. Per-clause ticks, because each is a distinct undertaking and
// per-clause acceptance is far better evidence than one blanket "I agree".
export const SELLER_AGREEMENT = [
  {
    id: "authenticity", stage: "listing",
    icon: "tag",
    title: "Everything I list is genuine",
    titleAr: "كل ما أعرضه أصلي",
    body:
      "No counterfeits, no replicas, no items described as another brand. " +
      "Listing a fake is grounds for removing my shop, and in this market it " +
      "can carry legal consequences for me personally.",
    bodyAr: "لا تقليد ولا نسخ. عرض قطعة مزيفة يعرّض متجري للإغلاق وقد يعرّضني للمساءلة.",
    required: true,
  },
  {
    id: "accuracy", stage: "listing",
    icon: "camera",
    title: "My photos and descriptions are honest",
    titleAr: "صوري ووصفي صادقان",
    body:
      "Photos show the actual item. Any damage, wear, repair or alteration is " +
      "disclosed in the description. Most disputes are condition disputes, and " +
      "an honest listing is what wins them.",
    bodyAr: "الصور للقطعة نفسها، وأي تلف أو تعديل مذكور بوضوح.",
    required: true,
  },
  {
    id: "merchant-of-record", stage: "listing",
    icon: "receipt",
    title: "I am the seller — lili is not",
    titleAr: "أنا البائعة، وليست lili",
    body:
      // v2.9.4. This said "I dispatch it within 3 working days with tracking"
      // and "lili runs the marketplace and holds the payment until delivery".
      // There is no shipping, no tracking and no escrow, so a seller was
      // agreeing to a dispatch obligation she cannot perform, on the strength
      // of a protection that does not exist. The sixth surface carrying the
      // escrow claim, in the document she signs.
      "The sale is between me and the buyer. I own the item, I set the price, " +
      "and I hand it over myself when we meet. lili introduces us and enforces " +
      "the rules — it does not hold the money, so the buyer pays me directly " +
      "and there is nothing for lili to refund on my behalf.",
    bodyAr: "البيع بيني وبين المشترية. أنا أسلّمها بنفسي عند اللقاء، والمشترية تدفع لي مباشرة. lili لا تحتفظ بالمبلغ ولا يمكنها إعادته نيابة عني.",
    required: true,
  },
  {
    // v2.8: this clause used to read "Chanel, Hermès, Rolex, Cartier, Van
    // Cleef and similar cannot be listed without authentication." They can.
    // There is no authentication partner, no authentication step, and the sell
    // flow lets every one of those brands through. A seller agreement is the
    // one document that must describe what the platform actually does — a
    // control promised here and absent in the code is worse than no clause,
    // because a buyer relies on it and a regulator reads it as what we said we
    // do. It now describes the real control: screening, human review, and
    // provenance photographs.
    id: "authentication", stage: "listing",
    icon: "gem",
    title: "High-value pieces get a closer look",
    titleAr: "القطع الثمينة تُراجع بعناية",
    body:
      "Chanel, Hermès, Rolex, Cartier, Van Cleef and similar are screened " +
      "before they go live, and a person reviews anything the screen flags. " +
      "Independent authentication is not offered yet — until it is, I'll show " +
      "what came with the piece: the serial or date code, the card, the receipt.",
    bodyAr:
      "القطع الفاخرة تُفحص قبل النشر، ويراجعها شخص عند وجود أي إشارة. " +
      "التوثيق المستقل غير متاح بعد — وحتى ذلك الحين أعرض ما يثبت أصل القطعة: " +
      "الرقم التسلسلي، البطاقة، الفاتورة.",
    required: true,
  },
  {
    id: "verification", stage: "payout",
    icon: "id",
    title: "I'll verify who I am before I get paid",
    titleAr: "أثبت هويتي قبل استلام المبلغ",
    body:
      "Listing needs a verified phone number. Before the first payout I'll " +
      "confirm my identity, and the payout account must be in my own name. " +
      "If I start selling at volume I'll register as a business.",
    bodyAr: "قبل أول دفعة أؤكد هويتي، ويكون الحساب باسمي. وعند البيع بكميات أسجّل كنشاط تجاري.",
    required: true,
  },
  {
    id: "own-obligations", stage: "payout",
    icon: "chart",
    title: "My own licence and tax are mine to handle",
    titleAr: "الترخيص والضريبة مسؤوليتي",
    body:
      "If I'm trading as a business I hold my own licence and account for my " +
      "own tax. lili may have to report my earnings to a tax authority, and " +
      "will tell me when it does.",
    bodyAr: "إذا كنت أتاجر فأنا أحمل ترخيصي وأتولى ضرائبي، وقد تُبلّغ lili الجهات الضريبية.",
    required: true,
  },
  {
    id: "prohibited", stage: "listing",
    icon: "ban",
    title: "I know what can't be sold here",
    titleAr: "أعرف الممنوع بيعه",
    body:
      "No weapons, alcohol, tobacco or vapes, medicines or supplements, used " +
      "intimate wear, protected-species materials, or anything bearing " +
      "religious text. Listings are screened before they go live.",
    bodyAr: "لا أسلحة ولا كحول ولا تبغ ولا أدوية ولا ملابس داخلية مستعملة ولا مواد محمية.",
    required: true,
  },
  {
    id: "strikes", stage: "payout",
    icon: "warning",
    title: "Repeat breaches close my shop",
    titleAr: "المخالفات المتكررة تُغلق متجري",
    body:
      "One breach removes the listing. Two pauses my selling for a week. " +
      "Three closes the shop and holds payouts pending review. I can contest " +
      "any strike, and a contested strike doesn't count until it's decided.",
    bodyAr: "مخالفة تُزيل القطعة، واثنتان توقفان البيع أسبوعاً، وثلاث تُغلق المتجر. ولي حق الاعتراض.",
    required: true,
  },
];

/**
 * The brief asks for a listing live in under two minutes with no friction. Eight
 * obligations before a seller's first photo is the opposite of that — and it is
 * also weaker consent, because she is agreeing to things that have not happened
 * to her yet.
 *
 * So each clause binds when it becomes real:
 *
 *   "listing" — five things that govern what she puts up. Required to publish.
 *   "payout"  — three about money, identity and penalties. Required the first
 *               time she is actually paid, which is when they start to matter.
 *
 * Same obligations, same evidence, asked at the moment each one means something.
 */
export const sellerClausesFor = (stage) =>
  SELLER_AGREEMENT.filter((c) => c.stage === stage);

export const SURFACES = {
  accept: ACCEPT,
  acknowledge: ACKNOWLEDGE,
  seller: SELLER_AGREEMENT,
};
