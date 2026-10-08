import { getJSON, setJSON } from "../compliance/store.js";
import * as remote from "../backend/remote.js";
import * as conversations from "./conversations.js";
import * as offersRepo from "./offers.js";
// moderation.js is imported dynamically where it is used, not here. It is 16 kB
// of moderator machinery — queue states, SLA clocks, strike policy, appeals —
// and repo.js is the module every screen reaches through, so a static import
// put all of it in the bundle of a woman who is looking at dresses. The only
// thing needed at startup is one question to the server, and that already
// waits for a network round trip.
import * as search from "../discovery/search.js";

// ─────────────────────────────────────────────────────────────────────────────
//  THE SWITCH
//
//  Every function below asks one question first: is a backend configured? If
//  not it reads and writes device storage exactly as before, so the app is
//  fully usable offline and on a fresh install with no server at all.
//
//  Adding src/backend/config.js flips all of them at once. No component knows
//  which mode it is in — that was the entire point of routing every read and
//  write through this file.
//
//  Local storage also stays as the offline fallback: if a remote call throws,
//  the device copy answers rather than the screen going blank.
// ─────────────────────────────────────────────────────────────────────────────
// Two different questions, and until v2.10.1 the code asked only the harder one.
//
//   remoteReady  — can this phone WRITE? Needs a session.
//   remoteRead   — can this phone READ the catalogue? Needs only the key.
//
// `lili_items` and `lili_shops` are readable by `anon` — that is deliberate and
// it is what makes a marketplace browsable before anybody signs in. But
// initBackend() called ensureUser() first and, when a session could not be
// obtained, fell all the way back to device-only. So with anonymous sign-in
// switched off in the dashboard, the app showed nobody the real catalogue:
// every install was a private demo, and the warning it logged said "browsing is
// live" while the code had just made sure it was not.
//
// They are separate now. Browsing is live for everyone. Listing, messaging,
// offers and saves need a session, and `writeBlocked()` says so in words a
// screen can show instead of failing quietly.
let remoteReady = false;      // writes
let remoteRead  = false;      // reads
let whyNoWrites = null;

export async function initBackend() {
  try {
    const mod = await import("../backend/config.js");
    if (!remote.configure(mod.default || mod)) {
      remoteReady = false; remoteRead = false; return false;
    }

    // Reads first, and they do not depend on anything else succeeding.
    remoteRead = true;

    // Writes need a session. If one cannot be obtained — anonymous sign-in
    // switched off, project paused, no network — reads stay on, writes stay
    // local, and the reason is kept so a screen can say it out loud.
    try {
      await remote.ensureUser();
      whyNoWrites = null;
    } catch (e) {
      remoteReady = false;
      whyNoWrites = (e && e.message) === "SIGN_IN_UNAVAILABLE"
        ? "SIGN_IN_UNAVAILABLE" : "NO_SESSION";
      conversations.setRemoteReady(false);
      offersRepo.setRemoteReady(false);
      // Still worth doing: the shared garment vocabulary is public, and it
      // makes search work the same way for a woman who has not signed in.
      remote.getSearchTerms().then((rows) => search.hydrate(rows)).catch(() => {});
      console.info("lili: browsing is live, but this phone cannot write yet —", whyNoWrites);
      return false;
    }

    remoteReady = true;
    conversations.setRemoteReady(true);
    offersRepo.setRemoteReady(true);
    // Ask the server whether this account is a moderator, so the queue reads
    // real cases rather than this phone's copy of nothing.
    import("../compliance/moderation.js")
      .then((m) => m.initQueueSource())
      .catch(() => {});
    // Replace the built-in garment vocabulary with the server's, so a term
    // added to lili_search_terms reaches the offline path too. Best effort —
    // the seed list is a working fallback, not a broken state.
    remote.getSearchTerms().then((rows) => search.hydrate(rows)).catch(() => {});
  } catch (e) {
    remoteReady = false;
    remoteRead = false;
    whyNoWrites = "NO_BACKEND";
    conversations.setRemoteReady(false);
    offersRepo.setRemoteReady(false);
    console.info("lili: running on-device —", (e && e.message) || "no backend");
  }
  return remoteReady;
}

/** Can this phone write — list, message, make an offer? */
export const isRemote = () => remoteReady;

/** Can it read other women's listings? True whenever the project is reachable. */
export const canRead = () => remoteRead;

/**
 * Why writes are local, or null when they are not.
 *
 *   SIGN_IN_UNAVAILABLE — the project refuses the kind of sign-in the app
 *                         asked for. She can still create an account.
 *   NO_SESSION          — something else went wrong obtaining one.
 *   NO_BACKEND          — no backend configured at all.
 *
 * A screen shows this rather than letting her list a piece that reaches
 * nobody. Returning a code rather than a sentence keeps the wording in the
 * dictionary where a translator can reach it.
 */
export const writeBlocked = () => (remoteReady ? null : whyNoWrites);

/** Called after a real sign-in, to switch writes on without a restart. */
export async function adoptSession() {
  try {
    await remote.ensureUser();
    remoteReady = true;
    whyNoWrites = null;
    conversations.setRemoteReady(true);
    offersRepo.setRemoteReady(true);
    return true;
  } catch { return false; }
}

/**
 * Search.
 *
 * The server does bilingual and fuzzy matching through `lili_search`. The
 * device copy now applies the same three rules — folded spelling, the garment
 * vocabulary, a little spelling tolerance — so offline results are narrower
 * than the server's but never mean something different.
 *
 * v2.9: this function existed and had no callers. The UI ran four separate
 * substring filters instead, none of which searched `titleAr`, so a woman
 * typing عباية got nothing from an app whose sell flow tells sellers the Arabic
 * title is what makes a piece findable in Arabic. It is wired in now.
 *
 * `fallbackItems` lets a screen that already holds a list search that list
 * rather than re-reading storage — the shop page searches one shop, not the
 * catalogue.
 */
export async function searchItems(query, limit = 40, { fallbackItems = null, shopFor } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];
  if (remoteRead && !fallbackItems) {
    try {
      const hits = await remote.searchItems(q, limit);
      if (hits && hits.length) return hits;
      // An empty server answer is a real answer, not a failure — but on a
      // catalogue this small a device pass costs nothing and sometimes finds
      // the piece that was published a second ago and is not indexed yet.
    } catch (e) { console.warn("search fell back to the device:", e && e.message); }
  }
  const items = fallbackItems || await getJSON(K.items, []);
  return search.searchLocal(items, q, { limit, shopFor: shopFor || (() => "") });
}

/** Try the server, fall back to the device rather than showing nothing. */
/**
 * Never block the first paint on the network.
 *
 * The naive version awaited the server before returning anything, so on a slow
 * connection the app sat on its gate screen doing nothing — in Dubai, talking
 * to Stockholm, that is a real wait on real mobile data.
 *
 * The device copy answers immediately if it has anything to say. The server
 * only wins if it is genuinely fast, and otherwise its answer lands through the
 * refresh below rather than holding up the screen.
 */
const NETWORK_BUDGET_MS = 1200;

async function viaRemote(fn, fallback, onLate) {
  // Reading, not writing — the catalogue is public.
  if (!remoteRead) return fallback();

  const local = await fallback();
  const remotePromise = (async () => {
    try { return await fn(); }
    catch (e) {
      console.warn("backend unavailable, using device copy:", e && e.message);
      return null;
    }
  })();

  const winner = await Promise.race([
    remotePromise,
    new Promise((r) => setTimeout(() => r(undefined), NETWORK_BUDGET_MS)),
  ]);

  // the server answered in time and had something
  if (Array.isArray(winner) && winner.length) return winner;
  if (winner && !Array.isArray(winner)) return winner;

  // it was slow or empty — hand back the device copy now, and let the late
  // answer update the screen when it arrives
  if (onLate) {
    remotePromise.then((late) => {
      if (Array.isArray(late) ? late.length : late) onLate(late);
    });
  }
  return local;
}


// ─────────────────────────────────────────────────────────────────────────────
//  REPOSITORY
//
//  Until now every shop and listing lived in a module constant. Two people
//  installing the app could not see each other, a shop vanished when the app
//  closed, and Google rejects that under the Minimum Functionality policy —
//  a marketplace where nothing persists reads as a placeholder.
//
//  This is the seam. Every read and write goes through an async function here,
//  backed by device storage. Swapping the six functions at the bottom for HTTP
//  calls turns it into a real multi-user marketplace without touching a single
//  component.
//
//  What persistence alone fixes: your shop and listings survive a restart, and
//  the app stops being a slideshow. What it does not fix: two devices still
//  cannot see each other. That needs the server, and the contract for it is in
//  BACKEND-CONTRACT.md.
// ─────────────────────────────────────────────────────────────────────────────

const K = {
  items: "lili.data.items.v1",
  shops: "lili.data.shops.v1",
  myShop: "lili.data.myshop.v1",
  cart: "lili.data.cart.v1",
  following: "lili.data.following.v1",
  saved: "lili.data.saved.v1",
  seeded: "lili.data.seeded.v1",
  draft:  "lili.data.draft.v1",
  demoRetired: "lili.data.demoretired.v1",
};

// ── the unfinished listing ──────────────────────────────────────────────────
//
// A listing in progress lived only in React state. The tab bar unmounts the
// sell screen without asking, so one tap on Home destroyed the title, the
// description, the price and the processed photographs — and a re-shoot is the
// most expensive thing you can ask of a seller who is already halfway.
//
// This stays on her device and never goes to the server: it is not a listing
// until she publishes it, and a half-written one is hers alone. Photographs are
// already EXIF-stripped by data/images.js before they reach here, so nothing
// that was not already stored on this phone is being stored.

export async function saveDraft(draft) {
  try { await setJSON(K.draft, { ...draft, at: Date.now() }); return true; }
  catch { return false; }
}

/** Anything older than a fortnight is not a draft any more, it is clutter. */
const DRAFT_TTL_MS = 14 * 86400000;

export async function getDraft() {
  const d = await getJSON(K.draft, null);
  if (!d) return null;
  if (d.at && Date.now() - d.at > DRAFT_TTL_MS) { await clearDraft(); return null; }
  return d;
}

export async function clearDraft() {
  try { await setJSON(K.draft, null); return true; } catch { return false; }
}

/**
 * First run copies the demo catalogue into storage. After that, storage wins —
 * otherwise a seller's own listings would be overwritten by the seed on every
 * launch, which is the classic way this pattern goes wrong.
 */
export async function bootstrap(seedItems, seedShops) {
  const seeded = await getJSON(K.seeded, false);
  if (!seeded) {
    // v2.9: the demo catalogue is stamped with the moment it lands on this
    // phone, and its `isNew`/`hasStory` flags are dropped.
    //
    // `isNew` was a hand-written boolean on each seed and on every listing the
    // client published. It never expired, and it is not a column in lili_items,
    // so the "New In" strip was simultaneously permanent offline and empty
    // online. New arrivals are derived from created_at now
    // (discovery/ranking.js), and the honest created_at for a demo piece is
    // when the demo started — a fresh install genuinely has a fresh catalogue,
    // and a fortnight later the strip empties by itself, as it should.
    const now = Date.now();
    const stamped = (seedItems || []).map((i, n) => {
      const { isNew, hasStory, ...rest } = i;
      return { ...rest, created_at: new Date(now - n * 3600e3).toISOString() };
    });
    await setJSON(K.items, stamped);
    await setJSON(K.shops, seedShops);
    // The demo catalogue carries a few `saved` flags so a cold start does not
    // look untouched. Now that a save is a set of ids rather than a flag on the
    // listing, that set has to be seeded HERE — otherwise the screen shows
    // three hearts while the store holds none, and the first tap corrects the
    // count downwards instead of up.
    await setJSON(K.saved, stamped.filter((i) => i.saved).map((i) => i.id));
    await setJSON(K.seeded, true);
  }
  return {
    items: await getJSON(K.items, seedItems),
    shops: await getJSON(K.shops, seedShops),
    myShop: await getJSON(K.myShop, null),
    cart: await getJSON(K.cart, []),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  THE CATALOGUE ACTUALLY ARRIVING
//
//  v2.9.1, and the most serious thing found in this pass.
//
//  `bootstrap` above reads device storage and nothing else — correctly, because
//  local-first means the first paint never waits on a network. The bug is that
//  NOTHING EVER FETCHED. `getItems` and `getShops` below wrap `viaRemote` and,
//  until this release, had no callers anywhere in the application. Not one.
//
//  `activateBackend` in Marketplace.jsx even carries the comment "pull the
//  shared catalogue down — otherwise the account works and the app stays
//  stubbornly local", and then calls `bootstrap`, which reads the phone.
//
//  What that meant in practice, the moment anonymous sign-in is switched on:
//
//    · a new user installs and sees ten demo listings from six fictional shops,
//      as the marketplace;
//    · real listings arrive only through the realtime subscription, which fires
//      only when somebody else writes a row;
//    · and real SHOPS never arrive at all — `setShops` is only ever called from
//      bootstrap, a follower count, and creating your own. So after that first
//      realtime event you have real items whose shop_id is a uuid being looked
//      up in an array of demo shops with integer ids, and every seller name,
//      avatar and trust chip on a real listing resolves to undefined.
//
//  ── retiring the demo
//
//  Once this device has spoken to the real marketplace, the demo catalogue is
//  gone and does not come back — including offline, where the honest cache is
//  the real catalogue she last saw, not six invented shops. An empty server is
//  an empty feed; that is what the launch state actually is, and the empty
//  states were built for it.
//
//  Her own listings written while offline carry `pending` and are kept, because
//  the server has not seen them yet and dropping them would lose her work.
// ─────────────────────────────────────────────────────────────────────────────

const isPending = (i) => !!i && i.pending === true;

/**
 * Fetch the shared catalogue and make it the truth on this device.
 *
 * Returns null when there is no backend, so the caller leaves the screen alone
 * rather than blanking a working demo.
 */
export async function refreshCatalogue() {
  // Reading the catalogue, not writing to it. This asked `remoteReady` — a
  // question about WRITES — so with no session the feed never left the demo
  // shops, which is most of what made every install a private demo.
  if (!remoteRead) return null;
  let items, shops;
  try {
    [items, shops] = await Promise.all([remote.getItems(), remote.getShops()]);
  } catch (e) {
    // Offline or refused: keep whatever this device already holds. This must
    // never blank the screen — a failed refresh is not an empty marketplace.
    console.warn("catalogue refresh failed, keeping the device copy:", e && e.message);
    return null;
  }

  const held = await getJSON(K.items, []);

  // An EMPTY server answer is not a reason to throw away what this phone has.
  //
  // Until v2.10.1 this ran only when signed in, where the server holds her
  // listings and replacing the local copy is right. Now that browsing connects
  // without an account, the same code met a project with nothing in it yet —
  // and replaced a catalogue that had her offline listings and the demo shops
  // in it with nothing at all. An empty feed on first open, and her own work
  // gone.
  //
  // Nothing on the server means nothing to merge. Keep the device copy, keep
  // the demo catalogue visible, and try again on the next refresh.
  if (!items || items.length === 0) {
    if (shops && shops.length) await setJSON(K.shops, shops);
    return null;
  }

  const mine = held.filter(isPending);
  const merged = [...mine, ...items];

  await setJSON(K.items, merged);
  await setJSON(K.shops, shops || []);
  await setJSON(K.seeded, true);          // never re-seed a device that has been live
  // The demo catalogue is retired only once there is a real one to replace it.
  await setJSON(K.demoRetired, true);
  return { items: merged, shops: shops || [] };
}

/**
 * Fold a fresh server list into what is on screen, keeping her pending work.
 *
 * The realtime handler used to do `setItems(fresh)` wholesale, which silently
 * wiped a listing she had written offline seconds earlier.
 */
export async function mergeLive(fresh) {
  const held = await getJSON(K.items, []);
  const mine = held.filter(isPending);
  const merged = [...mine, ...(fresh || [])];
  await setJSON(K.items, merged);
  return merged;
}

/** Has this device ever seen the real marketplace? */
export const demoRetired = () => getJSON(K.demoRetired, false);

// ── listings ───────────────────────────────────────────────────────────────
export const getItems = () =>
  viaRemote(() => remote.getItems(), () => getJSON(K.items, []));

/**
 * v2.8: publishing a listing now fails out loud when the SERVER refuses it.
 *
 * This function used to catch every error from the remote path and fall
 * through to device storage with a console.warn. That is right for one cause
 * and disastrous for every other. Offline, the device copy is the entire point
 * of local-first. But when the server has looked at the write and said no — a
 * missing column, a policy refusal, a constraint — saving quietly to the phone
 * tells a seller her piece is live in a marketplace that has never heard of it.
 *
 * That is not hypothetical. It is what shipped: the client sent columns
 * `lili_items` did not have, PostgREST refused every insert, and the fallback
 * hid it so completely that the table sat at zero rows while the app looked
 * like it worked.
 *
 * Offline still falls back, and the copy is marked `pending` so it can be told
 * apart from a listing that is genuinely live.
 */
export async function addItem(item) {
  if (remoteReady) {
    try {
      const saved = await remote.addItem(item);
      const items = await getJSON(K.items, []);
      await setJSON(K.items, [saved, ...items]);
      return saved;
    } catch (e) {
      if (!remote.isOffline(e)) {
        console.error("addItem was REFUSED by the server:", e && e.message);
        const err = new Error(
          "Your listing didn't reach lili — nothing was published. " +
          "Please try again; if it keeps happening, tell us and we'll look."
        );
        err.cause = e;
        err.code = "REMOTE_REJECTED";
        throw err;
      }
      console.warn("addItem is offline — held on this device:", e && e.message);
    }
  }
  const items = await getJSON(K.items, []);
  const record = {
    ...item,
    id: item.id ?? `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
    status: item.status || "live",   // live | in_review | removed
    // Only a device-only build has genuinely-local listings. When a backend is
    // configured and we got here, this row is waiting to be sent.
    pending: remoteReady || undefined,
  };
  await setJSON(K.items, [record, ...items]);
  return record;
}

// Mirror a server answer into the device copy, so the screen and an offline
// reopen agree with what the database decided.
async function mirrorLocal(id, patch) {
  const items = await getJSON(K.items, []);
  const next = items.map((i) => (i.id === id ? { ...i, ...patch } : i));
  await setJSON(K.items, next);
  return next.find((i) => i.id === id) || null;
}

// Until v2.12 these three only ever wrote the device copy: an edited price never
// reached the server (so no price-drop alert could fire), and "removed" was set
// on the phone while the listing stayed live for everyone else.
export async function updateItem(id, patch) {
  if (remoteReady) {
    const saved = await remote.updateItem(id, patch);   // status is the server's verdict
    await mirrorLocal(id, saved);
    return saved;
  }
  return mirrorLocal(id, patch);
}

/** Take a listing down (refused while a report about it is under review). */
export async function removeItem(id) {
  if (remoteReady) {
    await remote.removeItem(id);
    const items = await getJSON(K.items, []);
    await setJSON(K.items, items.filter((i) => i.id !== id));
    return id;
  }
  // Device-only: a soft delete keeps the local record a moderator might need.
  return mirrorLocal(id, { status: "removed", removedAt: Date.now() });
}

/** Mark a live piece sold, or relist a sold one. */
export async function markSold(id, sold = true) {
  // Relisting is re-screened by the database: the answer may be "in_review",
  // not "live", so use what it says.
  let status = sold ? "sold" : "live";
  if (remoteReady) {
    const r = await remote.markSold(id, sold);
    if (r && r.status) status = r.status;
  }
  return mirrorLocal(id, { status });
}

// ── saved ──────────────────────────────────────────────────────────────────
//
// v2.8: a save is a fact about a PERSON and an item, not a property of the item.
//
// It used to be written onto the listing itself — `updateItem(id, { saved })`.
// That is fine in a single-player app and wrong in every way once there is a
// server:
//
//   · `saved` is not a column on lili_items, so the write was stripped
//   · updating an item you do not own is refused by the row-level policy, so
//     saving another woman's piece could only ever fail
//   · and if it HAD worked, one woman saving a bag would have marked it saved
//     for everybody looking at it
//
// `lili_saves` has always been the right shape: one row per person per item.
// These functions return the ID SET, and the interface derives each item's
// heart from it.
export async function getSaved() {
  if (remoteReady) {
    try { return await remote.getSaved(); }
    catch (e) { console.warn("saved fell back to the device:", e && e.message); }
  }
  return getJSON(K.saved, []);
}

/** @returns {Promise<string[]>} the new set of saved item ids */
export async function toggleSaved(id) {
  if (remoteReady) {
    try { return await remote.toggleSave(id); }
    catch (e) {
      if (!remote.isOffline(e)) throw e;
      console.warn("save held on the device:", e && e.message);
    }
  }
  const cur = await getJSON(K.saved, []);
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  await setJSON(K.saved, next);
  return next;
}

// ── shops ──────────────────────────────────────────────────────────────────
export const getShops = () =>
  viaRemote(() => remote.getShops(), () => getJSON(K.shops, []));

export async function createShop(form) {
  if (remoteReady) {
    try {
      const saved = await remote.createShop(form);
      await setJSON(K.myShop, saved);
      await setJSON(K.shops, [...(await getJSON(K.shops, [])), saved]);
      return saved;
    } catch (e) { console.warn("createShop fell back to device:", e && e.message); }
  }
  const shop = {
    id: `shop-${Date.now()}`,
    ...form,
    // v2.8: a new shop no longer opens with `rating: 5`. It was invisible —
    // `Stars` hides any rating under five reviews — but it was a five-star
    // score written into storage on a shop that had sold nothing, waiting for
    // the day some other screen read the field without the guard. A shop with
    // no history should hold no score, not a hidden one.
    owner: "You", followers: 0, rating: null, reviews: 0, soldCount: 0,
    online: true, handle: "@myshop",
    createdAt: Date.now(),
    status: "active",           // active | paused | closed
  };
  await setJSON(K.shops, [...(await getShops()), shop]);
  await setJSON(K.myShop, shop);
  return shop;
}

export const getMyShop = () =>
  viaRemote(() => remote.getMyShop(), () => getJSON(K.myShop, null));

export async function updateShop(id, patch) {
  if (remoteReady) {
    try { await remote.updateShop(id, patch); } catch (e) { console.warn("updateShop:", e && e.message); }
  }
  const shops = await getJSON(K.shops, []);
  const next = shops.map((s) => (s.id === id ? { ...s, ...patch } : s));
  await setJSON(K.shops, next);
  const mine = await getMyShop();
  if (mine && mine.id === id) await setJSON(K.myShop, { ...mine, ...patch });
  return next.find((s) => s.id === id) || null;
}

// ── cart ───────────────────────────────────────────────────────────────────
// Persisted because an abandoned cart that survives a restart is worth real
// money, and because losing it on a crash is the kind of thing people uninstall over.
// ── reviews ────────────────────────────────────────────────────────────────
// Server-only: a review is about a meet two people agreed on the server, so a
// device-only install has nothing to review and nothing to show.
export async function getReviewsOwed() {
  if (!remoteReady) return [];
  try { return await remote.getReviewsOwed(); }
  catch (e) { console.warn("reviews owed unavailable:", e && e.message); return []; }
}
export async function leaveReview(meetId, stars, body) {
  if (!remoteReady) throw new Error(whyNoWrites || "Sign in to leave a review");
  return remote.leaveReview(meetId, stars, body);
}
export async function getShopReviews(shopId) {
  if (!remoteRead || typeof shopId !== "string") return [];
  try { return await remote.getShopReviews(shopId); }
  catch (e) { console.warn("shop reviews unavailable:", e && e.message); return []; }
}

// ── saved searches ─────────────────────────────────────────────────────────
// Server-only, like reviews: an alert is sent by the database when someone
// else lists, which a device-only install can never see.
export const canSaveSearches = () => remoteReady;
export async function getSavedSearches() {
  if (!remoteReady) return [];
  try { return await remote.getSavedSearches(); }
  catch (e) { console.warn("saved searches unavailable:", e && e.message); return []; }
}
export async function saveSearch(query, opts) {
  if (!remoteReady) throw new Error(whyNoWrites || "Sign in to save a search");
  return remote.saveSearch(query, opts);
}
export const sawSearch = (id) => (remoteReady ? remote.sawSearch(id).catch(() => {}) : Promise.resolve());
export const forgetSearch = (id) => (remoteReady ? remote.forgetSearch(id) : Promise.resolve());

export const getCart = () => getJSON(K.cart, []);
export const saveCart = (cart) => setJSON(K.cart, cart);

// ── following ──────────────────────────────────────────────────────────────
// Who this shopper follows. Persisted like everything else, so the button
// means something after the app is closed.
export const getFollowing = async () => {
  if (remoteReady) {
    try { return await remote.getFollowing(); }
    catch (e) { console.warn("following fell back to the device:", e && e.message); }
  }
  return getJSON(K.following, []);
};

export async function toggleFollow(shopId) {
  // v2.8: this never reached the server either. `remote.toggleFollow` existed,
  // maintained the follower count through a trigger, and had no callers — so a
  // follow lived on one phone and the shop's follower count never moved.
  if (remoteReady) {
    try { return await remote.toggleFollow(shopId); }
    catch (e) {
      if (!remote.isOffline(e)) throw e;
      console.warn("follow held on the device:", e && e.message);
    }
  }
  const list = await getJSON(K.following, []);
  const next = list.includes(shopId)
    ? list.filter((id) => id !== shopId)
    : [...list, shopId];
  await setJSON(K.following, next);
  return next;
}

/**
 * Live feed. New and changed listings arrive without a pull-to-refresh.
 * Returns an unsubscribe function; a no-op with no backend.
 */
export async function watchItems(onChange) {
  if (!remoteReady) return () => {};
  try { return await remote.watchItems(onChange); }
  catch (e) {
    console.warn("live feed unavailable:", e && e.message);
    return () => {};
  }
}

// ── maintenance ────────────────────────────────────────────────────────────
/**
 * Wipe every key this repository owns.
 *
 * v2.9.1: this existed and had no callers — including from "Delete my account",
 * which told her "Local data on this device has been cleared" while clearing
 * three unrelated keys. It is called now, and iterating `K` means a key added
 * later is covered without anyone remembering to come back here.
 */
export async function reset() {
  for (const k of Object.values(K)) await setJSON(k, null);
}

// v2.9.1: `exportUserData` was removed rather than fixed.
//
// It returned three fields, filtered listings on `i.owner === "You" || i.mine`
// — neither of which any code path sets — and had zero callers. The export
// screen used compliance/audit.js `exportAll()` instead, which returned five
// device keys and nothing from the server.
//
// A data-access request is now answered by `lili_export_me` in the database,
// where the data is, plus `exportAll()` for the handful of things that
// genuinely live only on the phone. Two half-implementations of the same
// obligation is one too many, and the one nobody calls is the one that rots.

export const BACKEND_SWAP = {
  note:
    "Replace these six with authenticated HTTP calls and the app becomes " +
    "multi-user. Nothing above this line changes.",
  functions: ["getItems", "addItem", "updateItem", "getShops", "createShop", "updateShop"],
  endpoints: {
    "GET  /items": "getItems — paginated, filtered by market and status=live",
    "POST /items": "addItem — server assigns id, runs screening, sets status",
    "PATCH /items/:id": "updateItem — ownership enforced server-side",
    "GET  /shops": "getShops",
    "POST /shops": "createShop — requires an accepted seller agreement",
    "PATCH /shops/:id": "updateShop — status changes come from moderation only",
  },
  rules: [
    "Never trust a client-supplied id, owner, price or status",
    "Screening runs server-side too — the client check is a courtesy, not a gate",
    "Soft delete only; moderation needs the history",
    "Every write is attributed to an authenticated user",
  ],
};
