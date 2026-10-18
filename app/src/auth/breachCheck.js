// ─────────────────────────────────────────────────────────────────────────────
//  BREACHED PASSWORD CHECK
//
//  Supabase can do this server-side, but the toggle is off and I have no API to
//  turn it on. This does the same job from the app, so real users are protected
//  today rather than whenever someone remembers the dashboard.
//
//  HOW THE PASSWORD STAYS PRIVATE
//
//  k-anonymity. We SHA-1 the password, send only the FIRST FIVE characters of
//  the hash, and get back every suffix that shares that prefix — usually around
//  800 of them. The comparison happens here. The password never leaves the
//  device, and neither does its full hash: the service cannot tell which of the
//  800 was being asked about, or even whether it matched.
//
//  WHAT THIS IS AND IS NOT
//
//  It is a safeguard for people who are not attacking themselves, which is the
//  actual threat: a password reused from a shop that got breached in 2019. It
//  is NOT a security control — anyone determined can bypass a client check by
//  calling the API directly. The server-side toggle is still worth turning on,
//  and this does not replace it.
//
//  It fails OPEN. If the service is unreachable, sign-up continues. Locking
//  someone out of their own shop because a third-party API is down would be a
//  worse outcome than the risk it guards against.
// ─────────────────────────────────────────────────────────────────────────────

const ENDPOINT = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 3500;

async function sha1Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * @returns {Promise<{breached: boolean, count: number, checked: boolean}>}
 *   checked:false means we could not reach the service — treat as "unknown",
 *   never as "safe" and never as a reason to block.
 */
export async function checkPassword(password) {
  const unknown = { breached: false, count: 0, checked: false };
  if (!password || password.length < 4) return unknown;
  if (typeof crypto === "undefined" || !crypto.subtle) return unknown;

  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(ENDPOINT + prefix, {
      signal: ctrl.signal,
      headers: { "Add-Padding": "true" },   // pads the reply so its SIZE leaks nothing
    });
    clearTimeout(timer);
    if (!res.ok) return unknown;

    const body = await res.text();
    for (const line of body.split("\n")) {
      const [suf, count] = line.trim().split(":");
      if (suf === suffix) {
        return { breached: true, count: Number(count) || 1, checked: true };
      }
    }
    return { breached: false, count: 0, checked: true };
  } catch {
    return unknown;                          // offline, blocked, slow — carry on
  }
}

/** Plain-language strength, for the hint under the field. */
export function describe(password) {
  if (!password) return null;
  if (password.length < 8) return { level: "short", text: "A little longer — 8 characters or more." };
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (password.length >= 15) return { level: "strong", text: "Strong — length does more than symbols." };
  if (variety >= 3) return { level: "strong", text: "Strong." };
  if (variety === 2) return { level: "ok", text: "Fine. A few more characters would be better." };
  return { level: "weak", text: "Easy to guess. Try three unrelated words." };
}

/** How to say it, without lecturing. */
export function breachMessage(count) {
  if (count > 100000) {
    return "This password is one of the most common there is — it's appeared in "
         + `${count.toLocaleString()} breaches. Please pick another.`;
  }
  return `This password has turned up in ${count.toLocaleString()} known data `
       + "breaches. It isn't about lili — it's been leaked from another site. "
       + "Please pick a different one.";
}
