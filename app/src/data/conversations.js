import * as remote from "../backend/remote.js";
import { getJSON, setJSON } from "../compliance/store.js";

// ─────────────────────────────────────────────────────────────────────────────
//  CONVERSATIONS
//
//  This file did not exist until v2.8, and its absence was the most serious
//  thing wrong with the app.
//
//  The database has had real private threads for a while: one per piece,
//  visible only to the two participants, `anon` holding no grant at all,
//  messages that cannot be edited after sending, live delivery over a realtime
//  channel. `backend/remote.js` implements every one of those calls. The
//  handover describes them accurately.
//
//  Nothing called them. `MessagesPage` kept its threads in React state and
//  faked the other woman: a 1.2-second timer picked a reply from a hard-coded
//  array — "Yes, still available!", "Can you share your size?" — and the seller
//  never learned that anybody had written to her. A buyer had a warm
//  conversation with an array.
//
//  That is the same failure the offers system was fixed for, in the one place
//  where it matters most. In a marketplace that makes introductions rather than
//  taking payments, the introduction IS the product.
//
//  Same shape as repo.js: a backend that is configured and reachable answers;
//  otherwise the device does, and says so rather than inventing the other side.
// ─────────────────────────────────────────────────────────────────────────────

const K = {
  threads: "lili.threads.v1",
};

let remoteReady = false;
export function setRemoteReady(v) { remoteReady = !!v; }
export function isRemote() { return remoteReady; }

const nowISO = () => new Date().toISOString();

// ── device fallback ─────────────────────────────────────────────────────────
// A thread held on this device has exactly one participant. Anything written
// here is marked `delivered: false`, and the interface says so. The one thing
// this must never do is answer on the seller's behalf.
async function localThreads() { return getJSON(K.threads, []); }
async function saveLocal(list) { await setJSON(K.threads, list); }

export async function getConversations() {
  if (remoteReady) {
    try { return await remote.getConversations(); }
    catch (e) { console.warn("conversations fell back to the device:", e && e.message); }
  }
  return localThreads();
}

export async function openConversation({ sellerUid, shopId, itemId }) {
  if (remoteReady) {
    // A refusal here is meaningful — a seller who has blocked you, or an
    // invite-only beta you are not part of — so it is not swallowed.
    return remote.openConversation({ sellerUid, shopId, itemId });
  }
  const list = await localThreads();
  const found = list.find((t) => t.shop_id === shopId && t.item_id === itemId);
  if (found) return found;
  const thread = {
    id: `thread-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    shop_id: shopId || null, item_id: itemId || null,
    seller_uid: sellerUid || null, buyer_uid: "me",
    created_at: nowISO(), last_at: nowISO(), local: true,
  };
  await saveLocal([thread, ...list]);
  return thread;
}

export async function getMessages(conversationId) {
  if (remoteReady) {
    try { return await remote.getMessages(conversationId); }
    catch (e) { console.warn("messages fell back to the device:", e && e.message); }
  }
  const list = await localThreads();
  const t = list.find((x) => x.id === conversationId);
  return (t && t.msgs) || [];
}

/**
 * Send. On a configured backend a failure is raised, never hidden — the whole
 * point of this rewrite is that a message either reaches her or you are told it
 * did not.
 */
export async function sendMessage(conversationId, body) {
  const text = String(body || "").trim();
  if (!text) throw new Error("Nothing to send");
  if (text.length > 2000) throw new Error("That message is too long — 2,000 characters is the limit.");

  if (remoteReady) {
    try {
      return await remote.sendMessage(conversationId, text);
    } catch (e) {
      if (!remote.isOffline(e)) throw e;
      // Offline: hold it on the device, plainly marked as not sent.
      const held = await holdLocally(conversationId, text);
      const err = new Error("No signal — your message is saved but hasn't been sent yet.");
      err.code = "HELD_OFFLINE";
      err.held = held;
      throw err;
    }
  }
  return holdLocally(conversationId, text);
}

async function holdLocally(conversationId, text) {
  const list = await localThreads();
  const msg = {
    id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    conversation_id: conversationId, sender_uid: "me", body: text,
    created_at: nowISO(), delivered: false,
  };
  // `last_message` and `last_at` are what the thread list renders. On the
  // server they are written by the touch_conversation trigger; here nothing
  // wrote `last_message` at all, so a device thread with messages in it still
  // showed an empty preview.
  await saveLocal(list.map((t) => t.id === conversationId
    ? { ...t, msgs: [...(t.msgs || []), msg],
        last_at: msg.created_at, last_message: text.slice(0, 140) }
    : t));
  return msg;
}

export async function markRead(conversationId) {
  if (!remoteReady) return true;
  try { return await remote.markRead(conversationId); }
  catch { return false; }
}

/** Live thread. Returns an unsubscribe function; a no-op on device. */
export async function watchMessages(conversationId, onMessage) {
  if (!remoteReady) return () => {};
  try { return await remote.watchMessages(conversationId, onMessage); }
  catch (e) {
    console.warn("live thread unavailable:", e && e.message);
    return () => {};
  }
}
