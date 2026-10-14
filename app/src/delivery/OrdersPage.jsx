import { useEffect, useState, lazy, Suspense } from "react";
import { C, Shell } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import * as remote from "../backend/remote.js";
import { PAYMENTS_LIVE } from "../compliance/sellerRules.js";
import { carrier, inLang, ORDER_STATES, ISSUE_REASONS, SHIP_WITHIN_DAYS, AUTO_RELEASE_DAYS, UNPAID_MINUTES } from "./carriers.js";
import { t, getLang } from "../i18n/t.js";
import { money, when } from "../i18n/direction.js";

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

const ReviewPrompt = lazy(() => import("../trust/ReviewPrompt.jsx"));

const TABS = [["buyer", "purchases"], ["seller", "shop_orders"], ["wallet", "wallet"]];
const aed = (n) => money(Number(n || 0));
const day = (s) => (s ? when(s, { day: "numeric", month: "short", timeZone: "Asia/Dubai" }) : "");
const lang = () => getLang();

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
    if (tab === "wallet") { setWallet(null); remote.myWallet().then(setWallet).catch((e) => setProblem(e.message || t("couldnt_load_wallet"))); }
    else { setOrders(null); remote.myOrders(tab).then(setOrders).catch((e) => setProblem(e.message || t("couldnt_load_orders"))); }
  }, [tab, n, signedIn]);

  return (
    <Shell title={t("my_orders")} onBack={onBack}>
      <div role="tablist" aria-label={t("my_orders")} style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            style={{ flex: 1, minHeight: 40, borderRadius: 20, cursor: "pointer", fontWeight: 700, fontSize: 13,
              fontFamily: "inherit", border: `1.5px solid ${tab === k ? C.terra : C.border}`,
              background: tab === k ? C.sand : C.white, color: C.ink }}>{t(l)}</button>
        ))}
      </div>

      {!signedIn ? (
        <div style={note}>{t("sign_in_to_see_orders")} <button onClick={onSignIn} style={link}>{t("sign_in")}</button></div>
      ) : problem ? (
        <div role="alert" style={{ ...note, color: C.redTx }}>{problem} <button onClick={reload} style={link}>{t("try_again")}</button></div>
      ) : tab === "wallet" ? (
        <Wallet w={wallet} onChanged={reload} />
      ) : orders === null ? (
        <p style={para}>{t("loading")}</p>
      ) : orders.length === 0 ? (
        <div style={note}>{tab === "buyer" ? t("nothing_bought_yet") : t("no_shop_orders_yet")}</div>
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
    try { await fn(); setMode(null); onChanged(); } catch (e) { setErr((e && e.message) || t("didnt_work")); }
    setBusy(false);
  };

  const toneColor = { act: C.terraTx, warn: C.redTx, done: C.ink, wait: C.inkLt, off: C.inkLt }[st.tone];
  return (
    <article style={card} aria-label={`${(o.items || []).map((i) => i.title).join(", ")}, ${inLang(st, "label", lang())}`}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: C.ink }}>
          {(o.items || []).map((i) => i.title).join(lang() === "ar" ? "، " : ", ")}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: toneColor, whiteSpace: "nowrap" }}>{inLang(st, "label", lang())}</div>
      </div>
      <div style={sub}>
        {as === "buyer" ? t("from_shop", { shop: o.shop_name || "…" }) : t("sold_lower")} · {day(o.created_at)} · {c ? inLang(c, "name", lang()) : o.method}
        {o.region === "GCC" ? ` · ${t("region_gcc")}` : ""}
      </div>
      <div style={{ ...sub, color: C.ink }}>
        {t("items_plus_delivery", { items: aed(o.items_total), fee: Number(o.delivery_fee) ? aed(o.delivery_fee) : t("free_lower") })} = <b>{aed(o.total)}</b>
      </div>

      {/* what happens next, in one line */}
      <div style={{ ...sub, marginTop: 6 }}>{nextLine(o, as)}</div>

      {o.tracking && (
        <div style={{ ...sub, color: C.ink }}>
          {t("tracking_label")} <b style={{ userSelect: "all" }} dir="ltr">{o.tracking}</b>
          {c && c.track && <> · <a href={c.track(o.tracking)} target="_blank" rel="noopener noreferrer" style={link}>{t("track")}</a></>}
        </div>
      )}
      {as === "seller" && o.ship_to && o.state === "paid" && courier && (
        <div style={addr}>
          <b>{t("send_to")}</b><br />
          {o.ship_to.name} · {o.ship_to.phone}<br />
          {o.ship_to.line1}{o.ship_to.line2 ? `, ${o.ship_to.line2}` : ""}<br />
          {o.ship_to.city}, {o.ship_to.country}
        </div>
      )}
      {o.issue && o.issue.reason && (
        <div style={{ ...sub, color: C.ink }}>
          {t("problem_label")} {(() => { const r = ISSUE_REASONS.find((x) => x[0] === o.issue.reason);
            return r ? (lang() === "ar" ? r[2] : r[1]) : o.issue.reason; })()}
          {o.issue.outcome ? ` · ${o.issue.outcome === "refund" ? t("decided_refund") : t("decided_release")}` : ""}
        </div>
      )}

      {/* actions */}
      {!mode && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {as === "seller" && o.state === "paid" && (
            <button onClick={() => setMode("ship")} style={btn}>{courier ? t("mark_as_sent") : t("mark_as_handed_over")}</button>)}
          {as === "seller" && o.state === "paid" && (
            <button onClick={() => setMode("cancel")} style={ghost}>{t("cancel_and_refund")}</button>)}
          {as === "buyer" && o.state === "shipped" && (
            <button onClick={() => setMode("received")} style={btn}>{t("i_have_it")}</button>)}
          {as === "buyer" && (o.state === "paid" || o.state === "shipped") && (
            <button onClick={() => setMode("issue")} style={ghost}>{t("report_a_problem")}</button>)}
          {as === "buyer" && o.state === "awaiting_payment" && (
            <button onClick={() => run(() => remote.payForOrder(o.id))} disabled={busy} style={btn}>{t("pay_now")}</button>)}
          {as === "buyer" && o.state === "awaiting_payment" && (
            <button onClick={() => run(() => remote.cancelOrder(o.id, "buyer changed mind"))} disabled={busy} style={ghost}>{t("cancel")}</button>)}
        </div>
      )}

      {mode === "ship" && (
        <div style={box}>
          {courier ? <>
            <label style={lbl} htmlFor={`trk-${o.id}`}>{t("courier_tracking_number", { carrier: c ? inLang(c, "name", lang()) : "" })}</label>
            <input id={`trk-${o.id}`} value={tracking} onChange={(e) => setTracking(e.target.value)} style={field}
              autoCapitalize="characters" autoComplete="off" />
            <p style={para}>{t("buyer_window_note", { days: AUTO_RELEASE_DAYS })}</p>
          </> : <p style={para}>{t("handed_over_note")}</p>}
          <Row>
            <button onClick={() => run(() => remote.markShipped(o.id, tracking.trim()))}
              disabled={busy || (courier && tracking.trim().length < 4)} style={btn}>{busy ? t("saving") : t("confirm")}</button>
            <button onClick={() => setMode(null)} style={ghost}>{t("back")}</button>
          </Row>
        </div>
      )}
      {mode === "received" && (
        <div style={box}>
          <p style={{ ...para, color: C.ink }}>{t("received_warning")}</p>
          <Row>
            <button onClick={() => run(() => remote.confirmReceived(o.id))} disabled={busy} style={btn}>
              {busy ? t("saving") : t("yes_i_have_it")}</button>
            <button onClick={() => setMode(null)} style={ghost}>{t("not_yet")}</button>
          </Row>
        </div>
      )}
      {mode === "issue" && (
        <div style={box}>
          <label style={lbl} htmlFor={`why-${o.id}`}>{t("what_went_wrong")}</label>
          <select id={`why-${o.id}`} value={reason} onChange={(e) => setReason(e.target.value)} style={field}>
            {ISSUE_REASONS.map(([k, l, ar]) => <option key={k} value={k}>{lang() === "ar" ? ar : l}</option>)}
          </select>
          <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} aria-label={t("what_happened")}
            placeholder={t("what_happened")} style={{ ...field, resize: "vertical" }} />
          <p style={para}>{t("held_while_looked_at")}</p>
          <Row>
            <button onClick={() => run(() => remote.reportOrderIssue(o.id, reason, detail.trim()))}
              disabled={busy || detail.trim().length < 10} style={btn}>{busy ? t("sending") : t("report")}</button>
            <button onClick={() => setMode(null)} style={ghost}>{t("back")}</button>
          </Row>
        </div>
      )}
      {mode === "cancel" && (
        <div style={box}>
          <p style={{ ...para, color: C.ink }}>{t("cancel_refund_note")}</p>
          <Row>
            <button onClick={() => run(() => remote.cancelOrder(o.id, "seller cancelled"))} disabled={busy} style={btn}>
              {busy ? t("cancelling") : t("cancel_the_order")}</button>
            <button onClick={() => setMode(null)} style={ghost}>{t("back")}</button>
          </Row>
        </div>
      )}
      {err && <div role="alert" style={{ fontSize: 12, color: C.redTx, marginTop: 6 }}>{err}</div>}
      {/* Both sides may review a completed order for 14 days (migration 36). */}
      {o.review_open && !o.reviewed && !mode && (
        <div style={box}>
          <Suspense fallback={null}>
            <ReviewPrompt orderId={o.id} otherRole={as === "buyer" ? "seller" : "buyer"} />
          </Suspense>
        </div>
      )}
    </article>
  );
}

function nextLine(o, as) {
  const buyer = as === "buyer";
  switch (o.state) {
    case "awaiting_payment": return buyer ? t("next_await_buyer", { min: UNPAID_MINUTES }) : t("next_await_seller");
    case "paid": return buyer
      ? t("next_paid_buyer", { date: day(o.ship_by) })
      : t("next_paid_seller", { date: day(o.ship_by), days: SHIP_WITHIN_DAYS });
    case "shipped": return buyer
      ? t("next_shipped_buyer", { date: day(o.release_at) })
      : t("next_shipped_seller", { date: day(o.release_at) });
    case "disputed": return t("next_disputed");
    case "completed": return buyer ? t("next_done_buyer") : t("next_done_seller");
    case "refunded": return t("next_refunded");
    case "cancelled": return o.cancel_reason ? t("next_cancelled_reason", { reason: o.cancel_reason }) : t("next_cancelled");
    default: return "";
  }
}

function Wallet({ w, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!w) return <p style={para}>{t("loading")}</p>;
  const connect = async () => {
    setBusy(true); setErr("");
    try { await remote.connectPayouts(); } catch (e) {
      setErr(e && e.message === "payments_not_configured" ? t("payouts_not_on") : (e && e.message) || t("didnt_work"));
    }
    setBusy(false); onChanged();
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
        {[[t("held"), w.held, t("held_hint")], [t("releasing"), w.releasing, t("releasing_hint")],
          [t("paid_out"), w.paid_out, t("paid_out_hint")]].map(([l, v, h]) => (
          <div key={l} style={{ ...card, padding: 10 }}>
            <div style={{ fontSize: 11, color: C.inkLt, fontWeight: 700, textTransform: "uppercase" }}>{l}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, margin: "2px 0" }}>{aed(v)}</div>
            <div style={{ fontSize: 11, color: C.inkLt, lineHeight: 1.35 }}>{h}</div>
          </div>
        ))}
      </div>
      {!(PAYMENTS_LIVE && w.payments_enabled) ? (
        <div style={note}>{t("wallet_off")}</div>
      ) : w.payout_ready ? (
        <div style={note}><Icon name="check" size={16} style={{ color: C.terraTx, verticalAlign: "middle" }} /> {t("wallet_ready")}</div>
      ) : (
        <div style={note}>
          {t("wallet_connect")}
          <div style={{ marginTop: 8 }}>
            <button onClick={connect} disabled={busy} style={btn}>
              {busy ? t("opening_stripe") : w.payout_connected ? t("finish_connecting_bank") : t("connect_your_bank")}</button>
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
