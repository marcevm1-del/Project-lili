// ─────────────────────────────────────────────────────────────────────────────
//  WHERE TO MEET
//
//  lili holds no money. There is no escrow, no shipping and no refund, so every
//  transaction on this platform ends with two women standing in front of each
//  other, and that moment is the whole of the safety story.
//
//  ── the thing this must not do
//
//  Many marketplaces publish "safe exchange zones" — car parks outside police
//  stations, lobbies with cameras, formally designated by a force that has
//  agreed to it. Several US departments run them.
//
//  **There is no such programme in Dubai.** I looked. What Dubai Police
//  publishes about online trading concerns fake advertisements, cloned websites
//  and AI-assisted fraud calls; there is no designated meeting-point scheme and
//  no list of approved locations. So this file offers CRITERIA and EXAMPLES a
//  woman chooses from, and says in as many words that these are busy public
//  places rather than verified or supervised ones.
//
//  A badge implying a police-approved location that does not exist would be the
//  most dangerous fabrication this codebase could contain — worse than the
//  invented review counts, worse than the escrow that was not there — because
//  she would act on it, alone, with a stranger.
//
//  ── why a list at all, then
//
//  Because "meet somewhere public" is advice, and a list is a decision. The
//  criteria below are the reason each kind of place is on it, and every entry
//  is a category of place rather than a specific address, so nothing here
//  becomes stale or reads as an endorsement of one mall over another.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What makes a handover place a good one. Shown to her, not just applied.
 *
 * These are the ordinary properties of a safe public exchange — busy, staffed,
 * covered, easy to leave — and they are stated so she can judge a place we have
 * never heard of by the same test.
 */
export const CRITERIA = [
  { key: "busy",    label: "Busy with other people", why: "Nobody behaves badly in front of an audience." },
  { key: "staffed", label: "Somebody works there",   why: "A café, a counter, a security desk — a person you could speak to." },
  { key: "indoor",  label: "Indoors and lit",        why: "In summer that is also the only comfortable option." },
  { key: "transit", label: "Easy to leave",          why: "Metro, taxi rank or your own car within sight. You should never need permission to go." },
  { key: "daytime", label: "In daylight hours",      why: "Nothing about a resale sale needs to happen at 11pm." },
];

/**
 * Kinds of place, not addresses.
 *
 * A specific mall goes out of business, renames itself, or becomes the one
 * place the app is quietly steering everyone to. A category stays true, and she
 * knows her own city better than a list does.
 */
export const PLACES = [
  { key: "mall",      label: "A mall",              labelAr: "مول",
    hint: "The food court or a coffee shop on the ground floor. Busy, indoors, staffed, cameras.",
    icon: "shops",   meets: ["busy", "staffed", "indoor", "transit"] },
  { key: "cafe",      label: "A café",              labelAr: "مقهى",
    hint: "Somewhere with tables and a counter. Order something; it buys you both time.",
    icon: "chat",    meets: ["busy", "staffed", "indoor"] },
  { key: "metro",     label: "A metro station",     labelAr: "محطة مترو",
    hint: "Inside the concourse, not the car park. Staffed, filmed, and neither of you needs a car.",
    icon: "truck",   meets: ["busy", "staffed", "indoor", "transit"] },
  { key: "lobby",     label: "A building lobby",    labelAr: "لوبي",
    hint: "A residential or office lobby with a concierge — yours or hers. Ask the desk first.",
    icon: "home",    meets: ["staffed", "indoor"] },
  { key: "workplace", label: "Outside her work",    labelAr: "أمام مكان العمل",
    hint: "A reception at lunchtime. Public, and she is somewhere she is known.",
    icon: "id",      meets: ["busy", "staffed", "daytime"] },
  { key: "other",     label: "Somewhere else",      labelAr: "مكان آخر",
    hint: "Anywhere that is busy, staffed and easy to leave. Say where in the message.",
    icon: "palm",    meets: [] },
];

export const placeByKey = (k) => PLACES.find((p) => p.key === k) || PLACES[PLACES.length - 1];

/**
 * Places we will not suggest, and why she is told rather than just steered.
 *
 * The refusal is the useful part. A woman who is asked to come to a flat and
 * has read this knows the ask itself is the warning sign, which no amount of
 * "meet in public" gets across.
 */
export const AVOID = [
  ["Her home, or yours", "The most common thing that goes wrong is not a fake bag. Being asked to come inside is itself the signal."],
  ["A car park",         "Quiet, badly lit, and it is where you are least likely to be interrupted."],
  ["After dark, alone",  "If the only time she can meet is late and out of the way, that is an answer."],
];

/**
 * Reporting, outside lili.
 *
 * lili can remove a listing and close a shop. It cannot do anything else, and
 * saying so alongside the numbers that can is the honest shape of this screen.
 *
 * 999 is the UAE emergency number; 901 is Dubai Police's non-emergency line;
 * ecrime.ae is the UAE's official online-crime reporting platform, which Dubai
 * Police names in its own fraud guidance.
 */
export const OUTSIDE_HELP = [
  { label: "999",        what: "Emergency, anywhere in the UAE. If you feel unsafe right now, this, not us." },
  { label: "901",        what: "Dubai Police, non-emergency." },
  { label: "ecrime.ae",  what: "The UAE's official platform for reporting online crime and fraud." },
];

/** The three things that matter, in order, and each one enforced or explained. */
export const RULES = [
  { key: "public",
    title: "Meet somewhere public",
    titleAr: "التقيا في مكان عام",
    why: "Busy, staffed, indoors, easy to leave. Suggest the place in the app so it is written down and you both agreed to it." },
  { key: "in-app",
    title: "Keep it in lili",
    titleAr: "أبقيا المحادثة داخل lili",
    why: "A conversation that moves to WhatsApp is one we cannot read if you report her, and one you cannot attach as evidence." },
  { key: "check",
    title: "Check it before you pay",
    titleAr: "تأكدي قبل الدفع",
    why: "Serial, stitching, hardware, the flaws in the photographs. lili does not hold your money, so this is the moment — and it is the only one." },
];
