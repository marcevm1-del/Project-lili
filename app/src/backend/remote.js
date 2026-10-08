// ─────────────────────────────────────────────────────────────────────────────
//  REMOTE BACKEND — Supabase
//
//  Implements exactly the signatures repo.js already calls, so switching from
//  device-local to multi-user changes no component.
//
//  Everything here assumes it can be lied to. The DATABASE decides a listing's
//  status, a shop's follower count, and who may read the moderation queue —
//  this file only asks. Bypass the app and call PostgREST by hand and the same
//  rules apply, because they are row-level policies and triggers, not code.
// ─────────────────────────────────────────────────────────────────────────────
let cfg = null, client = null;

export function isConfigured() { return !!(cfg && cfg.url && cfg.publishableKey); }

export function configure(next) {
  cfg = next && next.url && next.publishableKey ? next : null;
  if (!cfg) client = null;
  return isConfigured();
}

async function db() {
  if (client) return client;
  if (!isConfigured()) throw new Error("Backend is not configured");
  const { createClient } = await import("@supabase/supabase-js");
  client = createClient(cfg.url, cfg.publishableKey, {
    // public schema, prefixed table names: served by the API with no
  // dashboard configuration, and still cannot collide with the other
  // application already living in public.
  db: { schema: "public" },
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

// Anonymous first. A shopper should never meet a sign-in wall just to look;
// identity is asked for at the first payout, where it actually matters.
let signInBlocked = false;

/**
 * Anonymous first — a shopper should never meet a sign-in wall just to look.
 *
 * If anonymous sign-in is switched off for the project this cannot succeed, so
 * it says so once and stops asking. Browsing still works (the catalogue is
 * readable without a session); anything that needs an identity falls back to
 * the device, which is what repo.js does with the error.
 */
export async function ensureUser() {
  const sb = await db();
  const { data: { session } } = await sb.auth.getSession();
  if (session && session.user) return session.user;
  if (signInBlocked) throw new Error("SIGN_IN_UNAVAILABLE");
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) {
    if (/anonymous/i.test(error.message || "")) {
      signInBlocked = true;
      console.warn("lili: anonymous sign-in is disabled for this project — " +
                   "browsing is live, personal data stays on the device.");
      throw new Error("SIGN_IN_UNAVAILABLE");
    }
    throw error;
  }
  return data.user;
}

/** True when the backend can serve a signed-in session. */
export const canSignIn = () => !signInBlocked;
export async function currentUid() { return (await ensureUser()).id; }

// Columns the server owns.
//
// v2.9: this list used to be the only thing standing between a seller and her
// own `previous_price` — and a list in JavaScript on a handset stops nobody
// holding the publishable key, who can post straight to PostgREST without it.
// Migration `lili_items_server_owned_columns` now revokes UPDATE on every one
// of these from `authenticated` and `anon`. Read what follows as an echo of
// that grant; the two are changed together or not at all.
const SERVER_OWNED = ["id","owner_uid","status","screening","followers","strikes","created_at","updated_at",
                      // written by lili.notify_price_drop; a seller inventing a
                      // higher "previous" price would be inventing a discount
                      "previous_price","price_changed_at",
                      // maintained by lili.bump_item_saves. A total nobody can
                      // inflate is the only reason it is worth showing, and the
                      // only reason "Most Saved" is a real sort option.
                      "saves"];
const clean = (o) => { const x = { ...(o||{}) }; SERVER_OWNED.forEach(k => delete x[k]); return x; };

const fromRow = (r) => r && ({ ...r,
  titleAr: r.title_ar, nameAr: r.name_ar, shopId: r.shop_id,
  previousPrice: r.previous_price,
  sellerType: r.seller_type, desc: r.description,
  photo: Array.isArray(r.photos) && r.photos.length ? r.photos[0] : null,
  // what a tile should load: the small one when we have it
  thumb: Array.isArray(r.thumbs) && r.thumbs.length ? r.thumbs[0]
       : (Array.isArray(r.photos) && r.photos.length ? r.photos[0] : null) });

// ── the row allowlist ───────────────────────────────────────────────────────
//
// v2.8 fix, and the most expensive bug in the project so far.
//
// `toRow` used to be a DENYLIST: strip the handful of fields we knew about and
// send everything else. The listing object carries `category`, `subtitle`,
// `offers`, `isNew` and `hasStory`, and `lili_items` had columns for none of
// them. PostgREST refuses an insert naming a column it cannot find (PGRST204),
// so every attempt to publish a listing to the server failed — and
// `repo.addItem` caught the error, wrote a console.warn nobody reads, and
// saved the listing to the phone instead. The seller saw her piece in her
// shop. It had never left the device. `lili_items` held zero rows.
//
// A denylist has to be updated every time the client grows a field; the cost of
// forgetting is silent and total. An allowlist fails the other way: a new field
// is simply not sent until someone adds it here and to the schema, next to each
// other, where the mismatch is visible.
//
// `category` and `subtitle` are now real columns (migration
// lili_items_add_category_and_subtitle) because the price band reads them.
const ROW_COLUMNS = {
  lili_items: ["shop_id", "title", "title_ar", "subtitle", "brand", "price",
               "currency", "category", "condition", "size", "era", "color",
               "description", "photos", "thumbs", "authenticated", "market_code"],
  lili_shops: ["name", "name_ar", "bio", "banner", "seller_type", "market_code"],
};

const toRow = (o, table = "lili_items") => {
  const r = clean(o);
  if ("titleAr" in r)    { r.title_ar = r.titleAr; delete r.titleAr; }
  if ("nameAr" in r)     { r.name_ar = r.nameAr; delete r.nameAr; }
  if ("shopId" in r)     { r.shop_id = r.shopId; delete r.shopId; }
  if ("sellerType" in r) { r.seller_type = r.sellerType; delete r.sellerType; }
  if ("desc" in r)       { r.description = r.desc; delete r.desc; }
  if ("photo" in r)      { if (r.photo) r.photos = [r.photo]; delete r.photo; }

  const allowed = ROW_COLUMNS[table];
  if (!allowed) return r;
  const out = {};
  for (const k of allowed) if (k in r && r[k] !== undefined) out[k] = r[k];
  return out;
};

/**
 * Did this fail because the network is not there, or because the server said
 * no?
 *
 * The difference decides whether falling back to the device is correct
 * behaviour or a lie. Offline, the device copy is the whole point. A rejection
 * — a missing column, a policy refusal, a constraint — means the server has
 * looked at this write and refused it, and quietly saving it locally tells the
 * seller her listing is up when it is not.
 */
export function isOffline(e) {
  if (!e) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const m = String(e.message || e);
  return /failed to fetch|networkerror|network request failed|timeout|abort|ECONN|ENOTFOUND|socket/i.test(m);
}

export async function getItems({ limit = 60 } = {}) {
  const sb = await db();
  // Everyone's live pieces, plus her own in every state. Asking for live only
  // meant a seller who reopened the app lost sight of anything held for review
  // or sold — My Shop showed fewer pieces than she had listed. Row-level
  // security already lets an owner read her own rows; the feed filters them.
  const { data: { session } } = await sb.auth.getSession();
  const uid = session && session.user && session.user.id;
  let q = sb.from("lili_items").select("*");
  q = uid ? q.or(`status.eq.live,owner_uid.eq.${uid}`) : q.eq("status", "live");
  const { data, error } = await q.order("created_at",{ ascending:false }).limit(limit);
  if (error) throw error;
  return (data||[]).map(fromRow);
}

export async function addItem(item) {
  const sb = await db();
  const uid = await currentUid();
  const shop = await getMyShop();
  if (!shop) throw new Error("Open a shop before listing");
  // A data URL in a database column is a mistake that only shows up later, as
  // a slow feed and a bloated table. Photos go to storage; the row keeps links.
  const set = await uploadPhotoSet(
    item.photos || (item.photo ? [item.photo] : []),
    item.thumbs || (item.thumb ? [item.thumb] : []));
  const row = toRow(item);
  if (set.photos.length) row.photos = set.photos; else delete row.photos;
  if (set.thumbs.length) row.thumbs = set.thumbs; else delete row.thumbs;

  const { data, error } = await sb.from("lili_items")
    .insert({ ...row, owner_uid: uid, shop_id: shop.id }).select().single();
  if (error) throw error;
  return fromRow(data);   // status is the database's verdict, not our guess
}

export async function updateItem(id, patch) {
  const sb = await db();
  const { data, error } = await sb.from("lili_items").update(toRow(patch)).eq("id",id).select().single();
  if (error) throw error;
  return fromRow(data);
}

/**
 * Take a listing down.
 *
 * This used to update `status` directly, which the database does not let a
 * seller write, and it ignored the error: she was told the piece was gone and
 * it stayed live. `lili_withdraw_listing` checks it is hers and refuses while
 * a report about it is under review.
 */
export async function removeItem(id) {
  const sb = await db();
  const { error } = await sb.rpc("lili_withdraw_listing", { p_item: id });
  if (error) throw error;
  return id;
}

/** Mark a live piece sold (answers any open offers), or relist a sold one. */
export async function markSold(id, sold = true) {
  const sb = await db();
  const { data, error } = await sb.rpc("lili_mark_sold", { p_item: id, p_sold: !!sold });
  if (error) throw error;
  return data;
}

/** Live feed. Returns an unsubscribe function. */
export async function watchItems(onChange, { limit = 60 } = {}) {
  const sb = await db();
  const ch = sb.channel("lili-items")
    .on("postgres_changes", { event:"*", schema:"public", table:"lili_items" },
        async () => onChange(await getItems({ limit })))
    .subscribe();
  return () => sb.removeChannel(ch);
}

export async function getShops() {
  const sb = await db();
  const { data, error } = await sb.from("lili_shops").select("*").eq("status","active");
  if (error) throw error;
  return (data||[]).map(fromRow);
}

export async function createShop(form) {
  const sb = await db();
  const uid = await currentUid();
  const { data, error } = await sb.from("lili_shops")
    .insert({ ...toRow(form, "lili_shops"), owner_uid: uid }).select().single();
  if (error) throw error;
  return fromRow(data);
}

export async function updateShop(id, patch) {
  const sb = await db();
  const { data, error } = await sb.from("lili_shops").update(toRow(patch, "lili_shops")).eq("id",id).select().single();
  if (error) throw error;
  return fromRow(data);
}

export async function getMyShop() {
  const sb = await db();
  const uid = await currentUid();
  const { data, error } = await sb.from("lili_shops").select("*").eq("owner_uid",uid).maybeSingle();
  if (error) throw error;
  return fromRow(data);
}

export async function getFollowing() {
  const sb = await db(); const uid = await currentUid();
  const { data, error } = await sb.from("lili_follows").select("shop_id").eq("user_id",uid);
  if (error) throw error;
  return (data||[]).map(r => r.shop_id);
}

export async function toggleFollow(shopId) {
  const sb = await db(); const uid = await currentUid();
  const cur = await getFollowing();
  if (cur.includes(shopId)) {
    await sb.from("lili_follows").delete().eq("user_id",uid).eq("shop_id",shopId);
    return cur.filter(x => x !== shopId);
  }
  await sb.from("lili_follows").insert({ user_id: uid, shop_id: shopId });
  return [...cur, shopId];   // the count is maintained by a trigger
}

export async function getSaved() {
  const sb = await db(); const uid = await currentUid();
  const { data } = await sb.from("lili_saves").select("item_id").eq("user_id",uid);
  return (data||[]).map(r => r.item_id);
}

export async function toggleSave(itemId) {
  const sb = await db(); const uid = await currentUid();
  const cur = await getSaved();
  if (cur.includes(itemId)) {
    await sb.from("lili_saves").delete().eq("user_id",uid).eq("item_id",itemId);
    return cur.filter(x => x !== itemId);
  }
  await sb.from("lili_saves").insert({ user_id: uid, item_id: itemId });
  return [...cur, itemId];
}

export async function getCart() {
  const sb = await db(); const uid = await currentUid();
  const { data } = await sb.from("lili_carts").select("lines").eq("user_id",uid).maybeSingle();
  return (data && data.lines) || [];
}

export async function saveCart(lines) {
  const sb = await db(); const uid = await currentUid();
  await sb.from("lili_carts").upsert({ user_id: uid, lines, updated_at: new Date().toISOString() });
  return lines;
}

export async function enqueueCase(entry) {
  const sb = await db(); const uid = await currentUid();
  // No `.select()`: reading a case back needs SELECT on the table, which no
  // client holds — cases are private to moderators. Asking for the row made
  // every report fail with "permission denied" after it had been written, and
  // the dialog then filed it on the phone instead. The reporter's own copy is
  // read through lili_my_cases().
  const { error } = await sb.from("lili_moderation_cases").insert({
    kind: entry.kind || "listing", source: "user_report",
    target_item_id: entry.itemId || null, shop_id: entry.shopId || null,
    reasons: entry.reasons || [], detail: entry.detail || null, reported_by: uid,
  });
  if (error) throw error;
  return { id: null, state: "pending" };
}

// The queue is server-side, but a signed-in moderator can reach it through
// these functions. They run with elevated rights in the database and check the
// caller's claim first — a claim held in app_metadata, which only the service
// role can write, so nobody can grant it to themselves.
export async function isModerator() {
  try {
    const sb = await db();
    const { data } = await sb.rpc("lili_is_moderator");
    return data === true;
  } catch { return false; }
}

export async function listCases(state = null) {
  const sb = await db();
  const { data, error } = await sb.rpc("lili_moderation_list", { p_state: state });
  if (error) throw error;
  return data || [];
}

/**
 * The cases SHE filed — a different screen from the moderator's queue, and a
 * different RPC.
 *
 * `lili_moderation_list` is the queue and deliberately does not say who
 * reported what. "My reports" was calling it anyway, so a moderator saw every
 * case in the marketplace under a heading that said "My reports", and everybody
 * else saw only this phone's copy and so lost a report filed elsewhere.
 */
export async function myCases() {
  const sb = await db();
  await ensureUser();
  const { data, error } = await sb.rpc("lili_my_cases");
  if (error) throw error;
  return data || [];
}

export async function claimCase(caseId) {
  const sb = await db();
  const { data, error } = await sb.rpc("lili_moderation_claim", { p_case: caseId });
  if (error) throw error;
  return data;
}

/** Requires a reason: it is sent to the reporter AND the seller. */
export async function decideCase(caseId, decision, reason) {
  const sb = await db();
  const { data, error } = await sb.rpc("lili_moderation_decide", {
    p_case: caseId, p_decision: decision, p_reason: reason });
  if (error) throw error;
  return data;
}

// ── sign-in ────────────────────────────────────────────────────────────────
// Three ways in, and browsing needs none of them. Identity is required to sell
// and to be paid; a shopper looking at dresses should not have to prove who
// she is first.

export async function getSession() {
  const sb = await db();
  const { data } = await sb.auth.getSession();
  return (data && data.session) || null;
}

export async function signUpWithEmail(email, password) {
  const sb = await db();
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { emailRedirectTo: `${cfg.redirectTo || "https://lili.app"}/auth-callback` },
  });
  if (error) throw error;
  // With email confirmation on, signUp returns a user but no session — the
  // caller must say "check your email" rather than pretending it worked.
  return { user: data.user, session: data.session, needsConfirmation: !data.session };
}

export async function signInWithEmail(email, password) {
  const sb = await db();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

/** Emails a one-tap link. No password to forget, no password to leak. */
export async function sendMagicLink(email) {
  const sb = await db();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${cfg.redirectTo || "https://lili.app"}/auth-callback` },
  });
  if (error) throw error;
  return true;
}

export async function resetPassword(email) {
  const sb = await db();
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${cfg.redirectTo || "https://lili.app"}/auth-callback`,
  });
  if (error) throw error;
  return true;
}

/**
 * Google. On the phone this leaves the app for the system browser and returns
 * through the deep link registered in the native project, which is why the
 * redirect is a custom scheme rather than a web URL.
 */
export async function signInWithGoogle() {
  const sb = await db();
  const native = typeof window !== "undefined"
    && window.Capacitor && window.Capacitor.isNativePlatform
    && window.Capacitor.isNativePlatform();
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: native ? "com.loveitorleaveit.lili://auth-callback"
                         : `${window.location.origin}/`,
      skipBrowserRedirect: native,
    },
  });
  if (error) throw error;
  if (native && data && data.url) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: data.url, presentationStyle: "popover" });
  }
  return true;
}

/** Completes a deep-link return from Google. */
export async function completeOAuth(url) {
  const sb = await db();
  const frag = url.split("#")[1] || url.split("?")[1] || "";
  const p = new URLSearchParams(frag);
  const access_token = p.get("access_token");
  const refresh_token = p.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  const { data, error } = await sb.auth.setSession({ access_token, refresh_token });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  const sb = await db();
  await sb.auth.signOut();
  signInBlocked = false;
  return true;
}

export async function onAuthChange(cb) {
  const sb = await db();
  const { data } = sb.auth.onAuthStateChange((_e, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

// ── photos ─────────────────────────────────────────────────────────────────
// EXIF is stripped before this is ever called (see data/images.js) — a picture
// taken in someone's bedroom must not publish the address with it.

const BUCKET = "lili-photos";

function dataUrlToBlob(dataUrl) {
  const [head, b64] = String(dataUrl).split(",");
  const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Uploads one photo and returns a public URL. Already-remote URLs pass through
 * untouched, so re-saving a listing does not re-upload what is already there.
 */
export async function uploadPhoto(dataUrl) {
  if (!dataUrl || !String(dataUrl).startsWith("data:")) return dataUrl || null;
  const sb = await db();
  const uid = await currentUid();
  const blob = dataUrlToBlob(dataUrl);
  const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from(BUCKET)
    .upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Uploads what needs uploading, in parallel, and keeps the order. */
export async function uploadPhotos(list) {
  const arr = (list || []).filter(Boolean);
  if (!arr.length) return [];
  // Written by hand rather than with Promise.allSettled, which is Chrome 76:
  // an Android 9 or 10 WebView that has never updated throws on the method
  // name and loses every photograph in the batch. This is the same semantics
  // in four lines that work everywhere the app can start at all.
  const results = await Promise.all(arr.map((p) =>
    uploadPhoto(p).then((value) => ({ status: "fulfilled", value }),
                        (reason) => ({ status: "rejected", reason }))));
  return results
    .map((r, i) => (r.status === "fulfilled" ? r.value : arr[i]))
    .filter(Boolean);
}

/**
 * Uploads full images AND their small versions together.
 *
 * The pipeline already made a 400px thumbnail and discarded it, so a feed of
 * 180px tiles was downloading 1600px images — about twenty times the bytes,
 * on mobile data, for every tile on screen. The feed reads thumbs; the item
 * detail reads photos.
 */
export async function uploadPhotoSet(photos, thumbs) {
  const full = (photos || []).filter(Boolean);
  if (!full.length) return { photos: [], thumbs: [] };
  const small = (thumbs || []).filter(Boolean);
  const [up, upThumbs] = await Promise.all([
    uploadPhotos(full),
    small.length ? uploadPhotos(small) : Promise.resolve([]),
  ]);
  // Only keep thumbs that line up one-to-one; a mismatched pairing would show
  // the wrong garment on a tile, which is worse than showing a big one.
  return { photos: up, thumbs: upThumbs.length === up.length ? upThumbs : [] };
}

// ── messages ───────────────────────────────────────────────────────────────
// The most sensitive data here: two named women arranging where to meet. Every
// read is scoped by row-level policy to the two participants — a shop owner,
// a moderator through the API, and anyone holding this key all see nothing.

export async function getConversations() {
  const sb = await db();
  const uid = await currentUid();
  const { data, error } = await sb.from("lili_conversations")
    .select("*").or(`buyer_uid.eq.${uid},seller_uid.eq.${uid}`)
    .order("last_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((c) => ({ ...c, mine: c.buyer_uid === uid ? "buyer" : "seller" }));
}

/** Opens the thread, or returns the existing one — one thread per piece. */
export async function openConversation({ sellerUid, shopId, itemId }) {
  const sb = await db();
  const uid = await currentUid();
  if (sellerUid === uid) throw new Error("That's your own listing");
  let find = sb.from("lili_conversations").select("*")
    .eq("buyer_uid", uid).eq("seller_uid", sellerUid);
  // `.eq(col, null)` asks for `= NULL`, which matches nothing, so a thread
  // about the shop rather than a piece was opened again every time.
  find = itemId ? find.eq("item_id", itemId) : find.is("item_id", null);
  const { data: existing } = await find.limit(1).maybeSingle();
  if (existing) return existing;
  const { data, error } = await sb.from("lili_conversations")
    .insert({ buyer_uid: uid, seller_uid: sellerUid, shop_id: shopId || null,
              item_id: itemId || null }).select().single();
  if (error) throw error;      // a block on either side surfaces here
  return data;
}

export async function getMessages(conversationId) {
  const sb = await db();
  const { data, error } = await sb.from("lili_messages")
    .select("*").eq("conversation_id", conversationId)
    .order("created_at", { ascending: true }).limit(500);
  if (error) throw error;
  return data || [];
}

export async function sendMessage(conversationId, body) {
  const text = String(body || "").trim();
  if (!text) throw new Error("Nothing to send");
  if (text.length > 2000) throw new Error("That message is too long");
  const sb = await db();
  const uid = await currentUid();
  const { data, error } = await sb.from("lili_messages")
    .insert({ conversation_id: conversationId, sender_uid: uid, body: text })
    .select().single();
  if (error) throw error;
  return data;   // the thread preview is updated by a trigger, not a second call
}

export async function markRead(conversationId) {
  const sb = await db();
  const uid = await currentUid();
  await sb.from("lili_messages").update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId).neq("sender_uid", uid).is("read_at", null);
  return true;
}

/** Live thread. Returns an unsubscribe function. */
export async function watchMessages(conversationId, onMessage) {
  const sb = await db();
  const ch = sb.channel(`lili-msg-${conversationId}`)
    .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "lili_messages",
          filter: `conversation_id=eq.${conversationId}` },
        (p) => onMessage(p.new))
    .subscribe();
  return () => sb.removeChannel(ch);
}

// ── push registrations ─────────────────────────────────────────────────────
//
// The table is owner-only by policy, and `anon` holds no grant: a browsing
// session has no device to register. Nothing calls these yet —
// notifications/push.js refuses every path while there is no sender — but the
// storage side is written here so the day a sender is added, nobody invents a
// schema for device tokens in an afternoon.

// The version is passed in rather than imported: this module deliberately has
// no imports at all, so that the boundary between "what the app knows" and
// "what the database is asked" stays one-directional.
export async function registerPushToken(token, platform, appVersion) {
  const sb = await db();
  const uid = await currentUid();
  if (!uid) throw new Error("sign in first");
  const { data, error } = await sb.from("lili_push_tokens")
    .upsert({ user_id: uid, token, platform, app_version: appVersion || null,
              last_seen: new Date().toISOString() },
            { onConflict: "user_id,token" })
    .select().single();
  if (error) throw error;
  return data;
}

export async function removePushToken(token) {
  const sb = await db();
  const uid = await currentUid();
  const { error } = await sb.from("lili_push_tokens")
    .delete().eq("user_id", uid).eq("token", token);
  if (error) throw error;
  return true;
}

// ── search ─────────────────────────────────────────────────────────────────
/**
 * Bilingual, typo-tolerant search.
 *
 * Dubai shops in two languages, often in one sentence. A woman searching عباية
 * finds a listing titled "Black Abaya", and "dress" finds فستان — the database
 * bridges the two through a curated garment vocabulary, because no stemmer
 * knows those are the same thing.
 *
 * Each result carries how it was found: 'exact', 'translated' (matched through
 * the other language) or 'close' (a spelling near enough). Showing that is
 * honest — a woman should know why a result is in front of her.
 */
export async function searchItems(query, limit = 40) {
  const q = String(query || "").trim();
  if (!q) return [];
  const sb = await db();
  const { data, error } = await sb.rpc("lili_search", { p_query: q, p_limit: limit });
  if (error) throw error;
  return (data || []).map((r) => ({
    ...fromRow(r),
    matchKind: r.matched,            // exact | translated | close
  }));
}

/**
 * The garment vocabulary the server searches with.
 *
 * `discovery/search.js` carries a copy so a phone that has never been online
 * can still bridge عباية and "abaya". A copy drifts, so it is a seed: this
 * fetch replaces it, and `lili_search_terms` stays the single place a term is
 * added. Read-only for everyone; there is nothing personal in it.
 */
export async function getSearchTerms() {
  const sb = await db();
  const { data, error } = await sb.from("lili_search_terms")
    .select("english,arabic,aliases").limit(500);
  if (error) throw error;
  return data || [];
}

// ── her data, and getting rid of it ────────────────────────────────────────
//
// v2.9.1. "Delete my account" deleted nothing and told her it had: it appended
// a line to a device-local audit log, cleared three local keys, and rendered
// "Your deletion request is recorded. Local data on this device has been
// cleared." Neither half was true. One of sixteen tables was touched — and only
// because that one is never written server-side anyway.
//
// "Get a copy of my data" returned five local keys and omitted her shop, her
// listings, her messages, her offers and everything else on the server.
//
// UAE PDPL (Federal Decree-Law 45 of 2021): art. 15 access, art. 16 erasure.

/** Everything the database holds about this account, as one document. */
export async function exportMe() {
  const sb = await db();
  await ensureUser();
  const { data, error } = await sb.rpc("lili_export_me");
  if (error) throw error;
  return data;
}

/**
 * Erase this account, and hand back a receipt of what was NOT erased.
 *
 * Two things survive on purpose and both are named in the receipt: her messages
 * are redacted rather than removed, because a thread belongs to both people in
 * it; and a moderation case is kept, because it is evidence in somebody else's
 * complaint or in one against her. An erasure that quietly keeps things is the
 * same lie as one that quietly keeps everything.
 */
export async function eraseMe() {
  const sb = await db();
  await ensureUser();
  const { data, error } = await sb.rpc("lili_erase_me");
  if (error) throw error;
  try { await sb.auth.signOut(); } catch { /* the account is gone either way */ }
  return data;
}

// ── the meet ───────────────────────────────────────────────────────────────
//
// lili holds no money, so every transaction ends with two women standing in
// front of each other. That moment was covered by a sheet of static advice she
// had to open. It is a thing in the thread now: proposed by one, confirmed by
// the other, and readable afterwards by a moderator only through the consented
// disclosure route that already exists.
//
// The rules are in the database (trigger lili_meet_guard). The one that matters
// — you cannot confirm your own proposal — would be worth nothing as a client
// check, because the whole value of the plan is that both of them agreed.

export async function getMeets(conversationId) {
  const sb = await db();
  const { data, error } = await sb.from("lili_meets").select("*")
    .eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(10);
  if (error) throw error;
  return data || [];
}

export async function proposeMeet({ conversationId, itemId, placeKey, placeNote, meetAt }) {
  const sb = await db();
  await ensureUser();
  const { data, error } = await sb.from("lili_meets").insert({
    conversation_id: conversationId, item_id: itemId || null,
    place_key: placeKey, place_note: (placeNote || "").slice(0, 140) || null,
    meet_at: meetAt,
  }).select().single();
  if (error) throw error;
  return data;
}

/** confirmed | declined | cancelled | done — the trigger decides who may. */
export async function answerMeet(id, state) {
  const sb = await db();
  const { data, error } = await sb.from("lili_meets").update({ state }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

/** fine | no_show | felt_wrong. Written once; the trigger refuses an edit. */
export async function checkInMeet(id, how) {
  const sb = await db();
  const { data, error } = await sb.from("lili_meets")
    .update({ checkin_state: how, state: "done" }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

// ── invitations ────────────────────────────────────────────────────────────
//
// The private beta is the launch shape, and until v2.9 an invitation could only
// be created by typing SQL into a console. That is a weekly operation for a
// founder onboarding thirty women by hand, so it is a screen.
//
// All three are moderator-gated in the database (lili_is_moderator), not here.

/** Create invitations. Returns the codes. */
export async function mintInvites(count, label) {
  const sb = await db();
  const { data, error } = await sb.rpc("lili_mint_invites",
    { p_count: Math.max(1, Math.min(200, Number(count) || 1)), p_label: label || null });
  if (error) throw error;
  return (data || []).map((r) => (typeof r === "string" ? r : r.lili_mint_invites));
}

/**
 * The roster: every code, who used it, and whether she has actually listed.
 *
 * The last column is the one that matters. An invitation redeemed by someone
 * who never opened a shop is not a seller, and counting redemptions as sellers
 * is how a private beta convinces itself it is working.
 */
export async function inviteRoster() {
  const sb = await db();
  const { data, error } = await sb.rpc("lili_invite_roster");
  if (error) throw error;
  return data || [];
}

export async function revokeInvite(code) {
  const sb = await db();
  const { data, error } = await sb.rpc("lili_revoke_invite", { p_code: code });
  if (error) throw error;
  return !!data;
}

// ── consented analytics ────────────────────────────────────────────────────
/**
 * Send a batch of funnel events.
 *
 * `analytics/funnel.js` decides whether anything may be sent at all and scrubs
 * every payload; this only carries. `user_id` is deliberately not passed — the
 * column defaults to `auth.uid()` and the INSERT policy checks it, so a client
 * cannot file an event against someone else's account even if it tried.
 */
export async function sendEvents(rows) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  const sb = await db();
  await ensureUser();
  const payload = rows.slice(0, 100).map((r) => ({
    session_id: r.session_id, name: r.name,
    props: r.props || {}, app_version: r.app_version || null,
    lang: r.lang || null, dir: r.dir || null,
  }));
  const { error } = await sb.from("lili_events").insert(payload);
  if (error) throw error;
  return payload.length;
}

/**
 * Erase this account's events.
 *
 * Called when analytics consent is withdrawn. Under the PDPL a withdrawal that
 * only stops future collection is not erasure, so the toggle deletes. There is
 * no SELECT policy on the table, so this is a delete she cannot preview — which
 * is the correct trade: nobody, including her, can read events back through the
 * app, and the alternative would be a read path built for one screen.
 */
export async function eraseMyEvents() {
  const sb = await db();
  const uid = await currentUid();
  const { error } = await sb.from("lili_events").delete().eq("user_id", uid);
  if (error) throw error;
  return true;
}

// ── trust signals ──────────────────────────────────────────────────────────
/**
 * Computed by the database from what actually happened — sales, listings, how
 * fast she replies. There is no column a seller can write to, so none of it
 * can be inflated. Returns null when there is nothing earned to show, which is
 * the honest answer for a brand-new shop.
 */
export async function getShopStats(shopId) {
  if (!shopId) return null;
  const sb = await db();
  const { data, error } = await sb.rpc("lili_shop_stats", { p_shop: shopId });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) || null;
}

// ── notifications ──────────────────────────────────────────────────────────
/**
 * Yours and nobody else's — not the sender's, not a moderator's.
 *
 * Nothing here can be created from a client: a table anyone can insert into is
 * a channel for pushing strangers arbitrary text inside the app. Rows are
 * written by database triggers only, and the sole change a person may make is
 * marking one read.
 */
export async function getNotifications({ unreadOnly = false, limit = 50 } = {}) {
  const sb = await db();
  const uid = await currentUid();
  let q = sb.from("lili_notifications").select("*").eq("user_id", uid)
    .order("created_at", { ascending: false }).limit(limit);
  if (unreadOnly) q = q.is("read_at", null);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function unreadCount() {
  const sb = await db();
  const uid = await currentUid();
  const { count, error } = await sb.from("lili_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid).is("read_at", null);
  if (error) throw error;
  return count || 0;
}

export async function markNotificationRead(id) {
  const sb = await db();
  const uid = await currentUid();
  await sb.from("lili_notifications").update({ read_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", uid);
  return true;
}

export async function markAllNotificationsRead() {
  const sb = await db();
  const uid = await currentUid();
  await sb.from("lili_notifications").update({ read_at: new Date().toISOString() })
    .eq("user_id", uid).is("read_at", null);
  return true;
}

/** Live badge. Returns an unsubscribe function. */
export async function watchNotifications(onArrive) {
  const sb = await db();
  const uid = await currentUid();
  const ch = sb.channel(`lili-notif-${uid}`)
    .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "lili_notifications",
          filter: `user_id=eq.${uid}` },
        (p) => onArrive(p.new))
    .subscribe();
  return () => sb.removeChannel(ch);
}

// ── offers ─────────────────────────────────────────────────────────────────
// Haggling is how this market actually buys. The rules are the database's, not
// this file's: who may offer, on what, and what an expired offer means are all
// decided there, so bypassing the app changes nothing.

export async function makeOffer({ itemId, shopId, sellerUid, amount, message }) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Enter an amount");
  const sb = await db();
  const uid = await currentUid();
  if (uid === sellerUid) throw new Error("That's your own listing");
  const { data, error } = await sb.from("lili_offers").insert({
    item_id: itemId, shop_id: shopId || null,
    buyer_uid: uid, seller_uid: sellerUid,
    amount: value, message: (message || "").slice(0, 500) || null,
  }).select().single();
  if (error) {
    // The unique index is the friendliest of these errors to explain.
    if (/duplicate key/i.test(error.message)) {
      throw new Error("You already have an offer open on this piece");
    }
    throw error;
  }
  return data;
}

/**
 * Both sides of every offer.
 *
 * Each row says which side she is on (`role`) and whether she made it
 * (`mine`). The screen used to decide "is this mine?" from a `side` field the
 * server never sent, so on a live backend a buyer saw her own offer with
 * Accept / Decline / Counter — buttons the database then refused — and no way
 * to withdraw it. Who may answer is "whoever did not make it", which is also
 * what lets a buyer accept a seller's counter.
 */
export async function getOffers() {
  const sb = await db();
  const uid = await currentUid();
  const { data, error } = await sb.from("lili_offers").select("*")
    .or(`buyer_uid.eq.${uid},seller_uid.eq.${uid}`)
    .order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data || []).map((o) => {
    const role = o.buyer_uid === uid ? "buyer" : "seller";
    const madeBy = o.made_by || "buyer";
    // A lapsed offer reads as expired straight away; the hourly job only
    // catches the stored row up and tells the person who made it.
    const state = o.state === "pending" && new Date(o.expires_at) < new Date() ? "expired" : o.state;
    return { ...o, state, role, made_by: madeBy, mine: madeBy === role };
  });
}

const respond = async (offerId, state) => {
  const sb = await db();
  const { data, error } = await sb.from("lili_offers")
    .update({ state }).eq("id", offerId).select().single();
  if (error) throw error;      // expired, already decided, or not yours
  return data;
};

export const acceptOffer   = (id) => respond(id, "accepted");
export const declineOffer  = (id) => respond(id, "declined");
export const withdrawOffer = (id) => respond(id, "withdrawn");

/**
 * Reply to an offer with a different price.
 *
 * One call: `lili_counter_offer` marks the original countered and creates the
 * counter in the same transaction. Doing it in two steps from here left the
 * original stuck as "countered" whenever the second step failed — and it
 * always failed, because the insert policy only lets a buyer create an offer.
 */
export async function counterOffer(offerId, amount, message) {
  const sb = await db();
  const { data, error } = await sb.rpc("lili_counter_offer", {
    p_offer: offerId, p_amount: Number(amount),
    p_message: (message || "").slice(0, 500) || null });
  if (error) throw error;
  return data;
}

export const BACKEND = "supabase";

// ── private beta ────────────────────────────────────────────────────────────
//
// The real control is in the row-level policies (migration
// lili_private_beta_invites): shops_create, items_create and conv_create all
// require lili_is_beta_member(). Everything below is so the interface can be
// honest about it in advance rather than letting a woman fill in a whole
// listing and meet a refusal at the end.
//
// Nothing here is trusted. If this said "you're a member" and the server
// disagreed, the insert would still fail — which is the right way round.

/** Is the signed-in user allowed to sell and message during the beta? */
export async function isBetaMember() {
  const sb = await db();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return false;
  const { data, error } = await sb.rpc("lili_is_beta_member");
  if (error) return false;
  return data === true;
}

/**
 * Redeem an invite code. Returns { ok, reason } straight from the database:
 * 'welcome' | 'already_a_member' | 'unknown' | 'already_used' |
 * 'sign_in_required' | 'empty'.
 */
export async function redeemInvite(code) {
  const sb = await db();
  await ensureUser();                       // a code is redeemed against a uid
  const { data, error } = await sb.rpc("lili_redeem_invite", { p_code: code });
  if (error) throw error;
  return data || { ok: false, reason: "unknown" };
}


// ── reporting a conversation, with consent ──────────────────────────────────
//
// The moderation gap this closes: nothing could read a reported thread, so a
// harassment report could be filed and never assessed. The fix gives moderators
// no new power. A participant may attach a copy of HER OWN conversation to HER
// OWN report — something she can already read — and only if she chooses to.
//
// The snapshot is frozen at report time, has no RLS policy at all (unreadable
// from any client), and is opened only through lili_case_transcript(), which
// writes an audit row on every read.

export async function reportConversation({ conversationId, reasons, detail,
                                           attachTranscript = false }) {
  const sb = await db();
  await ensureUser();
  const { data, error } = await sb.rpc("lili_report_conversation", {
    p_conversation_id: conversationId,
    p_reasons: Array.isArray(reasons) ? reasons : [reasons].filter(Boolean),
    p_detail: String(detail || "").slice(0, 2000),
    p_attach_transcript: !!attachTranscript,
  });
  if (error) throw error;
  return data || { ok: false, reason: "unknown" };
}

/** Moderator only. Every call writes an audit row the client cannot erase. */
export async function caseTranscript(caseId) {
  const sb = await db();
  const { data, error } = await sb.rpc("lili_case_transcript", { p_case: caseId });
  if (error) throw error;
  return data;
}
