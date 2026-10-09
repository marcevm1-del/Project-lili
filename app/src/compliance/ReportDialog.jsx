import { useState } from "react";
import { C, Btn, Field, Note } from "./ui.js";
import { record } from "./audit.js";
import { enqueue } from "./moderation.js";
import { useCompliance } from "./context.js";
import Icon from "../icons/Icon.jsx";
import { useFocusTrap, dialogProps } from "../a11y/useFocusTrap.js";
import * as remote from "../backend/remote.js";
import { withTimeout, BUDGET, isRateLimited, isDuplicate } from "../ux/timeout.js";
import { t, getLang } from "../i18n/t.js";
const isAr = () => getLang() === "ar";

// Play requires an in-app way to report content and block a user for any app
// carrying user listings. The EU DSA goes further: a report needs a reasoned
// decision back and a route to appeal. This flow captures both — the decision
// half needs a moderation queue on the server, which is noted where it lands.

// v2.9.2: the reasons are bilingual now.
//
// This list was English-only, and it is the one flow in the app where a
// comprehension failure has a cost outside the app: a woman reporting a
// counterfeit, harassment or a scam had to read English to say which. She is
// also, by definition, already having a bad time.
//
// These are short, standard interface phrases rather than the legal text
// languages.js rules out — but they are still marked `arReview: true` below,
// because "translated by the person building the software" is not the same
// claim as "translated by someone who speaks it", and the difference belongs on
// the record rather than in somebody's memory.
const REASONS = [
  { key: "counterfeit", label: "Counterfeit or replica", labelAr: "مقلد أو نسخة",
    sub: "Claims to be a brand it isn't", subAr: "تدّعي أنها ماركة وهي ليست كذلك", escalate: true },
  { key: "prohibited", label: "Not allowed to be sold here", labelAr: "غير مسموح ببيعها هنا",
    sub: "Restricted in this market", subAr: "ممنوعة في هذا السوق", escalate: true },
  { key: "offensive", label: "Offensive or inappropriate imagery", labelAr: "صور مسيئة أو غير لائقة" },
  { key: "harassment", label: "Harassment or abuse", labelAr: "تحرش أو إساءة" },
  { key: "scam", label: "Scam or fraud", labelAr: "احتيال أو نصب", escalate: true },
  { key: "stolen", label: "Stolen goods", labelAr: "بضاعة مسروقة", escalate: true },
  { key: "miscategorised", label: "Wrong category or misleading description",
    labelAr: "تصنيف خاطئ أو وصف مضلل" },
  { key: "other", label: "Something else", labelAr: "شيء آخر" },
];

/** Arabic here was written alongside the code, not by a native translator. */
export const REASONS_NEED_NATIVE_REVIEW = true;

export default function ReportDialog({ subject, onClose }) {
  // subject: { kind:"listing"|"seller", id, title, shopId, shopName }
  const { m, blockSeller } = useCompliance();
  const [reason, setReason] = useState(null);
  const [detail, setDetail] = useState("");
  const [rightsHolder, setRightsHolder] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [sent, setSent] = useState(null);
  // v2.8 — consented disclosure. Only offered when she is reporting a
  // conversation she is in, and off by default: attaching your own private
  // messages is a decision, not a default.
  const [attachThread, setAttachThread] = useState(false);
  const isConversation = subject.kind === "conversation";

  const chosen = REASONS.find((r) => r.key === reason);
  const isCounterfeit = reason === "counterfeit";
  const canSend = reason && (!isCounterfeit || rightsHolder.trim().length > 1);

  const submit = async () => {
    const entry = await record("content.reported", {
      kind: subject.kind, targetId: subject.id, title: subject.title,
      shopId: subject.shopId, reason, detail: detail.slice(0, 2000),
      rightsHolder: isCounterfeit ? rightsHolder : undefined,
      market: m.code, escalated: !!chosen?.escalate,
    });
    // The report goes into the moderation queue, not just the audit trail.
    // A captured report nobody reads is worse than no report button.
    const kase = await enqueue({
      source: "user_report", kind: subject.kind, targetId: subject.id,
      title: subject.title, shopId: subject.shopId, shopName: subject.shopName,
      reason, detail, marketCode: m.code,
    });
    // v2.8 — EVERY report now reaches the server, not just conversations.
    //
    // `enqueue` above files the case in device storage, which is right for a
    // build with no backend and useless for everything else: a woman reporting
    // a counterfeit listing was filing it on her own phone, where no moderator
    // would ever see it. `remote.enqueueCase` existed and had no callers.
    //
    // A conversation takes the dedicated path instead, because that is the only
    // one that can freeze, gate and audit the disclosure she consented to.
    //
    // Bounded, and non-fatal. She has already told us something is wrong and is
    // waiting on a screen; an unreachable server must not leave her there. The
    // device copy holds the case either way, so a timeout costs the server
    // record, not the report.
    //
    // Caught here because this exact shape — an unbounded call on a path a
    // person is waiting on — is what left the notifications sheet spinning
    // forever, and it was about to do the same to a report of harassment.
    let serverCase = null;
    let refusal = null;
    if (remote.isConfigured()) {
      try {
        serverCase = await withTimeout(
          isConversation
            ? remote.reportConversation({
                conversationId: subject.id, reasons: [reason], detail,
                attachTranscript: attachThread,
              })
            : remote.enqueueCase({
                kind: subject.kind === "seller" ? "shop" : "listing",
                itemId: subject.kind === "listing" ? subject.id : null,
                shopId: subject.shopId || null,
                reasons: [reason], detail,
              }),
          BUDGET.acknowledge);
      } catch (e) {
        console.warn("report did not reach the server:", e && e.message);
        // v2.9.1: a refusal is not a timeout, and telling her "saved on your
        // phone, it will reach us later" when the server has looked at this and
        // said no is the same class of lie as the publish path used to tell a
        // seller. Two refusals are meaningful and both have a real message.
        if (isDuplicate(e) || isRateLimited(e)) refusal = e.message;
      }
    }
    if (alsoBlock && subject.shopId) await blockSeller(subject.shopId, subject.shopName);
    setSent({ ...entry,
              reachedUs: !!serverCase,
              refusal,
              caseId: (serverCase && (serverCase.case_id || serverCase.id)) || kase.id,
              slaHours: kase.slaHours, attached: attachThread && !!serverCase });
  };

  if (sent) {
    return (
      <Sheet onClose={onClose}>
        <div style={{ textAlign: "center", padding: "10px 0 4px" }}>
          <div style={{ marginBottom: 10, display: "flex", justifyContent: "center", color: C.green }}><Icon name="check" size={32} stroke={2} /></div>
          <div style={{ fontFamily: "Georgia,serif", fontWeight: 700, fontSize: 20, color: C.ink }}>
            Report received
          </div>
          <div style={{ fontSize: 13, color: C.inkLt, marginTop: 8, lineHeight: 1.6 }}>
            Reference <b style={{ color: C.ink }}>{(sent.caseId || sent.id).slice(0, 16)}</b>
            {sent.slaHours ? <><br/>We aim to decide within {sent.slaHours} hours.</> : null}
          </div>
        </div>
        <div style={box}>
          {chosen?.escalate
            ? `Reports of ${chosen.label.toLowerCase()} go to a human reviewer first. ` +
              `In ${m.name} this category is treated as urgent.`
            : "A reviewer will look at this and you'll get the outcome and the reason for it."}
        </div>
        {sent.refusal && (
          <div role="alert" style={{ background: "#FBF0EE", border: `1.5px solid ${C.red}`,
            borderRadius: 12, padding: "12px 14px", fontSize: 12, lineHeight: 1.55,
            color: C.ink, marginBottom: 12 }}>
            {sent.refusal}
          </div>
        )}
        {!sent.reachedUs && !sent.refusal && (
          // Honest rather than reassuring. The report is filed on this device
          // and nothing is lost, but it has not reached a reviewer yet and she
          // should know that rather than assume someone is already reading it.
          <div style={{ ...box, borderColor: C.gold }}>
            Saved on your phone — it hadn't reached us when you sent it. It will
            go through next time you're connected.
          </div>
        )}
        {sent.attached && (
          <div style={{ ...box, borderColor: C.green }}>
            The conversation was included, frozen as it stood when you sent this.
          </div>
        )}
        {isConversation && !sent.attached && (
          <div style={box}>
            You chose not to include the conversation, so we will decide on what
            you wrote. You can report again and include it if you change your mind.
          </div>
        )}
        {alsoBlock && (
          <div style={{ ...box, borderColor: C.terra, color: C.terraTx }}>
            You won't see {subject.shopName || "this seller"} again.
          </div>
        )}
        <Btn onClick={onClose}>Done</Btn>
        <Note>
          You'll be told the outcome and the reason for it. If you disagree
          with the decision, you can ask for it to be looked at again.
        </Note>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose}>
      <div style={{ fontFamily: "Georgia,serif", fontWeight: 700, fontSize: 22,
                    color: C.ink, marginBottom: 4 }}>
        Report this {subject.kind}
      </div>
      <div style={{ fontSize: 12, color: C.inkLt, marginBottom: 18 }}>
        {subject.title} · بلاغ
      </div>

      {REASONS.map((r) => (
        <button key={r.key} onClick={() => setReason(r.key)} style={{
          width: "100%", textAlign: "left", display: "flex", gap: 12,
          alignItems: "flex-start", padding: "12px 14px", marginBottom: 7,
          borderRadius: 12, cursor: "pointer", background: C.white,
          border: `1.5px solid ${reason === r.key ? C.terra : C.border}`,
        }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", marginTop: 1,
                        border: `1.5px solid ${reason === r.key ? C.terra : C.border}`,
                        background: reason === r.key ? C.terra : "transparent", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, color: C.ink, fontWeight: reason === r.key ? 600 : 400 }}>
              {isAr() && r.labelAr ? r.labelAr : r.label}
            </div>
            {(isAr() && r.subAr ? r.subAr : r.sub) &&
              <div style={{ fontSize: 11, color: C.inkLt, marginTop: 2 }}>
                {isAr() && r.subAr ? r.subAr : r.sub}
              </div>}
          </div>
        </button>
      ))}

      {isCounterfeit && (
        <div style={{ marginTop: 12 }}>
          <div style={label}>Which brand is being copied?</div>
          <Field value={rightsHolder} onChange={setRightsHolder} placeholder="e.g. Chanel" />
          <div style={{ ...box, fontSize: 11 }}>
            Counterfeit reports are the ones that carry real legal weight in{" "}
            {m.name}. If you are the brand or represent it, use the rights-holder
            route in Privacy &amp; Safety instead — it moves faster and takes evidence.
          </div>
        </div>
      )}

      {reason && (
        <div style={{ marginTop: 12 }}>
          <div style={label}>Anything else we should know? (optional)</div>
          <Field multiline value={detail} onChange={setDetail}
                 placeholder="What's wrong with it" />
        </div>
      )}

      {reason && subject.shopId && (
        <button onClick={() => setAlsoBlock((v) => !v)} style={{
          width: "100%", display: "flex", gap: 12, alignItems: "center",
          padding: "12px 14px", borderRadius: 12, background: C.white,
          border: `1px solid ${C.border}`, cursor: "pointer", textAlign: "left",
        }}>
          <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                        border: `1.5px solid ${C.terra}`, background: alsoBlock ? C.terra : C.white,
                        display: "flex", alignItems: "center", justifyContent: "center" }}>
            {alsoBlock && <Icon name="check" size={12} stroke={2.4} style={{ color: C.white }} />}
          </div>
          <span style={{ fontSize: 13, color: C.ink }}>
            Also block {subject.shopName || "this seller"}
          </span>
        </button>
      )}

      {/* ── v2.8: consented disclosure ──────────────────────────────────────
          Nobody at lili can read a private thread. That is deliberate, and it
          left a hole: a harassment report could be filed and never assessed,
          because there was nothing to assess.

          This is the smallest fix that does not hand anyone a new power. She
          can already read this conversation; she may choose to hand a copy
          over, at the moment she asks for help. Off by default, because
          attaching your own private messages is a decision, not a default. */}
      {isConversation && (
        <>
          <button onClick={() => setAttachThread(!attachThread)} style={{
            display: "flex", alignItems: "flex-start", gap: 12, width: "100%",
            background: C.white, borderRadius: 12, padding: "12px 14px",
            marginTop: 14, border: `1px solid ${attachThread ? C.terra : C.border}`,
            cursor: "pointer", textAlign: "left",
          }} aria-pressed={attachThread}>
            <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
                          border: `1.5px solid ${C.terra}`, background: attachThread ? C.terra : C.white,
                          display: "flex", alignItems: "center", justifyContent: "center" }}>
              {attachThread && <Icon name="check" size={12} stroke={2.4} style={{ color: C.white }} />}
            </div>
            <span style={{ fontSize: 13, color: C.ink, lineHeight: 1.5 }}>
              Include this conversation with my report
              <span style={{ display: "block", fontSize: 12, color: C.inkLt, marginTop: 3 }}>
                Otherwise nobody can read it — not us, not a reviewer. Without it
                we can only act on what you write here.
              </span>
            </span>
          </button>
          {attachThread && (
            <div style={{ ...box, fontSize: 12 }}>
              A copy is taken now and frozen, so it cannot be changed afterwards by
              either of you. Only a reviewer can open it, and every time one does
              it is recorded. {subject.shopName || "The other person"} is not told
              that you reported — only the outcome, once there is one.
            </div>
          )}
        </>
      )}

      <Btn disabled={!canSend} onClick={submit}>{t("send_report")}</Btn>
      <Btn tone="ghost" onClick={onClose}>Cancel</Btn>
    </Sheet>
  );
}

function Sheet({ children, onClose }) {
  const trap = useFocusTrap(onClose);
  return (
    <div onClick={onClose} style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 0, zIndex: 400,
      background: "#000a", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div ref={trap} {...dialogProps("Report")} className="safe-sheet" onClick={(e) => e.stopPropagation()} style={{
        background: C.cream, borderRadius: "20px 20px 0 0", maxHeight: "92dvh",
        overflowY: "auto",
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      }}>{children}</div>
    </div>
  );
}

const label = { fontSize: 11, color: C.terraTx, fontWeight: 700, letterSpacing: 0.5,
                textTransform: "uppercase", marginBottom: 7 };
const box = { background: C.sand, border: `1px solid ${C.border}`, borderRadius: 12,
              padding: "12px 14px", fontSize: 12, color: C.inkLt,
              lineHeight: 1.6, marginBottom: 12 };
