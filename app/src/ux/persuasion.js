// ─────────────────────────────────────────────────────────────────────────────
//  THE PSYCHOLOGY, AND THE HALF OF IT THIS APP REFUSES
//
//  Most of what is written about persuasion in interfaces is the same handful
//  of findings — scarcity, social proof, urgency, anchoring, loss aversion —
//  and almost all of it can be deployed two ways. The finding does not tell
//  you which. This file is where the line is drawn, because "apply psychology
//  to the UI" and "manipulate a woman into buying a bag" describe the same
//  literature.
//
//  ── the test
//
//  A technique is allowed here when it makes a TRUE thing easier to see, act
//  on or remember. It is refused when it manufactures a feeling the facts do
//  not support.
//
//  Scarcity is the clean example. "One of these, and it is second-hand" is
//  true of every listing on lili — it is the nature of resale, and saying so
//  helps a buyer decide. "3 people are looking at this right now" is a
//  sentence about a number nobody is counting. Same finding, opposite sides of
//  the line.
//
//  ── why this is a file and not a policy document
//
//  Because a policy document does not fail a build. `npm run research` runs
//  REFUSED over the source and the dictionary, in both languages, the same way
//  the claims register's NEVER_CLAIM patterns run. This project has removed
//  twelve false claims that were each written by somebody reasonable trying to
//  be helpful; the guard is what stops the thirteenth.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Techniques in use, and the true thing each one is attached to.
 *
 * `attachedTo` is the load-bearing field. A persuasive technique with nothing
 * true behind it is the definition of the thing on the other list.
 */
export const IN_USE = [
  {
    id: "goal-gradient",
    law: "Goal-gradient effect — motivation rises as the end gets closer",
    used: "The listing flow names the step and how many are left.",
    attachedTo: "The steps are real and there are genuinely that many.",
  },
  {
    id: "zeigarnik",
    law: "Zeigarnik effect — an unfinished task stays in mind",
    used: "An abandoned listing is kept and offered back: 'Picked up where you left off.'",
    attachedTo: "The draft is really on the device, photographs and all.",
  },
  {
    id: "endowment",
    law: "Endowment effect — you value what feels already yours",
    used: "Saved pieces and the list persist, and are hers before any account exists.",
    attachedTo: "They do persist. Nothing is lost on close.",
  },
  {
    id: "peak-end",
    law: "Peak-end rule — an experience is remembered by its peak and its end",
    used: "A published listing ends on what she made, shown as a buyer will see it. " +
          "A report ends with what happens next. An erasure ends with a receipt of counts.",
    attachedTo: "Each of those endings states something that actually happened.",
  },
  {
    id: "recognition",
    law: "Recognition over recall",
    used: "Search offers what is genuinely in stock now rather than an empty box.",
    attachedTo: "The terms are taken from live listings, not invented demand.",
  },
  {
    id: "anchoring",
    law: "Anchoring — the first number frames the rest",
    used: "The offer sheet shows the published resale band before she types a figure.",
    attachedTo: "The band comes from the resale model and says nothing when it has " +
                "no basis for an opinion.",
  },
  {
    id: "loss-aversion",
    law: "Loss aversion — a loss weighs more than an equivalent gain",
    used: "Stated as reassurance, never as threat: 'your draft is saved', not " +
          "'you'll lose your work'.",
    attachedTo: "It is saved. The sentence is a fact, and the framing is the choice.",
  },
  {
    id: "scarcity-true",
    law: "Scarcity — a scarce thing is valued more",
    used: "One listing is one specific second-hand piece, and the app says so — " +
          "which is also why quantity was removed from the cart.",
    attachedTo: "It is literally true of resale. Nothing is manufactured to make it so.",
  },
];

/**
 * Refused, and why.
 *
 * Every pattern below works. That is the problem: each one reliably moves a
 * number, and each one does it by putting a belief in somebody's head that
 * nothing in this system supports.
 */
export const REFUSED = [
  { id: "fake-viewers",
    re: /\b\d+\s*(people|others|women|shoppers?)\s*(are\s*)?(viewing|looking|watching)/i,
    because: "Nobody is counting who is looking at a listing. The sentence would be invented." },
  { id: "fake-stock-pressure",
    re: /\b(only\s*\d+\s*left|almost\s*gone|selling\s*fast|going\s*fast|nearly\s*sold\s*out)/i,
    because: "Every listing is one piece. Dressing that up as a countdown is manufacturing " +
             "a feeling the fact does not carry." },
  { id: "countdown",
    re: /\b(hurry|ends\s*in\s*\d|expires\s*in\s*\d+\s*(min|sec)|last\s*chance|don'?t\s*miss\s*out)/i,
    because: "There is no deadline. An offer expiry is a real clock and is shown as one; " +
             "a manufactured one is a lie with a timer on it." },
  { id: "fabricated-social-proof",
    re: /\b(trusted\s*by\s*[\d,]+|join\s*[\d,]+\+?\s*(women|shoppers|sellers)|[\d,]{4,}\s*\+?\s*happy)/i,
    because: "This app carried 'Trusted by 10,000+ women in Dubai' over five filled stars " +
             "and a 4.9 from '2,000+ reviews'. None of those women existed. Removed in v2.8, " +
             "and this is what stops it coming back." },
  { id: "invented-rating",
    re: /\brating:\s*[45]\.\d|\breviews:\s*\d{2,}/,
    because: "A rating is shown once real buyers have left one, and not before." },
  { id: "confirmshaming",
    re: /\b(no\s*thanks,?\s*I|I\s*don'?t\s*want\s*(to\s*save|better)|maybe\s*later,?\s*I'?ll)/i,
    because: "A decline button that makes her say something diminishing about herself. " +
             "The word for it is confirmshaming and it is beneath this product." },
  { id: "false-urgency-price",
    re: /\b(price\s*(goes\s*up|rises)\s*(in|soon)|today\s*only|flash\s*sale\s*ends)/i,
    because: "Sellers set prices. lili does not run sales and cannot promise a price will move." },
  { id: "pre-ticked",
    re: /\bdefaultChecked\b|\bchecked=\{true\}/,
    because: "Consent that arrives already given is not consent. Every box in this app " +
             "starts empty, and the compliance suite asserts it." },

  // ── v2.11.4: the rest of the taxonomy, named ────────────────────────────────
  //
  // The eight above were the ones this app had actually shown or nearly shown.
  // These are the remaining families in the literature — the Brignull dark
  // pattern set and the EU/CMA enforcement lists — written down so that
  // "apply dark psychology" has a specific answer instead of an argument.
  //
  // Two things make them non-negotiable here beyond taste. Google Play's
  // Deceptive Behaviour policy rejects most of them outright, and UAE Federal
  // Law 15/2020 on Consumer Protection requires that price and terms be clear
  // before commitment. A marketplace where a woman meets a stranger in a mall
  // car park with AED 3,000 in her bag runs entirely on whether she believes
  // what the screen told her. Manipulation is not merely wrong here; it is the
  // fastest way to destroy the only asset the product has.
  { id: "drip-pricing",
    re: /\b(plus\s*fees\s*at\s*checkout|final\s*price\s*shown\s*(at|on)\s*checkout|excludes?\s*(all\s*)?fees)/i,
    because: "Every cost is shown where the number is shown. Revealing a fee after " +
             "she has committed is drip pricing, and it is the single most complained-of " +
             "pattern in online retail." },
  { id: "roach-motel",
    re: /\b(contact\s*(us|support)\s*to\s*(cancel|delete|close)|call\s*us\s*to\s*(cancel|delete)|cannot\s*be\s*undone\s*online)/i,
    because: "Anything she can start in the app she can end in the app. Deletion is " +
             "in-app AND on a public page — easy in, easy out, and Play requires it." },
  { id: "forced-continuity",
    re: /\b(auto[- ]?renews?\s*unless|will\s*be\s*charged\s*unless\s*you|free\s*trial\s*converts)/i,
    because: "There is no subscription. If one ever exists it is opt-in and cancellable " +
             "in one screen, never a silent conversion." },
  { id: "obstruction",
    re: /\b(are\s*you\s*sure\s*you\s*want\s*to\s*miss|before\s*you\s*go,?\s*(wait|hold)|one\s*more\s*step\s*to\s*keep)/i,
    because: "Making the exit harder than the entrance. A woman who wants to leave " +
             "should be able to, on the first tap." },
  { id: "nagging",
    re: /\b(remind\s*me\s*later['"]?\s*,?\s*again|ask\s*again\s*(in|after)\s*\d|re-?prompt\s*until)/i,
    because: "A prompt she declined is a decision, not a round in a negotiation. " +
             "push.js refuses to raise an OS prompt at all while no sender exists, " +
             "because an OS prompt is a promise." },
  { id: "friend-spam",
    re: /\b(invite\s*(your\s*)?contacts|import\s*(your\s*)?address\s*book|find\s*friends\s*from\s*your\s*(contacts|phone))/i,
    because: "Her contacts are other people's data and were never consented by them. " +
             "The invite system uses codes she chooses to share." },
  { id: "disguised-promotion",
    re: /\b(featured\s*(pick|choice)\b(?!.*\bpaid\b)|editor'?s\s*pick|recommended\s*for\s*you\s*by\s*lili)/i,
    because: "Nothing here is promoted, and if placement is ever sold it will be " +
             "labelled as paid. A ranked position that looks like an opinion and is " +
             "actually an invoice is an advert wearing the interface's clothes." },
  { id: "bait-and-switch",
    re: /\b(starting\s*from\s*AED\s*\d+\s*\*|prices?\s*from\s*AED\s*\d+\s*(?:\*|†)|up\s*to\s*\d+%\s*off\*)/i,
    because: "Sellers set prices and lili runs no sales, so any headline number with " +
             "an asterisk on it is describing something that does not exist." },
];

/** A technique with nothing true behind it. Should always be empty. */
export const unattached = () => IN_USE.filter((t) => !t.attachedTo || t.attachedTo.length < 20);

export default { IN_USE, REFUSED, unattached };
