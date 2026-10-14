import { useEffect, useState } from "react";
import { C } from "./ui.js";
import * as remote from "../backend/remote.js";
import Icon from "../icons/Icon.jsx";

// ─────────────────────────────────────────────────────────────────────────────
//  App health, at the top of the moderation queue (audit A2-10, migration 38)
//
//  Until real alerting exists, the one place to look: crashes in the last day
//  and week with the commonest messages, whether each scheduled job ran on
//  time, the work waiting on a person, and where orders and money stand.
//  Red means look now. It renders nothing without the server, and the server
//  refuses anyone who is not a moderator.
// ─────────────────────────────────────────────────────────────────────────────

// how long after its schedule a job may be quiet before it reads as stale
const STALE_MINUTES = { "*/10 * * * *": 30, "7 * * * *": 150 };
const staleAfter = (schedule) => STALE_MINUTES[schedule] || 36 * 60;   // daily jobs: a day and a half

const ago = (t) => {
  if (!t) return "never";
  const m = Math.round((Date.now() - new Date(t).getTime()) / 60000);
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

export default function HealthPanel() {
  const [h, setH] = useState(null);
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!remote.isConfigured()) return;
    remote.appHealth().then(setH).catch(() => setH(null));
  }, [n]);
  if (!h) return null;

  const jobs = (h.jobs || []).map((j) => {
    const late = !j.last_run || (Date.now() - new Date(j.last_run).getTime()) / 60000 > staleAfter(j.schedule);
    return { ...j, bad: !j.active || j.last_status === "failed" || j.failures_24h > 0 || late, late };
  });
  const o = h.orders || {}, w = h.waiting || {};
  const alarms = [
    h.crashes_24h > 0 && `${h.crashes_24h} crash${h.crashes_24h === 1 ? "" : "es"} today`,
    jobs.some((j) => j.bad) && "a scheduled job needs a look",
    o.money_failed > 0 && `${o.money_failed} payment step${o.money_failed === 1 ? "" : "s"} failed`,
  ].filter(Boolean);

  return (
    <section aria-label="App health" style={{ background: C.white, border: `1.5px solid ${alarms.length ? C.red : C.border}`,
      borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, background: "none", border: "none",
          padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "start", minHeight: 32 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
          background: alarms.length ? C.red : C.green }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.ink }}>
          {alarms.length ? `App health: ${alarms.join(" · ")}` : "App health: all quiet"}
        </span>
        <span style={{ fontSize: 12, color: C.terraTx, fontWeight: 700 }}>{open ? "Hide" : "Details"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 10, display: "grid", gap: 12, fontSize: 12, color: C.ink }}>
          <div>
            <b>Crashes</b> · {h.crashes_24h} today · {h.crashes_7d} this week
            {(h.top_crashes || []).map((c, i) => (
              <div key={i} style={{ color: C.inkLt, marginTop: 4, lineHeight: 1.45 }}>
                ×{c.n} “{c.message}” · {c.screen || "?"} · {c.version || "?"} · {ago(c.last_at)}
              </div>
            ))}
          </div>
          <div>
            <b>Scheduled jobs</b>
            {jobs.map((j) => (
              <div key={j.name} style={{ color: j.bad ? C.redTx : C.inkLt, marginTop: 4,
                display: "flex", gap: 4, alignItems: "baseline", flexWrap: "wrap" }}>
                <Icon name={j.bad ? "close" : "check"} size={11} stroke={2.2} style={{ alignSelf: "center" }} />
                {j.name} · last ran {ago(j.last_run)}
                {j.last_status === "failed" ? " · failed" : ""}{j.failures_24h ? ` · ${j.failures_24h} failures today` : ""}
                {j.late ? " · late" : ""}{!j.active ? " · switched off" : ""}
              </div>
            ))}
          </div>
          <div>
            <b>Waiting on a person</b> · {w.listings_in_review} listings in review · {w.reports_open} reports
            · {w.appeals} appeals · {w.order_disputes} order disputes
          </div>
          <div>
            <b>Orders</b> · paying in the app is {o.payments_enabled ? "on" : "off"} · {o.awaiting_payment} awaiting payment
            · {o.to_send} to send · {o.on_the_way} on the way · {o.payout_due} payouts due · {o.refund_due} refunds due
            {o.money_failed ? <span style={{ color: C.redTx }}> · {o.money_failed} failed</span> : null}
          </div>
          <button onClick={() => setN((x) => x + 1)} style={{ justifySelf: "start", background: "none",
            border: `1px solid ${C.border}`, borderRadius: 16, padding: "6px 12px", fontSize: 12, cursor: "pointer",
            color: C.terraTx, fontWeight: 700, fontFamily: "inherit", minHeight: 32 }}>Refresh</button>
        </div>
      )}
    </section>
  );
}
