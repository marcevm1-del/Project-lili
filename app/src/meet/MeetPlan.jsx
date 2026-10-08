import { useState, useEffect, useCallback } from "react";
import { C } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import * as remote from "../backend/remote.js";
import { withTimeout, BUDGET, isTimeout } from "../ux/timeout.js";
import { PLACES, placeByKey, AVOID, OUTSIDE_HELP } from "./places.js";
import { t } from "../i18n/t.js";
import * as repo from "../data/repo.js";
import ReviewPrompt from "../trust/ReviewPrompt.jsx";

// ─────────────────────────────────────────────────────────────────────────────
//  THE MEET, IN THE THREAD
//
//  MeetSafely.jsx says the right three things and says them on a sheet she has
//  to open. Advice you have to go and find is not a safety feature — it is a
//  disclaimer with better typography.
//
//  This is the same three rules turned into something that happens: one of them
//  proposes a place and a time, the other confirms it, and both then have a
//  written record of what they agreed. Which matters for three separate
//  reasons, none of which "meet in public" achieves on its own:
//
//    · Two people who have agreed a place in writing turn up to the same one.
//      The commonest failure of a marketplace handover is not fraud, it is a
//      missed meeting that neither side blames on themselves.
//    · A request to change it to somewhere private, after agreeing somewhere
//      public, is a signal — and it is only a signal if there was a first
//      answer to change.
//    · If she reports afterwards, the plan is part of the thread she can attach
//      under the consented-disclosure route, so a moderator reads what was
//      actually arranged rather than a summary written after the fact.
//
//  ── what it does not do
//
//  No location tracking, no live journey sharing, no coordinates. `place_key`
//  is a category she picked and `place_note` is what she typed. The check-in is
//  a single tap she chooses to make, once, afterwards.
//
//  And nothing here claims a location is verified or supervised. There is no
//  Dubai Police safe-exchange-zone programme — see the note in places.js — so
//  the app offers criteria and examples, never an endorsement.
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short",
                                       hour: "numeric", minute: "2-digit" });
};

/** Sensible defaults: tomorrow, mid-afternoon. Never late, never right now. */
function defaultWhen() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(16, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MeetPlan({ conversationId, itemId, onReport }) {
  const [meets, setMeets] = useState([]);
  const [state, setState] = useState("loading");
  const [me, setMe] = useState(null);
  const [composing, setComposing] = useState(false);
  const [placeKey, setPlaceKey] = useState("mall");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(defaultWhen);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [showAvoid, setShowAvoid] = useState(false);
  const [owed, setOwed] = useState({});        // meet id → who she would be rating

  const load = useCallback(async () => {
    if (!remote.isConfigured() || !conversationId) { setState("offline"); return; }
    try {
      const [rows, uid] = await Promise.all([
        withTimeout(remote.getMeets(conversationId), BUDGET.interactive),
        remote.currentUid().catch(() => null),
      ]);
      setMeets(rows || []); setMe(uid); setState("ready");
      // Which of these she can still review. Asked separately so a slow or
      // failed answer never holds up the plan itself.
      repo.getReviewsOwed()
        .then((list) => setOwed(Object.fromEntries((list || []).map((r) => [r.meet_id, r.other_role]))))
        .catch(() => {});
    } catch (e) {
      setState(isTimeout(e) ? "unreachable" : "offline");
    }
  }, [conversationId]);

  useEffect(() => { load(); }, [load]);

  const live = meets.find((m) => m.state === "proposed" || m.state === "confirmed");
  const mine = live && me && live.proposed_by === me;

  const act = async (fn) => {
    if (busy) return;
    setBusy(true); setProblem(null);
    try { await withTimeout(fn(), BUDGET.interactive); await load(); }
    catch (e) {
      // The server's refusals here are meaningful sentences, not codes — the
      // guard raises "the other person confirms a meet, not the one who
      // proposed it". Showing it is better than inventing a friendlier lie.
      setProblem(isTimeout(e)
        ? "That didn't reach lili. Nothing changed — try again in a moment."
        : (e && e.message) || "That didn't work.");
    }
    setBusy(false);
  };

  const propose = () => act(async () => {
    const at = new Date(when);
    if (!(at.getTime() > Date.now())) throw new Error("Pick a time that hasn't happened yet.");
    await remote.proposeMeet({ conversationId, itemId, placeKey,
                               placeNote: note.trim(), meetAt: at.toISOString() });
    setComposing(false); setNote("");
  });

  if (state !== "ready") return null;   // never a broken box in a conversation

  const card = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
                 padding: "12px 14px", marginBottom: 10 };
  const btn = (primary) => ({
    background: primary ? C.btn : "none", color: primary ? C.onBtn : C.terraTx,
    border: primary ? "none" : `1.5px solid ${C.terra}`, borderRadius: 20,
    padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer",
    fontFamily: "inherit", opacity: busy ? 0.6 : 1,
  });
  const field = { width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 13,
                  border: `1px solid ${C.border}`, outline: "none", background: C.cream,
                  color: C.ink, fontFamily: "inherit", boxSizing: "border-box" };

  // ── a plan that needs answering ───────────────────────────────────────────
  if (live) {
    const place = placeByKey(live.place_key);
    const done = live.state === "confirmed" && new Date(live.meet_at).getTime() < Date.now();
    return (
      <div style={{ ...card, borderColor: live.state === "confirmed" ? C.terra : C.border }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <Icon name={place.icon} size={16} stroke={1.8} style={{ color: C.terraTx }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
              {place.label}{live.place_note ? ` — ${live.place_note}` : ""}
            </div>
            <div style={{ fontSize: 12, color: C.inkLt, marginTop: 1 }}>{fmt(live.meet_at)}</div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, flexShrink: 0,
            color: live.state === "confirmed" ? C.greenTx : C.goldTx }}>
            {live.state === "confirmed" ? "Agreed" : mine ? "Waiting for her" : "Needs your answer"}
          </span>
        </div>

        {problem && (
          <div role="alert" style={{ fontSize: 12, color: C.redTx, lineHeight: 1.5, marginBottom: 8 }}>
            {problem}
          </div>
        )}

        {live.state === "proposed" && !mine && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={btn(true)} disabled={busy}
              onClick={() => act(() => remote.answerMeet(live.id, "confirmed"))}>
              {t("that_works")}
            </button>
            <button style={btn(false)} disabled={busy}
              onClick={() => act(() => remote.answerMeet(live.id, "declined"))}>
              Suggest another
            </button>
          </div>
        )}

        {live.state === "proposed" && mine && (
          <button style={{ ...btn(false), fontSize: 12 }} disabled={busy}
            onClick={() => act(() => remote.answerMeet(live.id, "cancelled"))}>
            Cancel this
          </button>
        )}

        {live.state === "confirmed" && !done && (
          <>
            <div style={{ fontSize: 12, color: C.inkLt, lineHeight: 1.6, marginBottom: 10 }}>
              {place.hint} Check the piece before any money changes hands — lili
              doesn't hold it, so this is the moment.
            </div>
            <button style={{ ...btn(false), fontSize: 12 }} disabled={busy}
              onClick={() => act(() => remote.answerMeet(live.id, "cancelled"))}>
              Something's come up
            </button>
          </>
        )}

        {done && (
          // Asked once, afterwards, and only of the person who is here to
          // answer. "Did she turn up" is the only question whose answer we
          // could not have guessed, and "it felt wrong" is the one that has to
          // reach a person rather than a counter.
          <div>
            {/* Once answered, the question goes. It used to stay, and a
                second tap met "a check-in is not edited afterwards". */}
            {!live.checkin_state && <>
            <div style={{ fontSize: 13, color: C.ink, marginBottom: 8 }}>How did it go?</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              <button style={btn(true)} disabled={busy}
                onClick={() => act(() => remote.checkInMeet(live.id, "fine"))}>All fine</button>
              <button style={btn(false)} disabled={busy}
                onClick={() => act(() => remote.checkInMeet(live.id, "no_show"))}>She didn't come</button>
              <button style={{ ...btn(false), borderColor: C.red, color: C.redTx }} disabled={busy}
                onClick={async () => {
                  await act(() => remote.checkInMeet(live.id, "felt_wrong"));
                  if (onReport) onReport();
                }}>Something felt wrong</button>
            </div>
            </>}
            {owed[live.id] && (
              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 12 }}>
                <ReviewPrompt meetId={live.id} otherRole={owed[live.id]} />
              </div>
            )}
            <div style={{ fontSize: 11, color: C.inkLt, marginTop: 10, lineHeight: 1.6 }}>
              If you are in danger right now, {OUTSIDE_HELP[0].label} before us —
              lili can close a shop, and that is all it can do.
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── proposing one ─────────────────────────────────────────────────────────
  if (!composing) {
    const past = meets.find((m) => m.state === "done" || m.checkin_state);
    const toReview = meets.find((m) => owed[m.id]);
    return (
      <>
      {toReview && (
        <div style={card}>
          <ReviewPrompt meetId={toReview.id} otherRole={owed[toReview.id]} />
        </div>
      )}
      <div style={{ ...card, background: C.sand }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="handshake" size={16} stroke={1.8} style={{ color: C.terraTx }} />
          <div style={{ flex: 1, fontSize: 13, color: C.ink, lineHeight: 1.5 }}>
            {past ? "Arrange another handover" : "Agree where and when you'll meet"}
            <div style={{ fontSize: 11, color: C.inkLt, marginTop: 2 }}>
              Written down here, so you both turn up to the same place.
            </div>
          </div>
          <button style={btn(true)} onClick={() => setComposing(true)}>Suggest</button>
        </div>
      </div>
      </>
    );
  }

  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 10 }}>
        {t("where_will_you_meet")}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
        {PLACES.map((p) => (
          <button key={p.key} onClick={() => setPlaceKey(p.key)} className="tap-target"
            style={{ background: placeKey === p.key ? C.terra : C.white,
              color: placeKey === p.key ? C.white : C.ink,
              border: `1.5px solid ${placeKey === p.key ? C.terra : C.border}`,
              borderRadius: 20, padding: "7px 12px", fontSize: 12, cursor: "pointer",
              fontFamily: "inherit" }}>
            {p.label}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: C.inkLt, lineHeight: 1.6, marginBottom: 12 }}>
        {placeByKey(placeKey).hint}
      </div>

      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={140}
        placeholder="Which one? e.g. the café on the ground floor"
        aria-label="Which place" style={{ ...field, marginBottom: 10 }} />

      <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)}
        aria-label="When" style={{ ...field, marginBottom: 12 }} />

      {problem && (
        <div role="alert" style={{ fontSize: 12, color: C.redTx, lineHeight: 1.5, marginBottom: 10 }}>
          {problem}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button style={btn(true)} onClick={propose} disabled={busy}>
          {busy ? "Sending…" : t("suggest_this")}
        </button>
        <button style={btn(false)} onClick={() => { setComposing(false); setProblem(null); }}>
          Not now
        </button>
      </div>

      {/* The refusal is the useful part. A woman who has read this knows that
          being asked to come to a flat is itself the warning, which no amount
          of "meet in public" gets across. */}
      <button onClick={() => setShowAvoid((v) => !v)}
        style={{ background: "none", border: "none", padding: 0, cursor: "pointer",
          color: C.terraTx, fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
        {showAvoid ? "Hide" : "Places to say no to"}
      </button>
      {showAvoid && (
        <div style={{ marginTop: 10 }}>
          {AVOID.map(([what, why]) => (
            <div key={what} style={{ display: "flex", gap: 8, marginBottom: 7 }}>
              <span style={{ color: C.redTx, flexShrink: 0, fontWeight: 700 }}>·</span>
              <div style={{ fontSize: 12, lineHeight: 1.55 }}>
                <b style={{ color: C.ink }}>{what}.</b>{" "}
                <span style={{ color: C.inkLt }}>{why}</span>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: C.inkLt, lineHeight: 1.6, marginTop: 8,
                        borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
            These are busy public places, not verified or supervised ones — there
            is no approved-location scheme in Dubai and we won't pretend
            otherwise. If you feel unsafe: {OUTSIDE_HELP.map((h) => h.label).join(" · ")}.
          </div>
        </div>
      )}
    </div>
  );
}
