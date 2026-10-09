// ─────────────────────────────────────────────────────────────────────────────
//  LILI'S POLICIES — the one source
//
//  The app's policy reader, the public web pages (`npm run policies` writes
//  app/web/policies/*.html) and the markdown copies in docs/policies all come
//  from this file. Edit here, never in the outputs.
//
//  Written to describe the product as it is built today: lili lists pieces and
//  introduces people. It takes no payment, holds no money, ships nothing and
//  authenticates nothing. Buyer and seller meet in person and pay each other.
//  If the product changes (payments, delivery, authentication), these change
//  in the same pull request, and the test that reads them will say so.
//
//  These are drafts for UAE-qualified counsel. Until LEGALLY_REVIEWED is true
//  the app shows that on every policy.
//
//  Section bodies: a string is a paragraph; { list: [...] } is a bullet list.
// ─────────────────────────────────────────────────────────────────────────────

import { CRITERIA } from "../meet/places.js";
import {
  OPERATOR, POLICY_VERSION, LEGALLY_REVIEWED, MARKET, MIN_AGE, MIN_PRICE,
  OFFER_EXPIRY_HOURS, REVIEW_WINDOW_DAYS, APPEAL_WINDOW_DAYS, NOTICE_DAYS,
  STRIKES, LIMITS, RETENTION, PROCESSORS,
} from "./facts.js";

export { POLICY_VERSION, LEGALLY_REVIEWED };

const pending = (what) => `[${what}: to be completed before launch]`;
const who = OPERATOR.legalName || pending("legal entity");
const licence = OPERATOR.licence || pending("licence");
const address = OPERATOR.address || pending("registered address");
const privacyContact = OPERATOR.privacyEmail
  ? `email ${OPERATOR.privacyEmail}`
  : "use Profile → Privacy & Safety in the app";
const rightsContact = OPERATOR.rightsEmail
  ? `email ${OPERATOR.rightsEmail}`
  : "use Profile → Privacy & Safety → “Brand owner? Report a fake” in the app";
const aed = (n) => `${MARKET.currency} ${n.toLocaleString("en-US")}`;

export const POLICIES = [
  // ── 1 ──────────────────────────────────────────────────────────────────────
  {
    id: "terms",
    title: "Terms of Use",
    titleAr: "شروط الاستخدام",
    summary: "The agreement between you and lili: who can use it, what lili does and doesn't do, and what happens if the rules are broken.",
    sections: [
      { h: "Who we are", body: [
        `lili is operated by ${who}, licensed by ${licence}, registered at ${address}. In these terms “lili”, “we” and “us” mean that company.`,
        "By creating an account or using the app you agree to these terms and to the policies they link to. If you don't agree, please don't use lili.",
      ]},
      { h: "What lili is, and what it is not", body: [
        "lili is a marketplace where people list pre-owned fashion and others can find it, make offers and arrange to meet. We provide the listings, the messaging, the rules and their enforcement.",
        { list: [
          "lili does not own, hold, inspect, price or sell any item. Every piece belongs to the person selling it.",
          "lili does not take payment, hold money or issue refunds. You pay the seller directly when you meet.",
          "lili does not deliver anything. Buyer and seller hand the piece over in person.",
          "lili does not authenticate items. Nothing in the app is a guarantee that a piece is genuine.",
        ]},
        "When you buy, your agreement is with the seller, not with us. What you are owed depends on whether she sells privately or as a business; see the Seller Policy.",
      ]},
      { h: "Who can use lili", body: [
        `You must be ${MIN_AGE} or older. lili currently serves ${MARKET.name}. While we are in a private beta, opening a shop needs an invitation.`,
        "One account per person. Keep your sign-in details to yourself; you are responsible for what happens on your account.",
      ]},
      { h: "Your responsibilities", body: [
        { list: [
          "Follow the Community Guidelines, the Prohibited Items Policy and, if you sell, the Seller Policy.",
          "Describe things truthfully: listings, offers, reviews and reports.",
          "Don't use lili to harass anyone, to spam, to scrape the app, or to get around a suspension.",
          "Don't try to break, overload or reverse-engineer the service, or get at data that isn't yours.",
        ]},
      ]},
      { h: "Content you post", body: [
        "Your photos and words stay yours. You give lili a non-exclusive, royalty-free licence to host, show and resize them so the marketplace works, and to show them in lili's own app and promotion while your listing is live. The licence ends when you delete the content, except copies we must keep under the Account Deletion & Data Retention Policy.",
        "You confirm you have the right to post what you post, including photos of people who appear in them.",
      ]},
      { h: "Limits we apply", body: [
        "To stop spam and abuse, some actions have daily or hourly limits. Normal use never reaches them.",
        { list: LIMITS.map((l) => `Up to ${l.limit} ${l.what} per ${l.per}.`) },
      ]},
      { h: "When we act on an account", body: [
        "We may remove content, pause selling, suspend or close an account that breaks these terms or our policies, or where the law requires it. We tell you what we did and why, unless the law stops us, and you can appeal. The Reports, Strikes & Appeals Policy has the detail.",
        "You can stop using lili and delete your account at any time from Profile → Privacy & Safety.",
      ]},
      { h: "Our responsibility", body: [
        "We run lili with reasonable skill and care. Because we are not a party to sales, we are not responsible for the condition, legality, authenticity or handover of an item, or for what happens at a meeting between two members.",
        "The service is provided as it is and may sometimes be unavailable. Nothing in these terms limits liability that the law does not allow us to limit, including for fraud or for death or personal injury caused by negligence.",
      ]},
      { h: "Changes", body: [
        `We will tell you in the app at least ${NOTICE_DAYS} days before a change that affects you takes effect, and ask you to accept material changes again. Fixes to wording that change nothing for you may be made without notice.`,
      ]},
      { h: "Law and disputes", body: [
        `These terms are governed by ${OPERATOR.governingLaw}. The courts of Dubai have jurisdiction, without removing any right you have to complain to a consumer authority.`,
        "These terms are provided in Arabic and English. If the two differ, the Arabic text prevails.",
      ]},
    ],
  },

  // ── 2 ──────────────────────────────────────────────────────────────────────
  {
    id: "privacy",
    title: "Privacy Notice",
    titleAr: "إشعار الخصوصية",
    summary: "What lili holds about you, why, who else handles it, how long it's kept, and your rights over it.",
    sections: [
      { h: "Who is responsible", body: [
        `${who} is the controller of your personal data, under the UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021). To ask about your data or use your rights, ${privacyContact}.`,
      ]},
      { h: "What we hold, and why", body: [
        { list: [
          "Account: your email address, how you signed in, and your year of birth (to confirm you are an adult). Needed to provide the service.",
          "Your country and data choices: so the app applies the right rules and respects what you allowed.",
          "Shop and listings: shop name, bio, the pieces you list, their photos, prices, sizes and condition. Public by design, because the point of a listing is that people see it.",
          "Messages and meet-up plans: what you and the other person write, and the place and time you agree. Only the two of you can read them.",
          "Offers, saves, follows, saved searches and reviews: to run those features. Reviews are public; the rest is private to you, except that a seller sees the offers made to her.",
          "Reports you make, and moderation decisions about you: to keep the marketplace safe and to answer appeals.",
          "Crash reports: the error message, app version, platform and screen, with email addresses, numbers and web addresses removed. Linked to your account if you are signed in, so we can fix what you hit.",
          "Usage analytics: which screens and features are used. Only if you turned on “Help us fix what's broken”.",
          "Push notification token: only if you allow notifications on your phone.",
        ]},
        "We don't collect your location. Photos are redrawn on your phone before upload, which removes the hidden data cameras add, including GPS position. We don't sell personal data and we don't show third-party advertising.",
      ]},
      { h: "Your choices", body: [
        "Three choices are separate from agreeing to the terms, and you can change them at any time in Profile → Privacy & Safety → Data choices:",
        { list: [
          "Help us fix what's broken: usage analytics.",
          "Show me things I'd actually love: ordering the feed by your sizes and taste. Worked out on your phone.",
          "Tell me about new drops: marketing messages. Always off unless you turn it on.",
        ]},
      ]},
      { h: "Who else handles it", body: [
        "We use these providers to run lili. They act on our instructions and may not use your data for their own purposes:",
        { list: PROCESSORS.map((p) => `${p.name}: ${p.role}. Location: ${p.where}.`) },
        "Your data is therefore stored outside the UAE, in the European Union. We rely on the safeguards the UAE Personal Data Protection Law requires for transfers abroad. We may also disclose data where the law requires it, for example to the police with a valid request.",
        "When you report a conversation you can choose to attach it. Only then can a moderator read it, and only for that case.",
      ]},
      { h: "How long we keep it", body: [
        { list: RETENTION.map((r) => `${r.what}: ${r.keep}.`) },
      ]},
      { h: "Your rights", body: [
        "You can see what we hold, get a copy, correct it, delete it, object to or restrict some uses, and withdraw any choice you gave. The app does most of this directly:",
        { list: [
          "Get a copy: Profile → Privacy & Safety → Get a copy of my data.",
          "Delete everything: Profile → Privacy & Safety → Delete my account.",
          "Change your choices: Profile → Privacy & Safety → Data choices.",
        ]},
        `For anything else, ${privacyContact}. We aim to answer within 30 days. You can also complain to the UAE Data Office.`,
      ]},
      { h: "Children", body: [
        `lili is for people aged ${MIN_AGE} and over. If we learn an account belongs to someone younger, we close it and delete its data.`,
      ]},
      { h: "Security", body: [
        "Data is encrypted in transit. Access is restricted row by row in the database, so each person can reach only their own private data. Your sign-in session is kept in the app's private storage on your phone. No system is perfectly secure; if a breach affects you, we will tell you and the regulator as the law requires.",
      ]},
      { h: "Changes", body: [
        "If we change how we use your data, we will tell you in the app before it happens, and ask again where your agreement is needed.",
      ]},
    ],
  },

  // ── 3 ──────────────────────────────────────────────────────────────────────
  {
    id: "seller",
    title: "Seller Policy",
    titleAr: "سياسة البائعات",
    summary: "What you agree to when you open a shop: you are the seller, what you may list, how to describe it, and what buyers are owed.",
    sections: [
      { h: "You are the seller", body: [
        "When you sell on lili, the sale is between you and the buyer. You set the price, you own the piece until it changes hands, and you are responsible for it being as described and lawful to sell. lili is not a party to the sale.",
      ]},
      { h: "Private or business seller", body: [
        "Choose the right type when you open your shop, and change it if your situation changes:",
        { list: [
          "Private seller: you are selling your own things occasionally. Buyers get what you describe, but not statutory returns.",
          "Business seller: you buy to resell, sell in volume, or sell as part of a trade. You must hold any licence your trade needs, and buyers have consumer rights against you under UAE law, including returns and warranties.",
        ]},
        "Listings that read like trade (bulk stock, invoices, many of the same item) from a private shop are flagged, because the buyer's rights depend on getting this right.",
      ]},
      { h: "What you may list", body: [
        `Pre-owned fashion you own: clothing, bags, shoes, jewellery and accessories. The minimum price is ${aed(MIN_PRICE)}. The Prohibited Items Policy lists what may never be sold.`,
      ]},
      { h: "Describe it truthfully", body: [
        { list: [
          "Use your own photos of the actual piece. No stock or catalogue images.",
          "State the condition honestly and show flaws: marks, repairs, missing parts, odours.",
          "Give the size and, where you can, measurements and fit.",
          "Name the brand only if the piece is genuinely that brand. Show proof you have: receipt, card, serial, dust bag.",
        ]},
      ]},
      { h: "Before a listing goes live", body: [
        "Every listing is screened automatically. Some are published straight away, some go to a person for review, and some are refused, for example if the wording describes a copy or the item is prohibited. If yours is held or refused, the app tells you why and what would fix it.",
      ]},
      { h: "Offers and reservations", body: [
        `Buyers may make offers. An offer expires after ${OFFER_EXPIRY_HOURS} hours if you don't answer. When you accept one, the piece is reserved for that buyer and other offers on it are declined. Release the reservation in the app if the sale falls through; don't sell a reserved piece to someone else.`,
      ]},
      { h: "Keep it on lili", body: [
        "Keep conversations about a sale in lili's messages until you meet. Messages there can't be edited after sending, and they are what we can look at if something goes wrong.",
      ]},
      { h: "Fees", body: [
        "lili charges sellers no fee during the beta. Before any fee starts, we will tell you the amount and give you the chance to close your shop first.",
      ]},
      { h: "Breaking the rules", body: [
        "Breaches lead to strikes under the Reports, Strikes & Appeals Policy, and serious or repeated breaches close the shop.",
      ]},
    ],
  },

  // ── 4 ──────────────────────────────────────────────────────────────────────
  {
    id: "prohibited",
    title: "Prohibited & Restricted Items",
    titleAr: "المواد المحظورة والمقيّدة",
    summary: "What can never be listed on lili, and why.",
    sections: [
      { h: "Never allowed", body: [
        { list: [
          "Counterfeits, replicas, “inspired by”, “dupe” or “mirror quality” items, or anything sold as a brand it isn't.",
          "Items made from protected species (ivory, tortoiseshell, python, crocodile, alligator, shahtoosh and similar) unless legal export and sale papers can be shown, which lili cannot verify, so they are not accepted.",
          "Weapons of any kind, including knives, tasers and pepper spray.",
          "Medicines, supplements and anything needing a prescription.",
          "Alcohol, tobacco, vapes and shisha products.",
          "Used underwear, lingerie, swimwear and socks.",
          "Stolen goods, or anything you don't have the right to sell.",
          "Items that are illegal in the UAE, offend public morals, or insult any religion.",
          "Recalled or unsafe items.",
          "Services, gift cards, vouchers, digital goods and anything that isn't a physical fashion piece.",
        ]},
      ]},
      { h: "Allowed with care", body: [
        { list: [
          "Fine jewellery and watches: describe metals and stones accurately and show any certificate or proof of purchase.",
          "Vintage pieces: say what is original and what has been repaired or altered.",
        ]},
      ]},
      { h: "What happens", body: [
        "Prohibited listings are refused or removed, and usually count as a strike. Anything that looks like a crime may be reported to the authorities.",
      ]},
    ],
  },

  // ── 5 ──────────────────────────────────────────────────────────────────────
  {
    id: "authenticity",
    title: "Authenticity & Intellectual Property",
    titleAr: "الأصالة والملكية الفكرية",
    summary: "lili's position on counterfeits, what lili does and doesn't check, and how brand owners report infringement.",
    sections: [
      { h: "Zero tolerance for fakes", body: [
        "Selling a counterfeit is a breach of this policy and of UAE law. A shop that sells one is closed.",
      ]},
      { h: "What lili checks, and what it doesn't", body: [
        "Every listing is screened for signs of a copy: wording, price far below what a genuine piece costs, and missing provenance. Suspect listings go to a person before they go live.",
        "This screening reduces risk. It is not authentication, and lili does not certify any item as genuine. Check the piece in person before you pay, and ask for proof of purchase.",
      ]},
      { h: "Brand owners and rights holders", body: [
        `If a listing infringes your trademark, copyright or design, ${rightsContact}. Tell us who you are, what you own, which listing, and why it infringes. We act on complete notices promptly and tell the seller what was removed and why.`,
        "A seller who believes a takedown was wrong can send a counter-notice through the appeal route. Repeat infringers lose their shop.",
      ]},
      { h: "Photos and descriptions", body: [
        "Use only photos you took or have permission to use. Copying another seller's photos or descriptions is not allowed.",
      ]},
    ],
  },

  // ── 6 ──────────────────────────────────────────────────────────────────────
  {
    id: "community",
    title: "Community Guidelines",
    titleAr: "إرشادات المجتمع",
    summary: "How to treat each other on lili.",
    sections: [
      { h: "Be respectful", body: [
        { list: [
          "No harassment, threats, insults, or unwanted romantic or sexual messages.",
          "No discrimination on the basis of nationality, ethnicity, religion, disability or any other personal characteristic.",
          "No sharing someone else's personal information, photos or messages without their consent.",
        ]},
      ]},
      { h: "Be honest", body: [
        { list: [
          "No fake accounts, impersonation, or multiple accounts to get round limits or suspensions.",
          "No fake offers, fake reviews, or reviews in exchange for anything.",
          "No spam, chain messages or advertising unrelated to a listing.",
        ]},
      ]},
      { h: "Be reliable", body: [
        "Reply to offers and messages, turn up when you agreed to, and cancel in the app if plans change. Repeated no-shows are a breach.",
      ]},
      { h: "Blocking and reporting", body: [
        "You can block a seller: her shop and listings disappear from your feed and search on this phone. If someone is bothering you, report them from the listing, shop or conversation, and stop replying; we can restrict their account.",
      ]},
    ],
  },

  // ── 7 ──────────────────────────────────────────────────────────────────────
  {
    id: "safety",
    title: "Meeting & Safety",
    titleAr: "اللقاء والسلامة",
    summary: "How to hand a piece over safely in person, and what to do if something goes wrong.",
    sections: [
      { h: "Choose a good place", body: [
        "lili suggests kinds of place, not addresses, and none is supervised or approved by the police. Judge any place by these tests:",
        { list: CRITERIA.map((c) => `${c.label}. ${c.why}`) },
        "Never meet at a home address, and never in a car park after dark.",
      ]},
      { h: "Before you go", body: [
        { list: [
          "Agree the place and time in lili's meet-up plan, so there is a record.",
          "Tell a friend where you're going and when.",
          "Keep the conversation in lili.",
        ]},
      ]},
      { h: "At the meeting", body: [
        { list: [
          "Check the piece before you pay: condition, size, labels, serials, and anything the listing promised.",
          "Pay only when you are happy, and only in a way you are comfortable with.",
          "If anything feels wrong, leave. You never need a reason.",
        ]},
      ]},
      { h: "If something goes wrong", body: [
        "In an emergency, call 999. For Dubai Police non-emergencies, call 901. Then report the member in lili so we can act on their account.",
      ]},
    ],
  },

  // ── 8 ──────────────────────────────────────────────────────────────────────
  {
    id: "payments",
    title: "Payments & Scams",
    titleAr: "الدفع والاحتيال",
    summary: "lili doesn't handle money. How payment works between members, and how to spot a scam.",
    sections: [
      { h: "How payment works", body: [
        "lili takes no payment and holds no money. You pay the seller directly, at the meeting, once you have checked the piece. Because lili never has the money, lili cannot refund it.",
      ]},
      { h: "Signs of a scam", body: [
        { list: [
          "A request for a deposit, a “holding fee” or a bank transfer before you have seen the piece.",
          "Pressure to move the conversation to WhatsApp, email or another app.",
          "An offer to post the piece, or to send a courier, so you never meet.",
          "A link to pay on a website, or a message claiming to be from lili asking for card details. lili never asks for payment details.",
          "A price far below what the piece is worth, with a story about why.",
        ]},
        "If you see any of these, stop and report the member.",
      ]},
      { h: "If you lost money", body: [
        "Report it to the police (Dubai Police: 901, or the eCrime service) and to your bank, then report the member in lili with what happened. We will act on the account and keep the evidence for the police.",
      ]},
    ],
  },

  // ── 9 ──────────────────────────────────────────────────────────────────────
  {
    id: "offers",
    title: "Offers & Reservations",
    titleAr: "العروض والحجز",
    summary: "How offers, counter-offers and reservations work.",
    sections: [
      { h: "Making an offer", body: [
        `You can offer any amount at or above the ${aed(MIN_PRICE)} minimum. An offer can't be changed once sent, by either side. The seller has ${OFFER_EXPIRY_HOURS} hours to accept, decline or counter, after which it expires.`,
        "An offer is a serious intention to buy, not a binding contract. The sale happens when you meet and pay.",
      ]},
      { h: "Acceptance and reservation", body: [
        "When the seller accepts, the piece is reserved for you and other offers on it are declined. Other buyers see it as reserved. Either of you can release the reservation in the app if the sale isn't going ahead.",
      ]},
      { h: "Fair play", body: [
        "Don't make offers you don't intend to keep, and don't accept an offer while selling the piece elsewhere. Both count as breaches of the Community Guidelines.",
      ]},
    ],
  },

  // ── 10 ─────────────────────────────────────────────────────────────────────
  {
    id: "reviews",
    title: "Reviews & Trust Signals",
    titleAr: "التقييمات ومؤشرات الثقة",
    summary: "Who can review whom, and how the trust signals on shops are earned.",
    sections: [
      { h: "Who can review", body: [
        `Only someone who completed a meet-up with a shop can review it, once per meet-up, within ${REVIEW_WINDOW_DAYS} days. That way every review comes from a real handover.`,
      ]},
      { h: "What a review must be", body: [
        "Your own honest experience of the piece and the handover. No offensive language, personal information, or reviews offered or requested in exchange for anything.",
      ]},
      { h: "Ratings and counts", body: [
        "A shop's rating and counts are shown only once they are earned from real activity. lili never shows invented ratings, and demonstration shops are marked as samples.",
      ]},
      { h: "Removal", body: [
        "We remove reviews that break this policy. We don't remove a review only because it is negative.",
      ]},
    ],
  },

  // ── 11 ─────────────────────────────────────────────────────────────────────
  {
    id: "moderation",
    title: "Reports, Strikes & Appeals",
    titleAr: "البلاغات والمخالفات والاعتراض",
    summary: "How reports are handled, how strikes work, and how to appeal a decision.",
    sections: [
      { h: "Reporting", body: [
        "Anyone can report a listing, a shop or a conversation. A person reviews every report. The person who reported and the member concerned are both told the outcome and the reason.",
      ]},
      { h: "Strikes", body: [
        "A decision against a shop adds strikes to it:",
        { list: STRIKES.ladder.map((s) => `${s.decision} (${s.strikes} strike${s.strikes > 1 ? "s" : ""}).`) },
        `A shop that reaches ${STRIKES.closeAt} strikes in total is closed. Serious breaches, such as counterfeits, threats or fraud, can close a shop with a single decision.`,
      ]},
      { h: "Appeals", body: [
        `The person a decision is about can appeal it within ${APPEAL_WINDOW_DAYS} days, from Profile → Privacy & Safety → My reports and decisions. Say why the decision was wrong and attach what supports it. A different moderator from the one who decided reviews the appeal. If it succeeds, the strike is removed, a removed listing goes back up, and a suspension is lifted unless another decision still requires it. Either way, you are told the outcome and the reason.`,
        "Appealing never removes your right to go to a court or a consumer authority.",
      ]},
      { h: "What we keep", body: [
        "Decisions and the evidence behind them are kept for 24 months from the decision, so we can answer appeals and legal claims, and then deleted.",
      ]},
    ],
  },

  // ── 12 ─────────────────────────────────────────────────────────────────────
  {
    id: "deletion",
    title: "Account Deletion & Data Retention",
    titleAr: "حذف الحساب والاحتفاظ بالبيانات",
    summary: "How to delete your account, what is removed, and what is kept and for how long.",
    sections: [
      { h: "How to delete your account", body: [
        "In the app: Profile → Privacy & Safety → Delete my account. It takes effect immediately and can't be undone. If you can't open the app, use the public account deletion page or contact us as set out in the Privacy Notice.",
      ]},
      { h: "What is removed", body: [
        "Your account, profile, shop, listings and their photos, saves, follows, saved searches, offers, push tokens and data choices.",
      ]},
      { h: "What stays, and why", body: [
        { list: [
          "Messages you sent stay visible to the person you sent them to, with your name removed, because they are part of that person's conversation too.",
          "Reviews you wrote stay, without your name, so a shop's record remains accurate.",
          "Moderation decisions about you, and the evidence behind them, for 24 months from the decision, for appeals and legal claims.",
        ]},
      ]},
      { h: "Retention periods", body: [
        { list: RETENTION.map((r) => `${r.what}: ${r.keep}.`) },
      ]},
    ],
  },
];

export const policyById = (id) => POLICIES.find((p) => p.id === id) || null;

/** Plain text of a policy, for tests and search. */
export function policyText(p) {
  const flat = (b) => (typeof b === "string" ? b : (b.list || []).join("\n"));
  return [p.title, p.summary, ...p.sections.flatMap((s) => [s.h, ...s.body.map(flat)])].join("\n");
}
