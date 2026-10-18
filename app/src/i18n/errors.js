import { t, getLang } from "./t.js";

// ─────────────────────────────────────────────────────────────────────────────
//  ERROR MESSAGES IN THE READER'S LANGUAGE
//
//  The data and backend layers throw plain English (`new Error("Enter an
//  amount")`), and the suites read those sentences in the source on purpose:
//  "That's your own listing" is how the security suite knows offers on your own
//  piece are refused. So they are translated where they are SHOWN, not where
//  they are thrown: each screen that prints an error passes it through
//  localError(). A message not listed here is shown as it came, in English;
//  a server message with a detail in it is never guessed at.
// ─────────────────────────────────────────────────────────────────────────────

const EXACT = {
  "That file type isn't supported. Use a photo.": "err_file_type",
  "Add at least one photo — listings without one rarely sell.": "err_add_one_photo",
  "Couldn't read that image": "err_read_image",
  "Couldn't read that file": "err_read_file",
  "No file chosen": "err_no_file",
  "Enter an amount": "err_enter_amount",
  "No signal — your offer is saved but hasn't been sent yet.": "err_offer_held",
  "That offer expired. Ask her to make another.": "err_offer_expired",
  "Open a shop before listing": "err_open_shop_first",
  "That's your own listing": "err_own_listing",
  "Nothing to send": "err_nothing_to_send",
  "That message is too long": "err_message_too_long",
  "That message is too long — 2,000 characters is the limit.": "err_message_limit",
  "You already have an offer open on this piece": "err_offer_open",
  "Sign in to save a search": "err_sign_in_search",
  "That didn't send. Try again.": "offer_didnt_send",
  "That didn't go through.": "err_didnt_go_through",
  "That didn't save.": "err_didnt_save",
};

const PATTERNS = [
  [/^Photo is ([\d.]+)MB — the limit is ([\d.]+)MB\.$/, "err_photo_too_big", ["size", "max"]],
  [/^That's (\d+) photos\. The limit is (\d+)\.$/, "err_too_many_photos", ["n", "max"]],
];

export function localError(msg) {
  if (!msg || getLang() !== "ar") return msg;
  const s = String(msg);
  if (EXACT[s]) return t(EXACT[s]);
  for (const [re, key, names] of PATTERNS) {
    const m = re.exec(s);
    if (m) return t(key, Object.fromEntries(names.map((n, i) => [n, m[i + 1]])));
  }
  return s;
}

// For the i18n suite: every listed message must have its dictionary entry.
export const KNOWN = { EXACT, PATTERNS };
