import { useState } from "react";
import { C } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import * as repo from "../data/repo.js";
import { withTimeout, BUDGET, isTimeout } from "../ux/timeout.js";

// ─────────────────────────────────────────────────────────────────────────────
//  A REVIEW, AFTER A MEET
//
//  Every resale app a buyer compares lili with has seller reviews; lili had a
//  "replies within a day" signal and nothing anyone else had said. This is the
//  other half, and it is built on the one thing lili can vouch for: the two of
//  them agreed a meet here and its time has passed. No meet, no review — so a
//  rating cannot be bought with a conversation that never became a handover.
//
//  Double-blind, as the server enforces: what she writes is hidden until the
//  other person has reviewed too, or 14 days have passed, so neither of them
//  can wait to see the other's and answer it.
// ─────────────────────────────────────────────────────────────────────────────

const WORDS = ["", "Poor", "Not great", "Fine", "Good", "Lovely"];

export default function ReviewPrompt({ meetId, otherRole = "seller", onDone }) {
  const [stars, setStars] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(null);
  const [sent, setSent] = useState(null);

  if (sent) {
    return (
      <div role="status" style={{ fontSize: 12, color: C.inkLt, lineHeight: 1.6 }}>
        <b style={{ color: C.ink }}>Thank you.</b>{" "}
        {sent.visible
          ? "Both of you have reviewed, so both reviews are now on your profiles."
          : `Your review shows once the ${otherRole} has reviewed you too, or in 14 days — so neither of you sees the other's first.`}
      </div>
    );
  }

  const send = async () => {
    if (!stars || busy) return;
    setBusy(true); setProblem(null);
    try {
      const r = await withTimeout(repo.leaveReview(meetId, stars, body.trim()), BUDGET.interactive);
      setSent(r || { ok: true });
      if (onDone) onDone(r);
    } catch (e) {
      setProblem(isTimeout(e) ? "That didn't reach lili. Nothing was saved — try again."
                              : (e && e.message) || "That didn't work.");
    }
    setBusy(false);
  };

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 6 }}>
        Rate the {otherRole}
      </div>
      <div role="radiogroup" aria-label={`Rate the ${otherRole}`}
        style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} role="radio" aria-checked={stars === n} aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className="tap-round" onClick={() => setStars(n)}
            style={{ background: "none", border: "none", padding: 4, cursor: "pointer",
              color: n <= stars ? C.terraTx : C.border }}>
            <Icon name="star" size={26} filled={n <= stars} />
          </button>
        ))}
        <span style={{ fontSize: 12, color: C.inkLt, marginInlineStart: 8 }}>{WORDS[stars]}</span>
      </div>
      {stars > 0 && (
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} rows={2}
          placeholder="A line for the next person (optional) — on time? as described?"
          aria-label="Your review"
          style={{ width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 13,
            border: `1px solid ${C.border}`, background: C.cream, color: C.ink,
            fontFamily: "inherit", boxSizing: "border-box", resize: "vertical", marginBottom: 8 }} />
      )}
      {problem && (
        <div role="alert" style={{ fontSize: 12, color: C.redTx, lineHeight: 1.5, marginBottom: 8 }}>{problem}</div>
      )}
      <button onClick={send} disabled={!stars || busy}
        style={{ background: stars ? C.btn : C.sand, color: stars ? C.onBtn : C.inkLt, border: "none",
          borderRadius: 20, padding: "8px 18px", fontSize: 13, fontWeight: 700,
          cursor: stars && !busy ? "pointer" : "default", fontFamily: "inherit", opacity: busy ? 0.6 : 1 }}>
        {busy ? "Sending…" : "Send review"}
      </button>
      <div style={{ fontSize: 11, color: C.inkLt, marginTop: 8, lineHeight: 1.5 }}>
        Shown without your name. Only the two of you who met can review it.
      </div>
    </div>
  );
}
