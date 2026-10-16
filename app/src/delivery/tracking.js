import { CARRIERS } from "./carriers.js";

// ─────────────────────────────────────────────────────────────────────────────
//  A TRACKING NUMBER IN A MESSAGE
//
//  With payments off and meeting in person removed, the thread is where a
//  parcel is arranged, so it is where the tracking number turns up. A message
//  that names a courier (in English or Arabic) and carries something shaped like
//  a tracking number gets a link to that courier's own tracking page.
//
//  Only couriers with a known tracking address (carriers.js `track`) get one;
//  nothing here guesses a URL. The number is URL-encoded by the courier's
//  `track` function, so a message can only ever produce a link to that site.
// ─────────────────────────────────────────────────────────────────────────────

// 8–30 letters and digits with at least four digits: a waybill, not a word.
// Not after a "+", and not shaped like a UAE mobile number, so "Aramex will
// call 0501234567" does not become a tracking link.
const NUMBER = /(?:^|[^\p{L}\p{N}+])([A-Za-z0-9]{8,30})(?=$|[^\p{L}\p{N}])/gu;
const PHONE = /^(?:05\d{8}|(?:00)?9715\d{8})$/;

// How a courier is written in a message, in either language. Whole names, not
// first words: "دي" (the start of DHL's Arabic name) also starts "ديور".
const ALIASES = {
  aramex: ["aramex", "أرامكس"],
  dhl: ["dhl", "دي إتش إل"],
};

/** { carrier, number, url } for the first courier and number in `text`, or null. */
export function findTracking(text) {
  const s = String(text || "");
  if (!s || s.length > 2000) return null;
  const lower = s.toLowerCase();
  const c = CARRIERS.find((x) => x.track && (ALIASES[x.key] || [x.name.toLowerCase()]).some((n) => lower.includes(n)));
  if (!c) return null;
  for (const m of s.matchAll(NUMBER)) {
    const n = m[1];
    if ((n.match(/[0-9]/g) || []).length >= 4 && !PHONE.test(n)) return { carrier: c, number: n, url: c.track(n) };
  }
  return null;
}
