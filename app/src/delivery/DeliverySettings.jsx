import { useEffect, useState } from "react";
import { C } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import { loadRates } from "./rates.js";
import { CARRIERS, PARCEL_SIZES, deliveryWays, inLang } from "./carriers.js";
import { t, getLang } from "../i18n/t.js";
import { money } from "../i18n/direction.js";

// ─────────────────────────────────────────────────────────────────────────────
//  The sell form's Delivery section, after Yaga's.
//
//  Switch on every way you're happy to get the piece to a buyer: shops with
//  more options sell faster. Pick the parcel size once; each courier shows its
//  fee for that size. The buyer pays the delivery fee when she buys.
//
//  `form.delivery` (array of carrier keys), `form.parcelSize`, `form.bundling`.
// ─────────────────────────────────────────────────────────────────────────────

export default function DeliverySettings({ form, setForm }) {
  const [rates, setRates] = useState([]);
  useEffect(() => { loadRates().then(setRates); }, []);

  const on = deliveryWays(form);
  const size = form.parcelSize || "S";
  const toggle = (key) => {
    const next = on.includes(key) ? on.filter((k) => k !== key) : [...on, key];
    setForm({ ...form, delivery: next.length ? next : on });   // at least one courier
  };
  const fee = (carrier, region) => rates.find((r) => r.carrier === carrier && r.size === size && r.region === region);

  return (
    <section aria-labelledby="delivery-h" style={{ display: "grid", gap: 10 }}>
      <div>
        <h3 id="delivery-h" style={h3}>{t("delivery")}</h3>
        <p style={hint}>{t("delivery_hint_1")} {t("delivery_hint_2")} {t("delivery_hint_3")}</p>
      </div>

      <div>
        <div style={label}>{t("parcel_size")}</div>
        <div role="radiogroup" aria-label={t("parcel_size")} style={{ display: "grid", gap: 6 }}>
          {PARCEL_SIZES.map((p) => {
            const sel = p.key === size;
            return (
              <button key={p.key} type="button" role="radio" aria-checked={sel}
                onClick={() => setForm({ ...form, parcelSize: p.key })}
                style={{ ...row, borderColor: sel ? C.terra : C.border, background: sel ? C.sand : C.white }}>
                <span style={{ ...dot, borderColor: sel ? C.terra : C.border }}>{sel && <span style={dotIn} />}</span>
                <span style={{ flex: 1, minWidth: 0, textAlign: "start" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{inLang(p, "label", getLang())}</span>
                  <span style={{ display: "block", fontSize: 11, color: C.inkLt }}>{inLang(p, "fits", getLang())} · {inLang(p, "dims", getLang())}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <div style={label}>{t("ways_to_get_it_there")}</div>
        {CARRIERS.map((c) => {
          const sel = on.includes(c.key);
          const uae = fee(c.key, "UAE"), gcc = fee(c.key, "GCC");
          const estimated = (uae && !uae.confirmed) || (gcc && !gcc.confirmed);
          return (
            <label key={c.key} style={{ ...row, borderColor: sel ? C.terra : C.border, cursor: "pointer" }}>
              <Icon name="truck" size={18} style={{ color: C.terraTx, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{inLang(c, "name", getLang())}</span>
                <span style={{ display: "block", fontSize: 11, color: C.inkLt, lineHeight: 1.45 }}>
                  {inLang(c, "about", getLang())}
                  {(uae || gcc) && (
                    <> · {uae ? `${t("region_uae")} ${money(uae.fee)}` : ""}{uae && gcc ? " · " : ""}{gcc ? `${t("region_gcc")} ${money(gcc.fee)}` : ""}
                      {estimated ? ` (${t("estimated")})` : ""}</>
                  )}
                </span>
              </span>
              <input type="checkbox" checked={sel} onChange={() => toggle(c.key)}
                aria-label={t("offer_carrier", { carrier: inLang(c, "name", getLang()) })} style={{ width: 22, height: 22, accentColor: "var(--c-accent-btn)" }} />
            </label>
          );
        })}
      </div>

      <label style={{ ...row, cursor: "pointer" }}>
        <Icon name="bag" size={18} style={{ color: C.terraTx, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{t("bundling")}</span>
          <span style={{ display: "block", fontSize: 11, color: C.inkLt, lineHeight: 1.45 }}>{t("bundling_hint")}</span>
        </span>
        <input type="checkbox" checked={!!form.bundling} onChange={() => setForm({ ...form, bundling: !form.bundling })}
          aria-label={t("allow_bundling")} style={{ width: 22, height: 22, accentColor: "var(--c-accent-btn)" }} />
      </label>
    </section>
  );
}

const h3 = { fontSize: 15, fontWeight: 700, color: C.ink, margin: "6px 0 4px" };
const hint = { fontSize: 12, color: C.inkLt, lineHeight: 1.55, margin: 0 };
const label = { fontSize: 11, fontWeight: 700, color: C.inkLt, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 };
const row = { display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 48, padding: "10px 12px",
  background: C.white, border: `1px solid ${C.border}`, borderRadius: 12, fontFamily: "inherit", boxSizing: "border-box" };
const dot = { width: 18, height: 18, borderRadius: "50%", border: "2px solid", display: "flex",
  alignItems: "center", justifyContent: "center", flexShrink: 0 };
const dotIn = { width: 8, height: 8, borderRadius: "50%", background: "var(--c-accent-btn)" };
