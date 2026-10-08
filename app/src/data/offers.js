import * as remote from "../backend/remote.js";
import { getJSON, setJSON } from "../compliance/store.js";

// ─────────────────────────────────────────────────────────────────────────────
//  OFFERS
//
//  The third repo that should have existed and did not, and the one that costs
//  the most.
//
//  Haggling is how this market buys. The database has had the whole thing for a
//  while: the seller is read from the listing so you cannot address an offer to
//  someone who is not selling; one open offer per buyer per piece; the amount
//  immutable once made; a seller may accept, decline or counter and a buyer may
//  only withdraw; a decided offer cannot be re-decided; and expiry is read from
//  the clock rather than a cron, so nothing silently stays open because a
//  scheduler died.
//
//  `backend/remote.js` implements every call. **Nothing in the app called any of
//  them.** `OfferModal` waited two seconds and then invented the seller's reply
//  from `["accept","counter","counter"]`, with a counter at 96% of whatever was
//  offered. The buyer watched a slot machine. The seller was never told an offer
//  existed.
//
//  The handover says of this: "a buyer made an offer and the seller never
//  learned of it. Now backed." The DATABASE was backed. That sentence still
//  described the app.
//
//  Same local-first rule as listings and conversations: a configured and
//  reachable backend answers, and when there is none the device holds the offer
//  and says plainly that it has not been sent — because the one thing this must
//  never do again is answer on the seller's behalf.
// ─────────────────────────────────────────────────────────────────────────────

const K = { offers: "lili.offers.v1" };

let remoteReady = false;
export function setRemoteReady(v) { remoteReady = !!v; }
export function isRemote() { return remoteReady; }

// The database is the authority on this; the constant is here so the interface
// can count down without asking, and it must match lili_offers.
export const EXPIRY_HOURS = 48;

const nowISO = () => new Date().toISOString();
const local = () => getJSON(K.offers, []);

/**
 * Hours left, from the clock — never from a job that has to run.
 *
 * That argument is right and it stays: what she SEES should not depend on a
 * sweep. But it was the only thing here, and a display state is not a state.
 * The database now carries `expires_at`, refuses to accept, decline or counter
 * a lapsed offer (trigger lili_offer_not_lapsed), and moves the stored state
 * and notifies the buyer on a schedule. The clock decides the countdown; the
 * database decides what can be done.
 *
 * v2.9.1: this used to fail OPEN. `new Date(offer.created_at || Date.now())`
 * means a row that arrived without a timestamp reads as "made just now", so it
 * showed 48 hours left, forever, and never expired. An offer whose age cannot
 * be established is not fresh — it is unknown, and the safe reading of unknown
 * is lapsed.
 */
export function hoursLeft(offer) {
  const stamp = offer.expires_at
    ? new Date(offer.expires_at).getTime()
    : new Date(offer.created_at || offer.createdAt || 0).getTime() + EXPIRY_HOURS * 3600e3;
  if (!isFinite(stamp) || stamp === EXPIRY_HOURS * 3600e3) return 0;   // no usable timestamp
  return Math.max(0, (stamp - Date.now()) / 3600e3);
}

export function isExpired(offer) {
  return offer.state === "pending" && hoursLeft(offer) <= 0;
}

/** What the interface should call this offer right now. */
export function displayState(offer) {
  if (isExpired(offer)) return "expired";
  return offer.state || "pending";
}

export const STATE_LABEL = {
  pending:   { en: "Waiting for her",  ar: "بانتظار ردها" },
  accepted:  { en: "Accepted",         ar: "مقبول" },
  declined:  { en: "Declined",         ar: "مرفوض" },
  countered: { en: "Countered",        ar: "عرض مقابل" },
  withdrawn: { en: "Withdrawn",        ar: "مسحوب" },
  expired:   { en: "Expired",          ar: "منتهي" },
};

export async function getOffers() {
  if (remoteReady) {
    try { return await remote.getOffers(); }
    catch (e) { console.warn("offers fell back to the device:", e && e.message); }
  }
  return local();
}

/**
 * Make an offer. On a configured backend a refusal is raised — "you already
 * have an offer open on this piece" is information, not an error to hide.
 */
export async function makeOffer({ itemId, shopId, sellerUid, amount, message }) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Enter an amount");

  if (remoteReady) {
    try {
      return await remote.makeOffer({ itemId, shopId, sellerUid, amount: value, message });
    } catch (e) {
      if (!remote.isOffline(e)) throw e;
      const held = await hold({ itemId, shopId, sellerUid, amount: value, message });
      const err = new Error("No signal — your offer is saved but hasn't been sent yet.");
      err.code = "HELD_OFFLINE"; err.held = held;
      throw err;
    }
  }
  return hold({ itemId, shopId, sellerUid, amount: value, message });
}

async function hold({ itemId, shopId, sellerUid, amount, message }) {
  const list = await local();
  const offer = {
    id: `offer-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    item_id: itemId, shop_id: shopId || null,
    seller_uid: sellerUid || null, buyer_uid: "me",
    amount, message: message || null,
    state: "pending", created_at: nowISO(),
    delivered: false,          // it has not reached her, and the UI says so
  };
  await setJSON(K.offers, [offer, ...list]);
  return offer;
}

async function decideLocally(id, state) {
  const list = await local();
  const offer = list.find((o) => o.id === id);
  // The server refuses to act on a lapsed offer; the device copy has to agree,
  // or the same tap means two different things depending on the network.
  // Withdrawing is exempt — a buyer may always take back an offer nobody
  // answered.
  if (offer && state !== "withdrawn" && isExpired(offer)) {
    throw new Error("That offer expired. Ask her to make another.");
  }
  await setJSON(K.offers, list.map((o) => (o.id === id ? { ...o, state } : o)));
  return { id, state };
}

// A buyer may only withdraw. A seller may accept, decline or counter. Neither
// can act as the other — the database enforces that, and so does this.
export async function withdrawOffer(id) {
  if (remoteReady) return remote.withdrawOffer(id);
  return decideLocally(id, "withdrawn");
}
export async function acceptOffer(id) {
  if (remoteReady) return remote.acceptOffer(id);
  return decideLocally(id, "accepted");
}
export async function declineOffer(id) {
  if (remoteReady) return remote.declineOffer(id);
  return decideLocally(id, "declined");
}
export async function counterOffer(id, amount, message) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Enter an amount");
  if (remoteReady) return remote.counterOffer(id, value, message);
  await decideLocally(id, "countered");
  const list = await local();
  const original = list.find((o) => o.id === id) || {};
  return hold({ itemId: original.item_id, shopId: original.shop_id,
                sellerUid: original.seller_uid, amount: value, message });
}
