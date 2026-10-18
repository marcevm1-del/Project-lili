import { useState } from "react";
import { C, Shell } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import { parsePrice } from "../ux/input.js";
import { sizeLabel } from "../sizes/sizeSystem.js";
import { SizeSystemPicker, useSizeSystem } from "../sizes/SizeSystemPicker.jsx";
import {
  SIZE_GROUPS, ONE_SIZE_NOTE, STYLE_OPTIONS, CONDITION_LADDER, normalise, isEmpty,
} from "./preferences.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Profile → My preferences
//
//  Her sizes for every kind of piece, the styles and brands she likes, the
//  condition she'll accept and her budget, in one place she can find again.
//  Every change saves as she makes it; there is no Save button to forget.
//
//  It is private by construction, and the screen says so first: these are
//  stored on this phone only, never sent to lili, never shown to a seller.
//  "Clear all" removes them; deleting the account clears them too.
// ─────────────────────────────────────────────────────────────────────────────

export default function ProfilePreferences({ taste, brands = [], personalise, onChange, onBack, onOpenDataChoices }) {
  const [p, setP] = useState(() => normalise(taste));
  useSizeSystem();
  const [budget, setBudget] = useState(p.maxPrice ? String(p.maxPrice) : "");
  const [brandQuery, setBrandQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  const commit = (next) => {
    const n = normalise(next);
    setP(n);
    onChange(isEmpty(n) ? null : { ...n, at: new Date().toISOString() });
  };
  const toggleIn = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const shownBrands = (brandQuery.trim()
    ? brands.filter((b) => b.toLowerCase().includes(brandQuery.trim().toLowerCase()))
    : brands.filter((b) => !p.brands.includes(b)).slice(0, 12));

  return (
    <Shell title="My preferences" subtitle="تفضيلاتي" onBack={onBack}>
      <div role="note" style={privacyBox}>
        <Icon name="lock" size={18} style={{ color: C.terraTx, flexShrink: 0, marginTop: 1 }} />
        <div>
          <b style={{ color: C.ink }}>Private to you.</b> Stored on this phone only. lili never
          receives them and sellers never see them. They shape your feed and the “For me”
          filter, nothing else.
        </div>
      </div>

      <h3 style={h3}>Sizes</h3>
      <p style={hint}>Pick the sizes you wear for each kind of piece. Leave a row empty and
        nothing of that kind is hidden.</p>
      <SizeSystemPicker label="Show sizes in" />
      {SIZE_GROUPS.map((g) => {
        const mine = p.sizeBy[g.key] || [];
        return (
          <fieldset key={g.key} style={fieldset}>
            <legend style={legend}>{g.label} <span style={ar}>{g.labelAr}</span></legend>
            <div style={chipRow}>
              {g.options.map((o) => (
                <Chip key={o} on={mine.includes(o)} label={sizeLabel(o, undefined, { prefix: false })}
                  ariaLabel={`${g.label} ${sizeLabel(o)}${sizeLabel(o, undefined, { prefix: false }) !== o ? `, listed as ${o}` : ""}`}
                  onClick={() => commit({ ...p, sizeBy: { ...p.sizeBy, [g.key]: toggleIn(mine, o) } })} />
              ))}
            </div>
          </fieldset>
        );
      })}
      <p style={{ ...hint, marginTop: -4 }}>{ONE_SIZE_NOTE}</p>

      <h3 style={h3}>Styles you like</h3>
      <div style={chipRow}>
        {STYLE_OPTIONS.map((c) => (
          <Chip key={c} on={p.categories.includes(c)} label={c}
            onClick={() => commit({ ...p, categories: toggleIn(p.categories, c) })} />
        ))}
      </div>

      <h3 style={h3}>Favourite brands</h3>
      {p.brands.length > 0 && (
        <div style={chipRow}>
          {p.brands.map((b) => (
            <Chip key={b} on label={`${b}  ×`} ariaLabel={`Remove ${b}`}
              onClick={() => commit({ ...p, brands: p.brands.filter((x) => x !== b) })} />
          ))}
        </div>
      )}
      <input value={brandQuery} onChange={(e) => setBrandQuery(e.target.value)}
        placeholder="Search brands" aria-label="Search brands" style={field} />
      <div style={chipRow}>
        {shownBrands.map((b) => (
          <Chip key={b} on={p.brands.includes(b)} label={b}
            onClick={() => commit({ ...p, brands: toggleIn(p.brands, b) })} />
        ))}
        {brandQuery.trim() && shownBrands.length === 0 && (
          <span style={hint}>No brand by that name on lili yet.</span>
        )}
      </div>

      <h3 style={h3}>Condition</h3>
      <p style={hint}>The lowest condition you'd buy.</p>
      <div style={chipRow}>
        <Chip on={!p.minCondition} label="Any" onClick={() => commit({ ...p, minCondition: "" })} />
        {CONDITION_LADDER.slice(0, 3).map((c) => (
          <Chip key={c} on={p.minCondition === c} label={c === "Like New" ? c : `${c} or better`}
            onClick={() => commit({ ...p, minCondition: c })} />
        ))}
      </div>

      <h3 style={h3}>Budget</h3>
      <label htmlFor="pref-budget" style={hint}>The most you'd spend on one piece. Leave empty for no limit.</label>
      <div style={{ ...field, display: "flex", alignItems: "center", gap: 8, padding: "0 14px" }}>
        <span style={{ fontSize: 14, color: C.inkLt, fontWeight: 600 }}>AED</span>
        <input id="pref-budget" value={budget} inputMode="numeric" placeholder="No limit"
          onChange={(e) => setBudget(e.target.value)}
          onBlur={() => { const n = parsePrice(budget); commit({ ...p, maxPrice: n > 0 ? n : null });
                          setBudget(n > 0 ? String(Math.round(n)) : ""); }}
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "none",
                   fontSize: 16, color: C.ink, fontFamily: "inherit", padding: "12px 0" }} />
      </div>

      <div style={{ ...privacyBox, marginTop: 22 }}>
        <div>
          Ordering your feed by these uses the “Show me things I'd actually love” choice,
          which is <b style={{ color: C.ink }}>{personalise ? "on" : "off"}</b>.{" "}
          {onOpenDataChoices && (
            <button onClick={onOpenDataChoices} style={linkBtn}>Change it in Data choices</button>
          )}
          {" "}The “For me” filter works either way, because you switch it on yourself.
        </div>
      </div>

      {!isEmpty(p) && (
        <button onClick={() => {
            if (!confirmClear) { setConfirmClear(true); return; }
            setConfirmClear(false); setBudget(""); commit({});
          }}
          style={{ ...linkBtn, color: confirmClear ? C.redTx : C.terraTx, margin: "18px 0 8px", minHeight: 44 }}>
          {confirmClear ? "Tap again to clear every preference" : "Clear all preferences"}
        </button>
      )}
    </Shell>
  );
}

function Chip({ on, label, onClick, ariaLabel }) {
  return (
    <button onClick={onClick} aria-pressed={!!on} aria-label={ariaLabel}
      style={{ background: on ? C.btn : C.white, color: on ? C.onBtn : C.ink,
               border: `1.5px solid ${on ? C.btn : C.border}`, borderRadius: 20,
               padding: "8px 14px", fontSize: 13, fontWeight: on ? 700 : 500, cursor: "pointer",
               minWidth: 44, minHeight: 40, fontFamily: "inherit", whiteSpace: "nowrap" }}>
      {label}
    </button>
  );
}

const privacyBox = { display: "flex", gap: 10, background: C.sand, border: `1px solid ${C.border}`,
  borderRadius: 12, padding: "12px 14px", fontSize: 13, color: C.inkLt, lineHeight: 1.55, marginBottom: 18 };
const h3 = { fontSize: 15, fontWeight: 700, color: C.ink, margin: "18px 0 6px" };
const hint = { display: "block", fontSize: 12, color: C.inkLt, lineHeight: 1.5, margin: "0 0 10px" };
const chipRow = { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 };
const fieldset = { border: "none", padding: 0, margin: "0 0 8px" };
const legend = { fontSize: 13, fontWeight: 600, color: C.ink, padding: 0, marginBottom: 8 };
const ar = { fontSize: 11, color: C.terraTx, fontWeight: 400, marginInlineStart: 6 };
const field = { width: "100%", background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
  padding: "12px 14px", fontSize: 16, color: C.ink, fontFamily: "inherit", marginBottom: 10, boxSizing: "border-box" };
const linkBtn = { background: "none", border: "none", padding: 0, color: C.terraTx, fontSize: 13,
  fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer", fontFamily: "inherit" };
