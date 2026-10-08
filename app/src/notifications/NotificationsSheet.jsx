import { useEffect, useState, useCallback } from "react";
import { C } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import * as remote from "../backend/remote.js";
import { useFocusTrap, dialogProps } from "../a11y/useFocusTrap.js";
import { withTimeout, BUDGET, isTimeout } from "../ux/timeout.js";

// ─────────────────────────────────────────────────────────────────────────────
//  NOTIFICATIONS
//
//  The bell in the header was a button with no onClick and a red dot that was
//  always lit. It said "you have something waiting" to every user, forever, and
//  opened nothing.
//
//  Underneath it, `lili_notifications` has been filling up correctly the whole
//  time. Rows are written by database triggers only — a table any client could
//  insert into would be a channel for pushing strangers arbitrary text inside
//  the app — and the only change a person can make is marking one read.
//
//  What was in there and never reached anybody:
//
//    · the moderation statement of reasons, to BOTH the reporter and the seller
//    · why a listing was screened out
//    · that an offer arrived, and how it was answered
//    · that a message is waiting
//
//  WHAT-WOULD-MAKE-IT-BEST describes fixing exactly this: "Moderation composed a
//  statement of reasons for the reporter AND the seller, returned it to the
//  moderator's own API call, and threw it away. Nobody it was written for ever
//  read it. A right of reply that never arrives is not a right of reply."
//
//  The composing was fixed. The reading was not. The sentence stayed true, one
//  layer further up, until now.
// ─────────────────────────────────────────────────────────────────────────────

// Kinds as the database actually writes them — see the CHECK on
// lili_notifications.kind. They were guessed here before, and one of them was
// wrong at the source too: offers were filed as `message` because the CHECK had
// no 'offer' value, so an offer arriving wore the chat icon and routed to the
// wrong screen.
const ICON = {
  message: "chat",
  offer: "handshake",
  price_drop: "tag",
  moderation_outcome: "scales",
  moderation_report_outcome: "scales",
  listing_live: "clock",
  listing_blocked: "ban",
  shop_action: "shield",
  // v2.9 — the meet. The CHECK on lili_notifications.kind was extended in the
  // same migration that added them, because forgetting that step is exactly how
  // offers came to be filed as kind='message'.
  meet_proposed: "handshake",
  meet_confirmed: "check",
  meet_declined: "clock",
  meet_cancelled: "ban",
};

const ago = (iso) => {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
};

export default function NotificationsSheet({ onClose, onOpenLink }) {
  const [list, setList] = useState([]);
  const [state, setState] = useState("loading");
  const trap = useFocusTrap(onClose);

  // Bounded. Without this the sheet sat on "Loading…" for as long as the app
  // was open whenever the server could not be reached — no error, no empty
  // state, just a spinner that never ended.
  const load = useCallback(async () => {
    if (!remote.isConfigured()) { setState("unavailable"); return; }
    try {
      const rows = await withTimeout(remote.getNotifications({ limit: 50 }), BUDGET.interactive);
      setList(rows || []);
      setState("ready");
    } catch (e) {
      console.warn("notifications:", e && e.message);
      setState(isTimeout(e) ? "unreachable" : "unavailable");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markAll = async () => {
    try { await remote.markAllNotificationsRead(); } catch { /* non-fatal */ }
    setList((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
  };

  const open = async (n) => {
    if (!n.read_at) {
      try { await remote.markNotificationRead(n.id); } catch { /* non-fatal */ }
      setList((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
    if (onOpenLink && n.link_kind) onOpenLink(n);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0,
      zIndex: 420, background: "#000a", display: "flex", flexDirection: "column",
      justifyContent: "flex-end" }}>
      <div ref={trap} {...dialogProps("Notifications")} onClick={(e) => e.stopPropagation()}
        className="safe-sheet"
        style={{ background: C.cream, borderRadius: "20px 20px 0 0", maxHeight: "82dvh",
                 overflowY: "auto", padding: "18px 16px 34px",
                 fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 20, color: C.ink }}>
              Notifications
            </div>
            <div style={{ fontSize: 11, color: C.terraTx }}>الإشعارات</div>
          </div>
          {list.some((n) => !n.read_at) && (
            <button onClick={markAll} className="tap-target"
              style={{ background: "none", border: "none", cursor: "pointer",
                       color: C.terraTx, fontSize: 12, fontWeight: 600 }}>
              Mark all read
            </button>
          )}
        </div>

        {state === "loading" && (
          <div style={{ color: C.inkLt, fontSize: 13, padding: "24px 0", textAlign: "center" }}>
            Loading…
          </div>
        )}

        {state === "unreachable" && (
          <div style={{ color: C.inkLt, fontSize: 13, padding: "24px 6px", lineHeight: 1.65,
                        textAlign: "center" }}>
            We couldn't reach lili just now.
            <button onClick={() => { setState("loading"); load(); }}
              style={{ display: "block", margin: "12px auto 0", background: "none",
                       border: `1.5px solid ${C.terra}`, color: C.terraTx, borderRadius: 20,
                       padding: "8px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                       fontFamily: "inherit" }}>
              Try again
            </button>
          </div>
        )}

        {state === "unavailable" && (
          // Honest about the device-only case rather than showing an empty list
          // that implies there is nothing to tell her.
          <div style={{ color: C.inkLt, fontSize: 13, padding: "24px 6px", lineHeight: 1.65,
                        textAlign: "center" }}>
            Notifications arrive once you're signed in and connected. Nothing is
            waiting on this device.
          </div>
        )}

        {state === "ready" && list.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 10px", color: C.inkLt }}>
            <Icon name="bell" size={30} stroke={1.6} style={{ color: C.terra, marginBottom: 10 }} />
            <div style={{ fontSize: 13, color: C.ink }}>Nothing yet</div>
            <div style={{ fontSize: 12, marginTop: 5, lineHeight: 1.6 }}>
              Offers, replies and decisions about your listings appear here.
            </div>
          </div>
        )}

        {list.map((n) => (
          <button key={n.id} onClick={() => open(n)} className="tap-target"
            style={{ display: "flex", gap: 12, width: "100%", textAlign: "left",
                     background: n.read_at ? "transparent" : C.white,
                     border: `1px solid ${n.read_at ? C.border : C.terra}`,
                     borderRadius: 12, padding: "12px 12px", marginBottom: 8,
                     cursor: "pointer", alignItems: "flex-start" }}>
            <Icon name={ICON[n.kind] || "bell"} size={14} stroke={2}
                  style={{ color: C.terraTx, marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: n.read_at ? 500 : 700, color: C.ink }}>
                {n.title}
              </div>
              {n.body && (
                <div style={{ fontSize: 12, color: C.inkLt, lineHeight: 1.55, marginTop: 3 }}>
                  {n.body}
                </div>
              )}
            </div>
            <span style={{ fontSize: 10, color: C.inkLt, flexShrink: 0 }}>{ago(n.created_at)}</span>
          </button>
        ))}

        {state === "ready" && list.length > 0 && (
          <div style={{ fontSize: 10, color: C.inkLt, marginTop: 10, lineHeight: 1.6 }}>
            These are written by lili itself — nobody can send you one directly.
          </div>
        )}
      </div>
    </div>
  );
}
