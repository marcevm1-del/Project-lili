import { useEffect, useState } from "react";
import { C, Shell, Btn, Field, Note } from "./ui.js";
import * as mod from "./moderation.js";
import Icon from "../icons/Icon.jsx";

// The moderator's view. Not a user-facing screen — reached from Privacy &
// Safety while the queue has no back office of its own. Once the server exists
// this becomes an internal tool, but the flow it encodes stays the same.
export default function ModerationQueue({ onBack }) {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [openCase, setOpenCase] = useState(null);
  const [filter, setFilter] = useState("open");

  const refresh = async () => {
    const all = await mod.listQueue();
    setItems(all);
    setStats(await mod.queueStats());
    if (openCase) setOpenCase(await mod.caseById(openCase.id));
  };
  useEffect(() => { refresh(); }, []);

  if (openCase) {
    return <CaseView item={openCase} onBack={() => setOpenCase(null)}
                     onChanged={refresh} />;
  }

  const shown = items.filter((i) =>
    filter === "open" ? !(mod.STATES[i.state] || {}).terminal
    : filter === "overdue" ? mod.isOverdue(i)
    : true
  );

  return (
    <Shell title="Moderation queue" subtitle="قائمة المراجعة" onBack={onBack}>
      {stats && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {[["Open", stats.open, C.terra],
            ["Overdue", stats.overdue, stats.overdue ? C.red : C.inkLt],
            ["Appeals", stats.appealed, C.gold],
            ["Closed", stats.decided, C.inkLt]].map(([label, n, colour]) => (
            <div key={label} style={{ flex: 1, background: C.white, borderRadius: 12,
                                      border: `1px solid ${C.border}`, padding: "12px 8px",
                                      textAlign: "center" }}>
              <div style={{ fontFamily: "Georgia,serif", fontWeight: 700, fontSize: 20, color: colour }}>{n}</div>
              <div style={{ fontSize: 11, color: C.inkLt, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 7, marginBottom: 14 }}>
        {[["open", "Open"], ["overdue", "Overdue"], ["all", "Everything"]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{
            padding: "7px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer",
            background: filter === k ? C.terra : C.white, color: filter === k ? C.white : C.inkLt,
            border: `1px solid ${filter === k ? C.terra : C.border}`,
          }}>{l}</button>
        ))}
      </div>

      {shown.length === 0 && (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
                      padding: "28px 18px", textAlign: "center" }}>
          <div style={{ marginBottom: 8, display: "flex", justifyContent: "center", color: C.green }}><Icon name="check" size={26} stroke={2} /></div>
          <div style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>Nothing waiting</div>
          <div style={{ fontSize: 12, color: C.inkLt, marginTop: 5, lineHeight: 1.55 }}>
            Reports land here the moment they're sent.
          </div>
        </div>
      )}

      {shown.map((i) => {
        const overdue = mod.isOverdue(i);
        const left = mod.hoursLeft(i);
        return (
          <button key={i.id} onClick={() => setOpenCase(i)} style={{
            width: "100%", textAlign: "left", background: C.white, borderRadius: 14,
            border: `1.5px solid ${overdue ? C.red : C.border}`, padding: "12px 16px",
            marginBottom: 10, cursor: "pointer",
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <div style={{ flex: 1, fontSize: 14, color: C.ink, fontWeight: 600 }}>
                {i.title || i.targetId}
              </div>
              {i.reportCount > 1 && (
                <span style={{ background: C.btn, color: C.onBtn, fontSize: 11, fontWeight: 700,
                               borderRadius: 20, padding: "2px 7px" }}>×{i.reportCount}</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: C.inkLt, marginTop: 4 }}>
              {i.reasons.join(", ")}{i.shopName ? ` · ${i.shopName}` : ""}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 7, alignItems: "center" }}>
              <Pill state={i.state} />
              {!(mod.STATES[i.state] || {}).terminal && (
                <span style={{ fontSize: 11, color: overdue ? C.red : C.inkLt }}>
                  {overdue ? `${Math.abs(left)}h overdue` : `${left}h left`}
                </span>
              )}
            </div>
          </button>
        );
      })}

      <Note>
        Duplicate reports of the same item merge into one case — ten reports of
        one fake bag is one decision, and the count is what tells you which case
        matters. Sorted overdue first, then most-reported.
      </Note>
    </Shell>
  );
}

function CaseView({ item, onBack, onChanged }) {
  const [note, setNote] = useState("");
  const [grounds, setGrounds] = useState("");
  const [strikes, setStrikes] = useState(0);
  const [busy, setBusy] = useState(false);
  // v2.8 — the conversation, if she chose to attach one. Deliberately NOT
  // loaded with the case: opening a case should not silently count as reading
  // someone's private messages, and every fetch writes an audit row.
  const [transcript, setTranscript] = useState(null);
  const [loadingTranscript, setLoadingTranscript] = useState(false);

  useEffect(() => {
    if (item.shopId) mod.sellerStrikes(item.shopId).then(setStrikes);
  }, [item.shopId]);

  const act = async (fn) => {
    setBusy(true);
    try { await fn(); await onChanged(); } finally { setBusy(false); }
  };

  const decided = !!item.decision;

  return (
    <Shell title="Case" subtitle={item.id.slice(0, 16)} onBack={onBack}>
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{item.title}</div>
        <div style={{ fontSize: 12, color: C.inkLt, marginTop: 4 }}>
          {item.kind} · {item.shopName || "unknown seller"} · {item.marketCode || "—"}
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
          <Pill state={item.state} />
          <span style={{ fontSize: 11, color: mod.isOverdue(item) ? C.red : C.inkLt }}>
            {mod.isOverdue(item) ? "Past SLA" : `${mod.hoursLeft(item)}h left`}
          </span>
        </div>
      </div>

      {item.kind === "conversation" && (
        <>
          <div style={head}>The conversation</div>
          {!transcript ? (
            <>
              <Btn tone="ghost" disabled={loadingTranscript} onClick={async () => {
                setLoadingTranscript(true);
                try { setTranscript(await mod.caseTranscript(item.id)); }
                finally { setLoadingTranscript(false); }
              }}>
                {loadingTranscript ? "Opening…" : "Open the attached conversation"}
              </Btn>
              <Note>
                Only what she chose to hand over, frozen as it stood when she
                reported. Opening it is recorded against your name.
              </Note>
            </>
          ) : transcript.attached ? (
            <>
              <div style={{ ...card, maxHeight: 260, overflowY: "auto" }}>
                {(transcript.transcript || []).map((m, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, color: C.inkLt, marginBottom: 2 }}>
                      {m.from === "reporter" ? "The person who reported" : "The person reported"}
                    </div>
                    <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.5 }}>{m.body}</div>
                  </div>
                ))}
              </div>
              <Note>
                {transcript.messages} message{transcript.messages === 1 ? "" : "s"},
                captured when the report was made. Neither party can change it.
              </Note>
            </>
          ) : (
            <Note>
              {transcript.note ||
                "She did not attach the conversation. Decide on what she wrote, or ask her."}
            </Note>
          )}
        </>
      )}

      <div style={head}>Reported for</div>
      {item.reasons.map((r) => (
        <div key={r} style={row}><span style={{ color: C.terraTx }}>◦</span><span>{r}</span></div>
      ))}
      {item.detail && (
        <div style={{ ...card, fontSize: 12, color: C.inkLt, lineHeight: 1.6 }}>{item.detail}</div>
      )}

      <div style={head}>Seller standing</div>
      <div style={row}>
        <span style={{ color: strikes ? C.red : C.green }}>◦</span>
        <span>{strikes} strike{strikes === 1 ? "" : "s"} that count · next step: {
          mod.ACTIONS ? require_safe(strikes) : ""}</span>
      </div>

      {!decided && (
        <>
          <div style={head}>Decision</div>
          <div style={{ fontSize: 12, color: C.inkLt, lineHeight: 1.55, marginBottom: 10 }}>
            Whatever you choose, both sides are told the outcome and the reason.
            Write the reason as if the seller will read it, because they will.
          </div>
          <Field multiline value={note} onChange={setNote}
                 placeholder="Why — one or two sentences" />
          {Object.values(mod.ACTIONS).map((a) => (
            <button key={a.key} disabled={busy}
              onClick={() => act(() => mod.decide(item.id, a.key, note, strikes))}
              style={{
                width: "100%", textAlign: "left", padding: "12px 14px", marginBottom: 8,
                borderRadius: 12, cursor: busy ? "default" : "pointer", background: C.white,
                border: `1.5px solid ${a.key === "dismiss" ? C.border : C.terra}`,
              }}>
              <div style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{a.label}</div>
              {a.strike > 0 && (
                <div style={{ fontSize: 11, color: C.inkLt, marginTop: 2 }}>
                  Adds {a.strike} strike{a.strike === 1 ? "" : "s"} → {strikes + a.strike} total
                </div>
              )}
            </button>
          ))}
        </>
      )}

      {decided && (
        <>
          <div style={head}>Outcome</div>
          <div style={card}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{item.decision.label}</div>
            <div style={{ fontSize: 12, color: C.inkLt, marginTop: 6, lineHeight: 1.6 }}>
              {item.decision.consequence}
            </div>
          </div>
          <div style={head}>Statement of reasons</div>
          <div style={{ ...card, fontSize: 12, color: C.inkLt, lineHeight: 1.6 }}>
            <b style={{ color: C.ink }}>To the reporter:</b> {item.decision.statementToReporter}
            {item.decision.statementToSeller && (
              <div style={{ marginTop: 8 }}>
                <b style={{ color: C.ink }}>To the seller:</b> {item.decision.statementToSeller}
              </div>
            )}
          </div>

          {!item.remote && item.decision.appealable && item.state === "upheld" && !item.appeal && (
            <>
              <div style={head}>Seller appeal</div>
              <div style={{ fontSize: 12, color: C.inkLt, lineHeight: 1.55, marginBottom: 10 }}>
                An appealed strike stops counting until it's resolved.
              </div>
              <Field multiline value={grounds} onChange={setGrounds}
                     placeholder="Seller's grounds for appeal" />
              <Btn tone="ghost" onClick={() => act(() => mod.appeal(item.id, grounds))}>
                Log an appeal
              </Btn>
            </>
          )}

          {item.state === "appealed" && (
            <>
              <div style={head}>Appeal pending</div>
              <div style={{ ...card, fontSize: 12, color: C.inkLt, lineHeight: 1.6 }}>
                {(item.appeal && item.appeal.grounds) || "The seller's grounds didn't load. Open the case again."}
              </div>
              <div style={{ fontSize: 12, color: C.inkLt, lineHeight: 1.55, marginBottom: 10 }}>
                The seller receives your reason. A moderator other than the one who
                made the decision has to rule on the appeal.
              </div>
              <Field multiline value={note} onChange={setNote}
                     placeholder="Your reason — one or two sentences" />
              <Btn onClick={() => act(() => mod.resolveAppeal(item.id, true, note))}>
                Uphold the original decision
              </Btn>
              <Btn tone="ghost" onClick={() => act(() => mod.resolveAppeal(item.id, false, note))}>
                Overturn — remove the strike
              </Btn>
            </>
          )}
        </>
      )}
    </Shell>
  );
}

function require_safe(strikes) {
  try { return mod.STATES && strikeLabel(strikes); } catch { return "—"; }
}
function strikeLabel(strikes) {
  return strikes >= 3 ? "shop closed" : strikes === 2 ? "selling paused" : "listing removed";
}

function Pill({ state }) {
  // A state this build has not heard of must render as itself, not crash the
  // one screen you open when something has already gone wrong.
  const s = mod.STATES[state] || { key: state, label: state || "unknown", terminal: false };
  const colour = { pending: C.gold, reviewing: C.terra, upheld: C.red,
                   dismissed: C.inkLt, appealed: C.gold, overturned: C.green }[state]
                 || C.inkLt;   // an unfamiliar state still needs to be visible
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: colour,
                   border: `1px solid ${colour}`, borderRadius: 20, padding: "2px 8px" }}>
      {s ? s.label : state}
    </span>
  );
}

const card = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
               padding: "14px 16px", marginBottom: 10 };
const head = { fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase",
               color: C.terraTx, fontWeight: 700, margin: "18px 0 10px" };
const row = { display: "flex", gap: 10, fontSize: 13, color: C.ink,
              lineHeight: 1.55, marginBottom: 7, alignItems: "flex-start" };
