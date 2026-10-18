// ─────────────────────────────────────────────────────────────────────────────
//  TWO SIGNS OF A SCAM, NAMED WHERE THEY HAPPEN
//
//  With paying in the app off and every piece going by courier, the money moves
//  between two strangers before a parcel exists. The Payments & Scams policy
//  lists how that goes wrong; two of its signs can be seen in the message
//  itself, at the moment it arrives:
//
//    · a link to pay, or to "confirm", on some website
//    · a push to carry on in WhatsApp, Telegram or another app, where nothing
//      she is told can be shown to lili afterwards
//
//  So a message from the other person that does either gets one quiet line
//  under it. It is a note, not a block: plenty of links are innocent, and the
//  courier's own tracking pages are recognised and left alone. Nothing is sent
//  anywhere; this reads the text on her phone.
// ─────────────────────────────────────────────────────────────────────────────

// The couriers' own sites, which a seller may paste a tracking link from.
const COURIER_HOSTS = /(^|\.)(aramex\.com|dhl\.com|emiratespost\.ae|smsaexpress\.com|quiqup\.com)$/i;

const URL = /\b((?:https?:\/\/|www\.)[^\s<>"']+|[a-z0-9-]+\.(?:com|net|org|ae|io|me|co|link|shop|store|xyz|info|site|online|ly)(?:\/[^\s<>"']*)?)/gi;
const OFF_PLATFORM = /\b(whats\s?app|wa\.me|telegram|t\.me|signal app|snap\s?chat|instagram dm|dm me)\b|واتس|واتساب|تيليجرام|تلغرام|سناب/i;

function hostOf(u) {
  try { return new globalThis.URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname; }
  catch { return ""; }
}

/** "off_platform" | "link" | null, for a message someone else sent. */
export function scamSignal(text) {
  const s = String(text || "");
  if (!s) return null;
  if (OFF_PLATFORM.test(s)) return "off_platform";
  for (const m of s.matchAll(URL)) {
    const host = hostOf(m[1]);
    if (host && !COURIER_HOSTS.test(host)) return "link";
  }
  return null;
}
