import { useState, useEffect, useCallback } from "react";
import { C } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import * as remote from "../backend/remote.js";
import { withTimeout, BUDGET, isTimeout } from "../ux/timeout.js";

// ─────────────────────────────────────────────────────────────────────────────
//  THE BETA ROSTER
//
//  The private beta is the launch shape. Until v2.9 an invitation could only be
//  created by typing SQL into the Supabase console, which makes the central
//  weekly operation of the business — invite a woman, see whether she listed —
//  something the founder does in a database client on a laptop.
//
//  ── the column that matters
//
//  Not "redeemed". "Listed."
//
//  An invitation that was redeemed by someone who then never opened a shop is
//  not a seller, and counting redemptions as sellers is exactly how a private
//  beta tells itself it is working while the catalogue stays empty. The roster
//  shows, per code: used or not, a shop or not, and how many pieces. The gap
//  between column two and column four is the entire onboarding problem, visible
//  in one screen.
//
//  Every one of the three operations is gated by `lili_is_moderator()` in the
//  database. This component is a view onto a permission it does not grant.
// ─────────────────────────────────────────────────────────────────────────────

const when = (iso) => {
  if (!iso) return "";
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d < 1) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
};

export default function InviteRoster({ onBack }) {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading");
  const [minting, setMinting] = useState(false);
  const [fresh, setFresh] = useState([]);
  const [copied, setCopied] = useState(null);

  const load = useCallback(async () => {
    if (!remote.isConfigured()) { setState("offline"); return; }
    try {
      const data = await withTimeout(remote.inviteRoster(), BUDGET.interactive);
      setRows(data || []);
      setState("ready");
    } catch (e) {
      const denied = e && /not permitted|42501/i.test(String(e.message || e.code || ""));
      setState(denied ? "denied" : isTimeout(e) ? "unreachable" : "offline");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const mint = async (n) => {
    if (minting) return;
    setMinting(true);
    try {
      const codes = await withTimeout(remote.mintInvites(n, "cohort"), BUDGET.interactive);
      setFresh(codes || []);
      await load();
    } catch { /* the roster below still shows what exists */ }
    setMinting(false);
  };

  const revoke = async (code) => {
    try { await remote.revokeInvite(code); await load(); } catch { /* non-fatal */ }
  };

  const copy = async (code) => {
    try { await navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(null), 1600); }
    catch { /* a phone without clipboard permission — the code is on screen */ }
  };

  const used     = rows.filter((r) => r.redeemed_at);
  const selling  = rows.filter((r) => r.listings > 0);
  const openShop = rows.filter((r) => r.has_shop);
  const free     = rows.filter((r) => !r.redeemed_at && !r.revoked);

  const stat = (n, label, tone) => (
    <div key={label} style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontWeight: 700, fontSize: 20, color: tone || C.ink }}>{n}</div>
      <div style={{ fontSize: 11, color: C.inkLt, lineHeight: 1.3, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: C.cream, padding: "12px 14px", borderBottom: `1px solid ${C.border}`,
                    display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onBack} className="tap-target" style={{ background: "none", border: "none",
          cursor: "pointer", color: C.terraTx, fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
          Back
        </button>
        <span style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 16,
                       color: C.ink, flex: 1, textAlign: "center" }}>Beta roster</span>
        <span style={{ minWidth: 40 }} />
      </div>

      <div style={{ padding: "16px 14px" }}>
        {state === "denied" && (
          <div style={{ textAlign: "center", padding: "50px 20px", color: C.inkLt }}>
            <Icon name="lock" size={28} stroke={1.4} style={{ color: C.terra, marginBottom: 10 }} />
            <div style={{ fontSize: 14, color: C.ink }}>This account isn't a moderator</div>
            <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.6 }}>
              The database decides that, not the app. Nothing here is available to you.
            </div>
          </div>
        )}
        {state === "loading" && (
          <div style={{ textAlign: "center", padding: "40px 0", color: C.inkLt, fontSize: 13 }}>Loading…</div>
        )}
        {(state === "offline" || state === "unreachable") && (
          <div style={{ textAlign: "center", padding: "40px 16px", color: C.inkLt, fontSize: 13, lineHeight: 1.6 }}>
            {state === "unreachable" ? "We couldn't reach lili just now." : "Invitations need the backend."}
            <button onClick={() => { setState("loading"); load(); }}
              style={{ display: "block", margin: "12px auto 0", background: "none",
                border: `1.5px solid ${C.terra}`, color: C.terraTx, borderRadius: 20,
                padding: "8px 18px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Try again
            </button>
          </div>
        )}

        {state === "ready" && (
          <>
            <div style={{ display: "flex", background: C.white, border: `1px solid ${C.border}`,
                          borderRadius: 14, padding: "14px 8px", marginBottom: 8 }}>
              {stat(rows.length, "invited")}
              {stat(used.length, "redeemed")}
              {stat(openShop.length, "opened a shop")}
              {stat(selling.length, "actually listed", selling.length ? C.greenTx : C.redTx)}
            </div>
            {/* The gap between the second and fourth number is the onboarding
                problem, and it is the only number on this screen that means a
                marketplace exists. Said out loud so it cannot be read past. */}
            <p style={{ fontSize: 12, color: C.inkLt, lineHeight: 1.6, margin: "0 0 16px", padding: "0 2px" }}>
              {selling.length === 0 && used.length > 0
                ? `${used.length} redeemed and nobody has listed a piece. That gap is the whole job — a code is not a seller.`
                : used.length === 0
                  ? "Nobody has used a code yet. Hand them out in person; a code sent into a group chat is a code nobody feels responsible for."
                  : `${selling.length} of ${used.length} who accepted have listed something.`}
            </p>

            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              {[5, 10, 30].map((n) => (
                <button key={n} onClick={() => mint(n)} disabled={minting}
                  style={{ flex: 1, background: C.white, border: `1.5px solid ${C.border}`,
                    color: C.ink, borderRadius: 20, padding: "10px 0", fontSize: 13,
                    fontWeight: 600, cursor: minting ? "default" : "pointer", fontFamily: "inherit" }}>
                  {minting ? "…" : `+${n} codes`}
                </button>
              ))}
            </div>

            {fresh.length > 0 && (
              <div style={{ background: C.sand, border: `1px solid ${C.terra}`, borderRadius: 12,
                            padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: C.ink, fontWeight: 700, marginBottom: 8 }}>
                  {fresh.length} new — copy them now, they're in the list below too
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {fresh.map((c) => (
                    <button key={c} onClick={() => copy(c)}
                      style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8,
                        padding: "5px 10px", fontSize: 12, fontFamily: "ui-monospace,Menlo,monospace",
                        color: C.ink, cursor: "pointer", letterSpacing: 0.5 }}>
                      {copied === c ? "copied" : c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {rows.length === 0 && (
              <div style={{ textAlign: "center", padding: "30px 16px", color: C.inkLt,
                            fontSize: 13, lineHeight: 1.6 }}>
                No invitations yet. The beta gate is on, so until there is a code
                nobody can open a shop.
              </div>
            )}

            {free.length > 0 && (
              <div style={{ fontSize: 11, fontWeight: 700, color: C.inkLt, letterSpacing: 0.6,
                            textTransform: "uppercase", margin: "4px 2px 8px" }}>
                {free.length} unused
              </div>
            )}

            {rows.map((r) => (
              <div key={r.code} style={{ background: C.white, border: `1px solid ${C.border}`,
                borderRadius: 12, padding: "12px 12px", marginBottom: 7,
                display: "flex", alignItems: "center", gap: 12,
                opacity: r.revoked ? 0.5 : 1 }}>
                <button onClick={() => copy(r.code)} disabled={r.revoked}
                  style={{ background: "none", border: "none", padding: 0, textAlign: "left",
                    cursor: r.revoked ? "default" : "pointer", fontFamily: "ui-monospace,Menlo,monospace",
                    fontSize: 13, letterSpacing: 0.5, color: C.ink, flexShrink: 0 }}>
                  {copied === r.code ? "copied" : r.code}
                </button>
                <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: C.inkLt, lineHeight: 1.45 }}>
                  {r.revoked ? "withdrawn"
                    : r.redeemed_at ? (
                      <>
                        <span style={{ color: C.ink }}>{r.redeemed_email || "redeemed"}</span>
                        {" · "}{when(r.redeemed_at)}
                        {" · "}
                        <span style={{ color: r.listings > 0 ? C.greenTx : C.redTx, fontWeight: 600 }}>
                          {r.listings > 0 ? `${r.listings} listed`
                            : r.has_shop ? "shop open, nothing listed" : "no shop yet"}
                        </span>
                      </>
                    ) : <>unused · made {when(r.created_at)}</>}
                </div>
                {!r.redeemed_at && !r.revoked && (
                  <button onClick={() => revoke(r.code)}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
                      color: C.inkLt, fontSize: 11, fontFamily: "inherit", flexShrink: 0 }}>
                    withdraw
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
