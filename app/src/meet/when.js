// How a meet time is said out loud.
//
// The server stores the instant (UTC). Both people are in the UAE, but a phone
// can be on another timezone — travelling, or set by hand — so the time is
// always shown on UAE clocks and says so, and the nearest days are named:
// "Tomorrow, 6:30 pm (UAE)" is read at a glance; "Thu 9 Oct, 18:30" is worked out.

export const UAE_TZ = "Asia/Dubai";

const dayKey = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: UAE_TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d);

/** "Today, 4:00 pm (UAE)" · "Tomorrow, …" · "Yesterday, …" · "Sat 11 Oct, …" */
export function meetLabel(iso, now = new Date()) {  // an ISO string or a Date
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-GB", { timeZone: UAE_TZ, hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s?([ap])\.?m\.?/i, (_, x) => ` ${x.toLowerCase()}m`);
  const days = Math.round((Date.parse(dayKey(d)) - Date.parse(dayKey(now))) / 86400000);
  const day = days === 0 ? "Today" : days === 1 ? "Tomorrow" : days === -1 ? "Yesterday"
    : d.toLocaleDateString("en-GB", { timeZone: UAE_TZ, weekday: "short", day: "numeric", month: "short" });
  return `${day}, ${time} (UAE)`;
}

/** True when the phone's clock is not on UAE time (UTC+4, no daylight saving). */
export const phoneOffUaeTime = (at = new Date()) => at.getTimezoneOffset() !== -240;

/**
 * A `datetime-local` value is wall-clock time with no zone. Read it as UAE
 * time, whatever zone the phone is in, so "4 pm" means 4 pm in Dubai.
 */
export function uaeWallClockToInstant(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || "");
  if (!m) return new Date(NaN);
  const [, y, mo, da, h, mi] = m.map(Number);
  return new Date(Date.UTC(y, mo - 1, da, h - 4, mi));
}
