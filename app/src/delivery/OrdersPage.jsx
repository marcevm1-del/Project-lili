import { useEffect, useState } from "react";
import { C, Shell } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import * as remote from "../backend/remote.js";
import { PAYMENTS_LIVE } from "../compliance/sellerRules.js";
import { carrier, ORDER_STATES, ISSUE_REASONS, SHIP_WITHIN_DAYS, AUTO_RELEASE_DAYS } from "./carriers.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Profile → My purchases · My shop orders · My wallet
//
//  One screen, three tabs, for everything after Buy:
//    buyer   follows the parcel, confirms it arrived (which releases the money)
//            or reports a problem (which keeps it held until lili decides);
//    seller  sees the address once it's paid, sends it, adds the tracking;
//    wallet  what's held, what's on its way to her bank, what's been paid.
//
//  Every rule shown here is enforced by the database (migration 33); the screen
//  only explains it.
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [["buyer", "Purchases"], ["seller", "Shop orders"], ["wallet", "Wallet"]];
const aed = (n) => `AED ${Number(n || 0).toLocaleString("en-US")}`;
const day = (s) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

export default function OrdersPage({ initial = "buyer", onBack, onSignIn, signedIn }) {
  const [tab, setTab] = useState(initial);
  const [orders, setOrders] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [problem, setProblem] = useState("");
  const [n, setN] = useState(0);
  const reload = () => setN((x) => x + 1);

  useEffect(() => { if (signedIn) remote.settleMine(); }, [signedIn]);
  useEffect(() => {
    if (!signedIn) return;
    setProblem("");
    if (tab === "wallet") { setWallet(null); remote.myWallet().then(setWallet).catch((e) => setProblem(e.message || "Couldn't load your wallet.")); }
    else { setOrders(null); remote.myOrders(tab).then(setOrders).catch((e) => setProblem(e.message || "Couldn't load your orders.")); }
  }, [tab, n, signedIn]);

  return (
    <Shell title="My orders" subtitle="طلباتي" onBack={onBack}>
      <div role="tablist" aria-label="Orders" style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            style={{ flex: 1, minHeight: 40, borderRadius: 20, cursor: "pointer", fontWeight: 700, fontSize: 13,
              // Selected was sand on a peach page — fainter than the white
              // unselected tabs, so the choice read backwards. Filled, as the
              // feed's own filter chips are.
              fontFamily: "inherit", border: `1.5px solid ${tab === k ? C.btn : C.border}`,
              background: tab === k ? C.btn : C.white, color: tab === k ? C.onBtn : C.ink }}>{l}</button>
        ))}
      </div>

      {!signedIn ? (
        <div style={note}>Sign in to see your orders. <button onClick={onSignIn} style={link}>Sign in</button></div>
      ) : problem ? (
        <div role="alert" style={{ ...note, color: C.redTx }}>{problem} <button onClick={reload} style={link}>Try again</button></div>
      ) : tab === "wallet" ? (
        <Wallet w={wallet} onChanged={reload} />
      ) : orders === null ? (
        <p style={para}>Loading…</p>
      ) : orders.length === 0 ? (
        <div style={note}>{tab === "buyer"
          ? "Nothing bought yet. When you buy with Buy, the order and its tracking show here."
          : "No orders yet. When someone buys from your shop, you'll see it here with the address to send it to."}</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {orders.map((o) => <OrderCard key={o.id} o={o} as={tab} onChanged={reload} />)}
        </div>
      )}
    </Shell>
  );
}

function OrderCard({ o, as, onChanged }) {
  const st = ORDER_STATES[o.state] || { label: o.state, tone: "off" };
  const c = carrier(o.method);
  const [mode, setMode] = useState(null);          // "ship" | "issue" | "received" | "cancel"
  const [tracking, setTracking] = useState("");
  const [reason, setReason] = useState("not_received");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const courier = o.method !== "meet";

  const run = async (fn) => {
    setBusy(true); setErr("");
    try { await fn(); setMode(null); onChanged(); } catch (e) { setErr((e && e.message) || "That didn't work. Try again."); }
    setBusy(false);
  };

  const toneColor = { act: C.terraTx, warn: C.redTx, done: C.ink, wait: C.inkLt, off: C.inkLt }[st.tone];
  return (
    <article style={card} aria-label={`Order from ${o.shop_name || "a shop"}, ${st.label}`}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>
          {(o.items || []).map((i) => i.title).join(", ") || "Order"}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: toneColor, whiteSpace: "nowrap" }}>{st.label}</div>
      </div>
      <div style={sub}>
        {as === "buyer" ? `from ${o.shop_name || "a shop"}` : "sold"} · {day(o.created_at)} · {c ? c.name : o.method}
        {o.region === "GCC" ? " · GCC" : ""}
      </div>
      <div style={{ ...sub, color: C.ink }}>
        {aed(o.items_total)} + delivery {Number(o.delivery_fee) ? aed(o.delivery_fee) : "free"} = <b>{aed(o.total)}</b>
      </div>

      {/* what happens next, in one line */}
      <div style={{ ...sub, marginTop: 6 }}>{nextLine(o, as)}</div>

      {o.tracking && (
        <div style={{ ...sub, color: C.ink }}>
          Tracking: <b style={{ userSelect: "all" }}>{o.tracking}</b>
          {c && c.track && <> · <a href={c.track(o.tracking)} target="_blank" rel="noopener noreferrer" style={link}>Track</a></>}
        </div>
      )}
      {as === "seller" && o.ship_to && o.state === "paid" && courier && (
        <div style={addr}>
          <b>Send to</b><br />
          {o.ship_to.name} · {o.ship_to.phone}<br />
          {o.ship_to.line1}{o.ship_to.line2 ? `, ${o.ship_to.line2}` : ""}<br />
          {o.ship_to.city}, {o.ship_to.country}
        </div>
      )}
      {o.issue && o.issue.reason && (
        <div style={{ ...sub, color: C.ink }}>
          Problem: {(ISSUE_REASONS.find((r) => r[0] === o.issue.reason) || [0, o.issue.reason])[1]}
          {o.issue.outcome ? ` · lili decided: ${o.issue.outcome === "refund" ? "refund the buyer" : "pay the seller"}` : ""}
        </div>
      )}

      {/* actions */}
      {!mode && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {as === "seller" && o.state === "paid" && (
            <button onClick={() => setMode("ship")} style={btn}>{courier ? "Mark as sent" : "Mark as handed over"}</button>)}
          {as === "seller" && o.state === "paid" && (
            <button onClick={() => setMode("cancel")} style={ghost}>Cancel and refund</button>)}
          {as === "buyer" && o.state === "shipped" && (
            <button onClick={() => setMode("received")} style={btn}>I have it</button>)}
          {as === "buyer" && (o.state === "paid" || o.state === "shipped") && (
            <button onClick={() => setMode("issue")} style={ghost}>Report a problem</button>)}
          {as === "buyer" && o.state === "awaiting_payment" && (
            <button onClick={() => run(() => remote.payForOrder(o.id))} disabled={busy} style={btn}>Pay now</button>)}
          {as === "buyer" && o.state === "awaiting_payment" && (
            <button onClick={() => run(() => remote.cancelOrder(o.id, "buyer changed mind"))} disabled={busy} style={ghost}>Cancel</button>)}
        </div>
      )}

      {mode === "ship" && (
        <div style={box}>
          {courier ? <>
            <label style={lbl} htmlFor={`trk-${o.id}`}>{c ? c.name : "Courier"} tracking number</label>
            <input id={`trk-${o.id}`} value={tracking} onChange={(e) => setTracking(e.target.value)} style={field}
              autoCapitalize="characters" autoComplete="off" />
            <p style={para}>The buyer has {AUTO_RELEASE_DAYS} days from now to confirm or report a problem; after that
              the money is released to you.</p>
          </> : <p style={para}>Only tap this once you've handed the piece over.</p>}
          <Row>
            <button onClick={() => run(() => remote.markShipped(o.id, tracking.trim()))}
              disabled={busy || (courier && tracking.trim().length < 4)} style={btn}>{busy ? "Saving…" : "Confirm"}</button>
            <button onClick={() => setMode(null)} style={ghost}>Back</button>
          </Row>
        </div>
      )}
      {mode === "received" && (
        <div style={box}>
          <p style={{ ...para, color: C.ink }}>Confirm only if the piece is in your hands and is what was described.
            This releases the money to the seller and can't be undone.</p>
          <Row>
            <button onClick={() => run(() => remote.confirmReceived(o.id))} disabled={busy} style={btn}>
              {busy ? "Saving…" : "Yes, I have it"}</button>
            <button onClick={() => setMode(null)} style={ghost}>Not yet</button>
          </Row>
        </div>
      )}
      {mode === "issue" && (
        <div style={box}>
          <label style={lbl} htmlFor={`why-${o.id}`}>What went wrong?</label>
          <select id={`why-${o.id}`} value={reason} onChange={(e) => setReason(e.target.value)} style={field}>
            {ISSUE_REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} aria-label="What happened"
            placeholder="What happened, in a sentence or two" style={{ ...field, resize: "vertical" }} />
          <p style={para}>The money stays held while lili looks at it. Both of you hear the decision and why.</p>
          <Row>
            <button onClick={() => run(() => remote.reportOrderIssue(o.id, reason, detail.trim()))}
              disabled={busy || detail.trim().length < 10} style={btn}>{busy ? "Sending…" : "Report"}</button>
            <button onClick={() => setMode(null)} style={ghost}>Back</button>
          </Row>
        </div>
      )}
      {mode === "cancel" && (
        <div style={box}>
          <p style={{ ...para, color: C.ink }}>The buyer gets a full refund and the piece goes back on sale.</p>
          <Row>
            <button onClick={() => run(() => remote.cancelOrder(o.id, "seller cancelled"))} disabled={busy} style={btn}>
              {busy ? "Cancelling…" : "Cancel the order"}</button>
            <button onClick={() => setMode(null)} style={ghost}>Back</button>
          </Row>
        </div>
      )}
      {err && <div role="alert" style={{ fontSize: 12, color: C.redTx, marginTop: 6 }}>{err}</div>}
    </article>
  );
}

function nextLine(o, as) {
  const buyer = as === "buyer";
  switch (o.state) {
    case "awaiting_payment": return buyer ? "Finish paying to hold it. Unpaid orders are cancelled after 30 minutes." : "Waiting for the buyer to pay.";
    case "paid": return buyer
      ? `Paid. The money is held. The seller has until ${day(o.ship_by)} to send it, or you're refunded in full.`
      : `Paid. Send it by ${day(o.ship_by)} (${SHIP_WITHIN_DAYS} days), or the buyer is refunded.`;
    case "shipped": return buyer
      ? `On its way. Tap "I have it" when it arrives. With no report, the money goes to the seller on ${day(o.release_at)}.`
      : `Sent. The money is released when she confirms, or on ${day(o.release_at)} if she doesn't report a problem.`;
    case "disputed": return "A problem was reported. The money stays held until lili decides.";
    case "completed": return buyer ? "Done. Enjoy it." : "Done. The money is on its way to you (see Wallet).";
    case "refunded": return "Refunded in full.";
    case "cancelled": return o.cancel_reason ? `Cancelled: ${o.cancel_reason}.` : "Cancelled.";
    default: return "";
  }
}

function Wallet({ w, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!w) return <p style={para}>Loading…</p>;
  const connect = async () => {
    setBusy(true); setErr("");
    try { await remote.connectPayouts(); } catch (e) {
      setErr(e && e.message === "payments_not_configured" ? "Payouts aren't switched on yet." : (e && e.message) || "That didn't work.");
    }
    setBusy(false); onChanged();
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
        {[["Held", w.held, "Paid by buyers, waiting for delivery"], ["Releasing", w.releasing, "On its way to your bank"],
          ["Paid out", w.paid_out, "Already in your bank"]].map(([l, v, h]) => (
          <div key={l} style={{ ...card, padding: 10 }}>
            <div style={{ fontSize: 11, color: C.inkLt, fontWeight: 700, textTransform: "uppercase" }}>{l}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: "2px 0" }}>{aed(v)}</div>
            <div style={{ fontSize: 11, color: C.inkLt, lineHeight: 1.35 }}>{h}</div>
          </div>
        ))}
      </div>
      {!(PAYMENTS_LIVE && w.payments_enabled) ? (
        <div style={note}>Paying in the app isn't switched on yet, so nothing is held here. Buyers pay you directly
          when you meet.</div>
      ) : w.payout_ready ? (
        <div style={note}><Icon name="check" size={16} style={{ color: C.terraTx, verticalAlign: "middle" }} /> Your bank
          account is connected through Stripe. Released money is paid to it automatically.</div>
      ) : (
        <div style={note}>
          To be paid, connect your bank account through Stripe (lili never sees your bank details). Money waits safely
          in Releasing until you do.
          <div style={{ marginTop: 8 }}>
            <button onClick={connect} disabled={busy} style={btn}>
              {busy ? "Opening Stripe…" : w.payout_connected ? "Finish connecting your bank" : "Connect your bank"}</button>
          </div>
        </div>
      )}
      {err && <div role="alert" style={{ fontSize: 12, color: C.redTx }}>{err}</div>}
    </div>
  );
}

const Row = ({ children }) => <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{children}</div>;

const card = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px" };
const sub = { fontSize: 12, color: C.inkLt, lineHeight: 1.5, marginTop: 2 };
const para = { fontSize: 12, color: C.inkLt, lineHeight: 1.55, margin: "0 0 8px" };
const note = { ...para, background: C.sand, borderRadius: 12, padding: "10px 12px" };
const addr = { fontSize: 12, color: C.ink, lineHeight: 1.5, background: C.sand, borderRadius: 10, padding: "8px 10px", marginTop: 8 };
const box = { marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}`, display: "grid", gap: 6 };
const lbl = { fontSize: 12, fontWeight: 700, color: C.ink };
const field = { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`,
  fontSize: 16, background: C.white, color: C.ink, fontFamily: "inherit" };
const btn = { background: C.btn, color: C.onBtn, border: "none", borderRadius: 22, padding: "0 18px", minHeight: 44,
  fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" };
const ghost = { ...btn, background: C.white, color: C.terraTx, border: `1.5px solid ${C.terra}` };
const link = { background: "none", border: "none", color: C.terraTx, fontWeight: 700, textDecoration: "underline", cursor: "pointer", padding: 0, fontSize: "inherit" };
