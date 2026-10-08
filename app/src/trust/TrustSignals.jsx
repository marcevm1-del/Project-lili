import { useEffect, useState } from "react";
import { C } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import * as remote from "../backend/remote.js";
import { t } from "../i18n/t.js";

// ─────────────────────────────────────────────────────────────────────────────
//  TRUST SIGNALS
//
//  The rule here is simple and it is the whole point: never show a signal that
//  has not been earned.
//
//  A brand-new seller does not get a 4.9 and "138 reviews" because the seed
//  data had one. She gets "New shop", honestly, and the buyer decides what to
//  do with that. A fabricated rating is worse than no rating — it is the exact
//  thing that makes people stop trusting every rating on a platform.
//
//  Every figure below is computed by the database from what actually happened.
//  There is no column a seller can write to.
// ─────────────────────────────────────────────────────────────────────────────

const since = (iso) => {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 31) return "Joined this month";
  const months = Math.floor(days / 30);
  if (months < 12) return `Selling here ${months} month${months > 1 ? "s" : ""}`;
  const years = Math.floor(months / 12);
  return `Selling here ${years} year${years > 1 ? "s" : ""}`;
};

const replyText = (mins) => {
  if (mins == null) return null;
  if (mins < 60) return `Usually replies in ${mins} min`;
  const h = Math.round(mins / 60);
  if (h < 24) return `Usually replies in ${h} hour${h > 1 ? "s" : ""}`;
  return `Usually replies in ${Math.round(h / 24)} day${h >= 48 ? "s" : ""}`;
};

export default function TrustSignals({ shop, compact }) {
  const [stats, setStats] = useState(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    let alive = true;
    if (!shop || !shop.id) { setState("none"); return; }
    remote.getShopStats(shop.id)
      .then((s) => { if (alive) { setStats(s); setState(s ? "ready" : "none"); } })
      .catch(() => { if (alive) setState("none"); });
    return () => { alive = false; };
  }, [shop && shop.id]);

  // v2.8: a demonstration shop says so.
  //
  // Once the fabricated ratings came out of the seed catalogue these cards had
  // nothing on them at all, which invites a reader to assume the shop is
  // simply new. It is not new — it is not a person. One chip is the difference
  // between a marketplace that is honest about being empty and one that is
  // quietly hoping you won't ask.
  if (shop && shop.demo) {
    return (
      <span style={{
        fontSize: compact ? 10 : 11, fontWeight: 700, color: C.inkLt,
        background: C.sand, border: `1px solid ${C.border}`,
        borderRadius: 20, padding: compact ? "3px 8px" : "4px 10px",
        display: "inline-block",
      }}>
        {t("sample_shop")}
      </span>
    );
  }

  // Nothing to say is better than something invented.
  if (state !== "ready" || !stats) return null;

  const chips = [];
  if (stats.meets_done > 0) {
    chips.push({ icon: "handshake", text: `${stats.meets_done} meet${stats.meets_done > 1 ? "s" : ""} completed`, strong: true });
  }
  if (stats.sold_count > 0) {
    chips.push({ icon: "check", text: `${stats.sold_count} sold`, strong: true });
  }
  if (stats.live_listings > 0) {
    chips.push({ icon: "tag", text: `${stats.live_listings} listed` });
  }
  const reply = replyText(stats.median_reply_minutes);
  if (reply) chips.push({ icon: "clock", text: reply });
  const joined = since(stats.member_since);
  if (joined) chips.push({ icon: "user", text: joined });

  const isNew = stats.is_new || stats.sold_count === 0;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {isNew && (
        <span style={{
          fontSize: compact ? 10 : 11, fontWeight: 700, color: C.terraTx,
          background: C.white, border: `1px solid ${C.border}`,
          borderRadius: 20, padding: compact ? "3px 8px" : "4px 10px",
        }}>
          {t("new_shop")}
        </span>
      )}
      {chips.map((c) => (
        <span key={c.text} style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: compact ? 10 : 11,
          fontWeight: c.strong ? 700 : 500,
          color: c.strong ? C.ink : C.inkLt,
          background: C.white, border: `1px solid ${C.border}`,
          borderRadius: 20, padding: compact ? "3px 8px" : "4px 10px",
        }}>
          <Icon name={c.icon} size={compact ? 10 : 11} stroke={2} />
          {c.text}
        </span>
      ))}
      {isNew && chips.length === 0 && (
        <span style={{ fontSize: 11, color: C.inkLt }}>
          No sales yet — you'd be her first.
        </span>
      )}
    </div>
  );
}
