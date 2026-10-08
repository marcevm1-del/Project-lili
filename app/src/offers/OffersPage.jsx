import { useEffect, useState, useCallback } from "react";
import { C } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import * as offers from "../data/offers.js";
import { withTimeout, BUDGET, isTimeout } from "../ux/timeout.js";
import * as fees from "../data/fees.js";
import { t, getLang } from "../i18n/t.js";

// ─────────────────────────────────────────────────────────────────────────────
//  OFFERS — both sides of the haggle
//
//  Until v2.8 this screen did not exist. The profile menu carried a row reading
//  "Offers · \u0639\u0631\u0648\u0636" with a "Soon" badge, while the database held a complete
//  offer state machine that nothing in the app had ever called.
//
//  So a seller could receive an offer and have no way to see it, and a buyer
//  could make one and have no way to withdraw it. Both were true at the same
//  time, on the same table, in a market whose entire buying mechanism is
//  haggling.
//
//  What the interface enforces here is only what the database already enforces:
//  a buyer may withdraw and nothing else; a seller may accept, decline or
//  counter. If this file got it wrong, the row-level policies would still
//  refuse — this is the friendly copy of a rule that lives somewhere safer.
// ─────────────────────────────────────────────────────────────────────────────

const money = (n) => `AED ${Math.round(Number(n) || 0).toLocaleString()}`;

function timeLeft(offer) {
  const h = offers.hoursLeft(offer);
  if (h <= 0) return "expired";
  if (h < 1) return `${Math.round(h * 60)} min left`;
  if (h < 24) return `${Math.round(h)}h left`;
  return `${Math.round(h / 24)}d left`;
}

export default function OffersPage({ items = [], shops = [], onBack }) {
  const [list, setList] = useState([]);
  const [state, setState] = useState("loading");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [countering, setCountering] = useState(null);
  const [counterAmount, setCounterAmount] = useState("");

  // Bounded, for the same reason the notifications sheet is: an unreachable
  // server produces silence, not an error, and a spinner with no end is the
  // least honest state an interface can be in.
  const load = useCallback(async () => {
    try {
      const rows = await withTimeout(offers.getOffers(), BUDGET.interactive);
      setList(rows || []);
      setState("ready");
    } catch (e) {
      console.warn("offers:", e && e.message);
      setState(isTimeout(e) ? "unreachable" : "error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const act = async (id, fn) => {
    setBusy(id); setError(null);
    try { await fn(); await load(); }
    catch (e) { setError(e && e.message ? e.message : "That didn't go through."); }
    finally { setBusy(null); }
  };

  const mine = (o) => o.side === "buyer" || o.buyer_uid === "me";
  const incoming = list.filter((o) => !mine(o));
  const outgoing = list.filter((o) => mine(o));

  const Row = ({ o }) => {
    const item = items.find((i) => i.id === o.item_id) || {};
    const shop = shops.find((s) => s.id === o.shop_id) || {};
    const st = offers.displayState(o);
    const label = offers.STATE_LABEL[st] || offers.STATE_LABEL.pending;
    const open = st === "pending";
    const isBuyer = mine(o);

    return (
      <div style={{ background: C.white, border: `1px solid ${C.border}`,
                    borderRadius: 14, padding: "12px 14px", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ width: 44, height: 44, borderRadius: 8, flexShrink: 0,
                        overflow: "hidden", background: item.color || C.sand }}>
            {item.photo && <img src={item.photo} alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
              {item.title || "A piece"}
            </div>
            <div style={{ fontSize: 11, color: C.inkLt, marginTop: 1 }}>
              {isBuyer ? (shop.name || "Seller") : "Offer from a buyer"}
              {item.price ? ` · asking ${money(item.price)}` : ""}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.terraTx }}>
              {money(o.amount)}
            </div>
            <div style={{ fontSize: 10, color: open ? C.inkLt : C.ink,
                          fontWeight: open ? 400 : 700 }}>
              {open ? timeLeft(o) : label.en}
            </div>
          </div>
        </div>

        {o.message && (
          <div style={{ fontSize: 12, color: C.inkLt, lineHeight: 1.5,
                        marginTop: 8, paddingLeft: 55 }}>
            “{o.message}”
          </div>
        )}

        {o.delivered === false && (
          <div style={{ fontSize: 11, color: C.inkLt, marginTop: 8, paddingLeft: 55 }}>
            Not sent yet — waiting for signal.
          </div>
        )}

        {open && countering === o.id ? (
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <input value={counterAmount} onChange={(e) => setCounterAmount(e.target.value)}
              inputMode="decimal" aria-label="Counter amount" placeholder="Your price"
              style={{ flex: 1, padding: "10px 12px", borderRadius: 10,
                       border: `1px solid ${C.border}`, fontSize: 13, outline: "none",
                       fontFamily: "inherit" }} />
            <button onClick={() => act(o.id, async () => {
                      await offers.counterOffer(o.id, counterAmount);
                      setCountering(null); setCounterAmount("");
                    })}
              disabled={busy === o.id || !counterAmount}
              style={{ ...btn, background: counterAmount ? C.btn : C.sand,
                       color: counterAmount ? C.onBtn : C.inkLt }}>
              Send
            </button>
            <button onClick={() => { setCountering(null); setCounterAmount(""); }}
              style={{ ...btn, background: "none", color: C.inkLt,
                       border: `1px solid ${C.border}` }}>
              Cancel
            </button>
          </div>
        ) : open ? (
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            {isBuyer ? (
              // A buyer may ONLY withdraw. Not because this file says so —
              // because lili_offers says so, and this agrees with it.
              <button onClick={() => act(o.id, () => offers.withdrawOffer(o.id))}
                disabled={busy === o.id}
                style={{ ...btn, flex: 1, background: "none", color: C.terraTx,
                         border: `1.5px solid ${C.terra}` }}>
                {t("withdraw")}
              </button>
            ) : (
              <>
                <button onClick={() => act(o.id, () => offers.declineOffer(o.id))}
                  disabled={busy === o.id}
                  style={{ ...btn, flex: 1, background: "none", color: C.inkLt,
                           border: `1px solid ${C.border}` }}>
                  Decline
                </button>
                <button onClick={() => { setCountering(o.id); setCounterAmount(String(Math.round(o.amount * 1.1))); }}
                  disabled={busy === o.id}
                  style={{ ...btn, flex: 1, background: "none", color: C.terraTx,
                           border: `1.5px solid ${C.terra}` }}>
                  Counter
                </button>
                <button onClick={() => act(o.id, () => offers.acceptOffer(o.id))}
                  disabled={busy === o.id}
                  style={{ ...btn, flex: 1, background: C.btn, color: C.onBtn }}>
                  Accept
                </button>
              </>
            )}
          </div>
        ) : null}

        {st === "accepted" && (
          // Said once, plainly, at the only moment it matters. lili does not
          // hold the money, so "accepted" is a promise between two people and
          // the app must not imply more than that.
          //
          // The seller also sees what the agreed price means for her, because
          // an accepted offer is the moment she is deciding whether haggling
          // was worth it — and the fee is tiered, so a counter that drops a
          // piece into a lower band changes her take by more than the
          // difference in price.
          <div style={{ marginTop: 10, background: C.sand, borderRadius: 10,
                        padding: "10px 12px", fontSize: 11, color: C.ink, lineHeight: 1.55 }}>
            Agreed at {money(o.amount)}.
            {!isBuyer && fees.breakdown(o.amount) && (
              <> You would receive <b>{fees.money(fees.breakdown(o.amount).payout)}</b> after
              lili's {fees.breakdown(o.amount).ratePercent}% fee
              {!fees.COLLECTION_LIVE && <> — though nothing is deducted yet</>}.</>
            )}
            {" "}lili doesn't take payment or hold the
            piece — arrange the handover between yourselves, in the thread.
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ paddingBottom: 84 }}>
      <div style={{ padding: "18px 16px 8px" }}>
        {onBack && (
          <button onClick={onBack} aria-label="Back" className="tap-target"
            style={{ background: "none", border: "none", color: C.ink, cursor: "pointer",
                     padding: 0, marginBottom: 10, display: "flex" }}>
            <Icon name="back" size={18} stroke={2} />
          </button>
        )}
        <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 22,
                      color: C.ink }}>Offers</div>
        <div style={{ fontSize: 13, color: C.terraTx, marginBottom: 4 }}>العروض</div>
      </div>

      {error && (
        <div role="alert" style={{ margin: "0 16px 10px", background: "#FBF0EE",
          border: `1px solid ${C.red}`, borderRadius: 12, padding: "10px 12px",
          fontSize: 12, color: C.ink }}>{error}</div>
      )}

      <div style={{ padding: "0 16px" }}>
        {state === "loading" && (
          <div style={{ color: C.inkLt, fontSize: 13, padding: "30px 0", textAlign: "center" }}>
            Loading…
          </div>
        )}

        {(state === "unreachable" || state === "error") && (
          <div style={{ color: C.inkLt, fontSize: 13, padding: "40px 10px", textAlign: "center",
                        lineHeight: 1.65 }}>
            {state === "unreachable"
              ? "We couldn't reach lili just now. Your offers are safe — this is only the list."
              : "Something went wrong loading your offers."}
            <button onClick={() => { setState("loading"); load(); }}
              style={{ display: "block", margin: "14px auto 0", background: "none",
                       border: `1.5px solid ${C.terra}`, color: C.terraTx, borderRadius: 20,
                       padding: "8px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                       fontFamily: "inherit" }}>
              Try again
            </button>
          </div>
        )}

        {state !== "loading" && list.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 16px", color: C.inkLt }}>
            <Icon name="handshake" size={34} stroke={1.6} style={{ color: C.terra, marginBottom: 12 }} />
            <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 16,
                          color: C.terraTx }}>No offers yet</div>
            <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.6 }}>
              {getLang() === "ar"
                ? "العروض التي ترسلينها والعروض التي تصلك تظهر هنا."
                : "Offers you make and offers you receive both appear here."}
            </div>
          </div>
        )}

        {incoming.length > 0 && (
          <>
            <Head>{t("for_you_3")}</Head>
            {incoming.map((o) => <Row key={o.id} o={o} />)}
          </>
        )}
        {outgoing.length > 0 && (
          <>
            <Head>{t("yours")}</Head>
            {outgoing.map((o) => <Row key={o.id} o={o} />)}
          </>
        )}
      </div>

      {list.length > 0 && (
        <div style={{ fontSize: 11, color: C.inkLt, padding: "6px 16px 0", lineHeight: 1.6 }}>
          An offer expires {offers.EXPIRY_HOURS} hours after it is made. That is
          read from the clock, so nothing stays open because a job failed to run.
        </div>
      )}
    </div>
  );
}

const Head = ({ children }) => (
  <div style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase",
                color: C.terraTx, fontWeight: 700, margin: "14px 0 10px" }}>
    {children}
  </div>
);

const btn = {
  border: "none", borderRadius: 20, padding: "10px 14px", fontSize: 12,
  fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
};
