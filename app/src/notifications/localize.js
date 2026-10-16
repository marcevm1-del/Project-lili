import { t, getLang } from "../i18n/t.js";
import { money } from "../i18n/direction.js";

// ─────────────────────────────────────────────────────────────────────────────
//  NOTIFICATIONS IN THE READER'S LANGUAGE
//
//  Every notification is written by a database trigger, in English, at the
//  moment something happens; it cannot know which language the person reading
//  it later will have chosen. So the sheet translates what it can recognise:
//  the fixed titles and bodies the triggers write (the patterns below are
//  copied from them), with the amounts and names inside carried across. Text
//  a person wrote (a message preview, an offer note, a moderator's reason) is
//  left exactly as written, and anything not recognised falls back to English.
// ─────────────────────────────────────────────────────────────────────────────

// "AED 1,200" → the reader's money format
const price = (s) => {
  const m = /^AED\s*([\d,]+(?:\.\d+)?)$/.exec(String(s).trim());
  return m ? money(Number(m[1].replace(/,/g, ""))) : s;
};

const TITLES = [
  [/^New message$/, "notif_new_message"],
  [/^New offer: (.+)$/, "notif_new_offer", ["price"]],
  [/^Counter-offer: (.+)$/, "notif_counter_offer", ["price"]],
  [/^Your offer was accepted$/, "notif_offer_accepted"],
  [/^Your offer was declined$/, "notif_offer_declined"],
  [/^Your offer expired$/, "notif_offer_expired"],
  [/^The seller released your reservation$/, "notif_seller_released"],
  [/^The buyer cancelled the reservation$/, "notif_buyer_cancelled"],
  [/^That listing can't go up$/, "notif_listing_blocked"],
  [/^Your listing is being checked$/, "notif_listing_checked"],
  [/^A report about your listing was dismissed$/, "notif_report_dismissed"],
  [/^We reviewed your report$/, "notif_report_reviewed"],
  [/^Your appeal succeeded$/, "notif_appeal_succeeded"],
  [/^Your appeal was not upheld$/, "notif_appeal_not_upheld"],
  [/^New order: ship it within 4 days$/, "notif_new_order"],
  [/^Your order is on its way$/, "notif_order_on_way"],
  [/^Item received: payment released$/, "notif_payment_released"],
  [/^The buyer reported a problem$/, "notif_buyer_problem"],
  [/^The seller cancelled your order$/, "notif_seller_cancelled"],
  [/^Your order problem was decided$/, "notif_your_problem_decided"],
  [/^The order problem was decided$/, "notif_order_problem_decided"],
  [/^Your order was cancelled$/, "notif_order_cancelled"],
  [/^(.+) is now (AED [\d,]+)$/, "notif_price_now", ["title", "price"]],
  [/^(.+) — (AED [\d,]+)$/, "notif_title_price", ["title", "price"]],
];

const BODIES = [
  [/^Someone will look at it shortly — usually within a day\. Nothing more to do\.$/, "notif_body_checking"],
  [/^It looks like it breaks our selling rules\. Privacy & Safety explains what can and cannot be listed\.$/, "notif_body_blocked"],
  [/^The buyer confirmed\. Your payout is on its way\.$/, "notif_body_payout"],
  [/^Your full payment is being refunded\.$/, "notif_body_refunded"],
  [/^The seller didn't send it within 4 days\. Your full payment is being refunded\.$/, "notif_body_not_sent"],
  [/^Down from (AED [\d,]+) — you saved this one\.$/, "notif_body_down_from", ["price"]],
  [/^New for your saved search “(.+)”\.$/, "notif_body_saved_search", ["q"]],
  [/^(.+) — (AED [\d,]+) · it is for sale again$/, "notif_body_for_sale_again", ["title", "price"]],
];

function localise(list, s) {
  if (!s || getLang() !== "ar") return s;
  for (const [re, key, names] of list) {
    const m = re.exec(s);
    if (!m) continue;
    const vars = {};
    (names || []).forEach((n, i) => { vars[n] = n === "price" ? price(m[i + 1]) : m[i + 1]; });
    return t(key, vars);
  }
  return s;
}

export const localTitle = (s) => localise(TITLES, s);
export const localBody = (s) => localise(BODIES, s);

// For the research suite: every fixed title must still be what a trigger writes.
export const PATTERNS = { TITLES, BODIES };
