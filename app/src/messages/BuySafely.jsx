import { useState } from "react";
import { C } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import { t } from "../i18n/t.js";
import { PAYMENTS_LIVE } from "../compliance/sellerRules.js";

// ─────────────────────────────────────────────────────────────────────────────
//  BEFORE ANY MONEY MOVES
//
//  Every sale goes by courier now: meeting in person was removed. So the risky
//  moment is no longer a handover in a mall; it is money sent to a stranger
//  before a parcel exists. This note says the three things that actually
//  reduce that risk, once per thread, and folds away.
//
//  "Keep it in lili" is still the one that matters most: a thread here cannot
//  be edited after sending and is visible to both parties and nobody else. A
//  chat moved to another app is not evidence anyone can produce later.
//
//  The last line follows the payment flag, like every screen that talks about
//  money (compliance/sellerRules.js): while paying in the app is off, lili
//  holds nothing and can refund nothing, and the note says so.
// ─────────────────────────────────────────────────────────────────────────────

const POINTS = [
  { icon: "lock",  title: "safe_keep_title", why: "safe_keep_why" },
  { icon: "eye",   title: "safe_see_title",  why: "safe_see_why" },
  { icon: "truck", title: "safe_send_title", why: "safe_send_why" },
];

export default function BuySafely({ onDismiss }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ background: C.sand, borderBottom: `1px solid ${C.border}`, padding: "10px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="shield" size={13} stroke={2} style={{ color: C.terraTx }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, flex: 1 }}>
          {t("before_money_moves")}
        </span>
        <button
          onClick={() => setOpen(!open)}
          className="tap-target"
          style={{ background: "none", border: "none", cursor: "pointer",
                   color: C.terraTx, fontSize: 11, fontWeight: 600, padding: "2px 4px" }}
          aria-expanded={open}
        >
          {open ? t("hide") : t("read_this_first")}
        </button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label={t("dismiss_safety_note")}
            className="tap-target"
            style={{ background: "none", border: "none", cursor: "pointer",
                     color: C.inkLt, padding: "2px 2px", display: "flex" }}
          >
            <Icon name="close" size={12} stroke={2} />
          </button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          {POINTS.map((pt) => (
            <div key={pt.title} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Icon name={pt.icon} size={12} stroke={2}
                    style={{ color: C.terraTx, marginTop: 3, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>{t(pt.title)}</div>
                <div style={{ fontSize: 11, color: C.inkLt, lineHeight: 1.55, marginTop: 2 }}>{t(pt.why)}</div>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: C.inkLt, lineHeight: 1.55 }}>
            {PAYMENTS_LIVE ? t("pay_on_note") : t("safe_footer_off")}
          </div>
        </div>
      )}
    </div>
  );
}
