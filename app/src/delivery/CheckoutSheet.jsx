import { useEffect, useState } from "react";
import { C } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import * as remote from "../backend/remote.js";
import * as store from "../compliance/store.js";
import { loadRates } from "./rates.js";
import { useFocusTrap, dialogProps } from "../a11y/useFocusTrap.js";
import { PAYMENTS_LIVE } from "../compliance/sellerRules.js";
import { carrier, COUNTRIES, regionFor, inLang, UNPAID_MINUTES, AUTO_RELEASE_DAYS, SHIP_WITHIN_DAYS } from "./carriers.js";
import { t, getLang } from "../i18n/t.js";
import { money } from "../i18n/direction.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Buy: one piece, or a bundle from one shop.
//
//  Where it's going → how it gets there (with the fee) → the address, only for
//  a courier → the total → Pay, which opens Stripe's own page. The money is held
//  by Stripe until she confirms the piece arrived.
//
//  While lili's payment account isn't connected the sheet says so and offers
//  the two ways that work today: an offer, or meeting in person.
// ─────────────────────────────────────────────────────────────────────────────

const SHIP_KEY = "lili.shipto.v1";   // the address, only if she ticks "remember"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIZE_ORDER = ["XL", "L", "M", "S", "XS"];

// What lili_delivery_quote does, for pieces the database doesn't hold: only
// the ways every piece allows, priced for the largest parcel among them.
async function localQuote(items, region) {
  const ways = items.map((i) => (Array.isArray(i.delivery) && i.delivery.length ? i.delivery : ["meet"]));
  const common = ways.reduce((a, w) => a.filter((k) => w.includes(k)));
  const size = SIZE_ORDER.find((s) => items.some((i) => i.parcelSize === s)) || "S";
  const rates = await loadRates();
  const out = [];
  for (const m of common) {
    if (m === "meet") { if (region === "UAE") out.push({ method: "meet", fee: 0, confirmed: true, size }); continue; }
    const r = rates.find((x) => x.carrier === m && x.size === size && x.region === region);
    if (r) out.push({ method: m, fee: r.fee, confirmed: r.confirmed, size });
  }
  return out;
}

export default function CheckoutSheet({ items, shopName, onClose, onDone, onSignIn, onOffer, onMessage }) {
  const trap = useFocusTrap(onClose);
  const ids = items.map((i) => i.id);
  const [country, setCountry] = useState("AE");
  const region = regionFor(country);
  const [quote, setQuote] = useState(null);
  const [method, setMethod] = useState(null);
  const [payOn, setPayOn] = useState(null);
  const [ship, setShip] = useState({ name: "", phone: "", line1: "", line2: "", city: "" });
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!PAYMENTS_LIVE) setPayOn(false);
    else remote.paymentsEnabled().then(setPayOn).catch(() => setPayOn(false));
    store.getJSON(SHIP_KEY, null).then((s) => { if (s) { setShip({ ...ship, ...s }); setRemember(true); if (s.country) setCountry(s.country); } })
      .catch(() => {});
  }, []);
  useEffect(() => {
    setQuote(null); setMethod(null);
    const show = (q) => { setQuote(q); setMethod(q[0] ? q[0].method : null); };
    // a listing in the database is quoted by the database; a sample piece (or
    // no connection) is quoted here from the public rate table, the same way
    const listed = ids.every((id) => UUID.test(String(id)));
    const local = () => localQuote(items, region).then(show).catch(() => show([]));
    if (listed && remote.isConfigured()) {
      Promise.race([remote.deliveryQuote(ids, region), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 6000))])
        .then(show).catch(local);
    }
    else local();
  }, [region]);

  const subtotal = items.reduce((n, i) => n + (Number(i.price) || 0), 0);
  const chosen = (quote || []).find((q) => q.method === method);
  const fee = chosen ? Number(chosen.fee) : 0;
  const courier = method && method !== "meet";
  const addressOk = !courier || (ship.name.trim() && ship.phone.trim() && ship.line1.trim() && ship.city.trim());

  const pay = async () => {
    setBusy(true); setProblem("");
    try {
      if (courier && remember) await store.setJSON(SHIP_KEY, { ...ship, country });
      if (!remember) await store.remove(SHIP_KEY).catch(() => {});
      const res = await remote.createOrder({ itemIds: ids, method, region,
        shipTo: courier ? { ...ship, country } : null });
      if (!res || !res.ok) {
        setProblem(res && res.reason === "sign_in_required" ? t("sign_in_to_buy") :
                   res && res.reason === "payments_off" ? t("payments_not_on") :
                   t("didnt_go_through"));
        setBusy(false); return;
      }
      await remote.payForOrder(res.order_id);
      setStarted(true);
    } catch (e) {
      const m = (e && e.message) || "";
      setProblem(m === "payments_not_configured" ? t("payments_not_on") : m || t("didnt_go_through"));
    }
    setBusy(false);
  };

  return (
    <div onClick={onClose} style={overlay}>
      <div ref={trap} {...dialogProps(t("buy_title"))} onClick={(e) => e.stopPropagation()} className="safe-sheet" style={sheet}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 20, color: C.ink }}>
            {payOn === false ? t("delivery_and_price") : items.length > 1 ? t("buy_n_pieces", { n: items.length }) : t("buy_title")}
          </div>
          <button onClick={onClose} aria-label={t("close")} className="tap-round" style={closeBtn}>
            <Icon name="close" size={16} stroke={2} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: C.inkLt, marginBottom: 14 }}>
          {items.map((i) => (getLang() === "ar" && i.titleAr) || i.title).join("، ")}{shopName ? ` · ${t("from_shop", { shop: shopName })}` : ""}
        </div>

        {started ? (
          <div style={{ display: "grid", gap: 10 }}>
            <p style={para}>{t("finish_paying", { min: UNPAID_MINUTES })}</p>
            <p style={para}>{t("money_stays")}</p>
            <button onClick={() => { onDone && onDone(); onClose(); }} style={primary}>{t("go_to_purchases")}</button>
          </div>
        ) : (
          <>
            <div style={label}>{t("deliver_to")}</div>
            <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country" style={field}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{inLang(c, "name", getLang())}</option>)}
            </select>

            <div style={label}>{t("how_it_gets_to_you")}</div>
            {quote === null && <p style={para}>{t("loading_options")}</p>}
            {quote && quote.length === 0 && <p style={para}>{t("no_delivery_here")}</p>}
            <div role="radiogroup" aria-label={t("delivery")} style={{ display: "grid", gap: 6, marginBottom: 12 }}>
              {(quote || []).map((q) => {
                const c = carrier(q.method); const sel = q.method === method;
                return (
                  <button key={q.method} role="radio" aria-checked={sel} onClick={() => setMethod(q.method)}
                    style={{ ...row, borderColor: sel ? C.terra : C.border, background: sel ? C.sand : C.white }}>
                    <Icon name={q.method === "meet" ? "handshake" : "truck"} size={18} style={{ color: C.terraTx, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, textAlign: "start" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{c ? inLang(c, "name", getLang()) : q.method}</span>
                      <span style={{ display: "block", fontSize: 11, color: C.inkLt }}>{c && inLang(c, "about", getLang())}</span>
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, whiteSpace: "nowrap" }}>
                      {Number(q.fee) ? money(q.fee) : t("free")}
                      {Number(q.fee) && !q.confirmed ? <span style={{ display: "block", fontSize: 11, fontWeight: 500, color: C.inkLt }}>{t("estimated")}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>

            {courier && payOn !== false && (
              <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                <div style={label}>{t("address")}</div>
                {[["name", t("full_name")], ["phone", t("mobile_number")], ["line1", t("building_street_area")],
                  ["line2", t("flat_or_villa_optional")], ["city", region === "UAE" ? t("emirate_or_city") : t("city")]].map(([k, l]) => (
                  <input key={k} value={ship[k]} onChange={(e) => setShip({ ...ship, [k]: e.target.value })}
                    placeholder={l} aria-label={l} inputMode={k === "phone" ? "tel" : undefined}
                    autoComplete={{ name: "name", phone: "tel", line1: "address-line1", line2: "address-line2", city: "address-level2" }[k]}
                    style={field} />
                ))}
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: C.inkLt, minHeight: 32 }}>
                  <input type="checkbox" checked={remember} onChange={() => setRemember(!remember)} />
                  {t("remember_address")}
                </label>
                <p style={{ ...para, fontSize: 11 }}>{t("address_after_payment")}</p>
              </div>
            )}

            <div style={summary}>
              <Line l={items.length > 1 ? t("n_pieces", { n: items.length }) : t("piece_cap")} v={money(subtotal)} />
              <Line l={t("delivery")} v={method ? (fee ? money(fee) : t("free")) : "—"} />
              <Line l={<b>{t("total")}</b>} v={<b>{money(subtotal + fee)}</b>} />
            </div>

            {payOn === false ? (
              <div role="note" style={{ ...para, background: C.sand, borderRadius: 12, padding: "10px 12px", marginBottom: 10 }}>
                {t("payments_off_1")} {t("payments_off_2")} {t("payments_off_3")}
              </div>
            ) : (
              <p style={{ ...para, fontSize: 11, marginBottom: 10 }}>
                {t("held_1")} {t("held_2", { days: SHIP_WITHIN_DAYS })} {t("held_3", { days: AUTO_RELEASE_DAYS })}
              </p>
            )}
            {problem && <div role="alert" style={{ fontSize: 12, color: C.redTx, marginBottom: 8 }}>{problem}
              {problem === t("sign_in_to_buy") && onSignIn && <> <button onClick={onSignIn} style={link}>{t("sign_in")}</button></>}</div>}

            {payOn === false ? (
              items.length > 1 && onMessage
                ? <button onClick={() => { onClose(); onMessage(items[0]); }} style={primary}>{t("ask_seller_about_these")}</button>
                : <button onClick={() => { onClose(); onOffer && onOffer(items[0]); }} style={primary}>{t("make_offer_instead")}</button>
            ) : (
              <button onClick={pay} disabled={busy || !method || !addressOk || payOn !== true}
                style={{ ...primary, opacity: busy || !method || !addressOk || payOn !== true ? 0.55 : 1 }}>
                {busy ? t("opening_payment") : t("pay_amount", { amount: money(subtotal + fee) })}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Line({ l, v }) {
  return <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.ink, padding: "3px 0" }}>
    <span>{l}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{v}</span></div>;
}

const overlay = { position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 430, background: "#000a",
  display: "flex", flexDirection: "column", justifyContent: "flex-end" };
const sheet = { background: C.cream, borderRadius: "20px 20px 0 0", padding: "18px 16px 30px", maxHeight: "92vh",
  overflowY: "auto", fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" };
const closeBtn = { background: "none", border: "none", color: C.ink, cursor: "pointer", minWidth: 44, minHeight: 44,
  display: "flex", alignItems: "center", justifyContent: "center" };
const label = { fontSize: 11, fontWeight: 700, color: C.inkLt, letterSpacing: 0.5, textTransform: "uppercase", margin: "4px 0 6px" };
const para = { fontSize: 12, color: C.inkLt, lineHeight: 1.55, margin: "0 0 8px" };
const field = { width: "100%", boxSizing: "border-box", padding: "12px 12px", borderRadius: 10, border: `1px solid ${C.border}`,
  fontSize: 16, background: C.white, color: C.ink, fontFamily: "inherit", marginBottom: 4 };
const row = { display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 52, padding: "10px 12px",
  background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, cursor: "pointer", fontFamily: "inherit" };
const summary = { borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "8px 0", margin: "6px 0 12px" };
const primary = { width: "100%", background: C.btn, color: C.onBtn, border: "none", borderRadius: 30, padding: "14px 0",
  fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit", minHeight: 48 };
const link = { background: "none", border: "none", color: C.terraTx, fontWeight: 700, textDecoration: "underline", cursor: "pointer", padding: 0 };
