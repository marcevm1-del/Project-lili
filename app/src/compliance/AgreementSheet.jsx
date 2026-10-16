import { useState } from "react";
import { C, Shell, Btn, Note } from "./ui.js";
import { record } from "./audit.js";
import { AGREEMENT_VERSION } from "./agreements.js";
import Icon from "../icons/Icon.jsx";
import { t } from "../i18n/t.js";

/**
 * Per-clause tick list. Every clause is its own decision, nothing is
 * pre-ticked, and there is deliberately no "agree to all" shortcut — one tap
 * accepting eight obligations is the thing a tribunal discounts.
 *
 * Each acceptance is recorded individually with the clause id and version, so
 * "which version of which clause did this seller accept, and when" has an
 * answer.
 */
export default function AgreementSheet({
  clauses, title, subtitle, intro, ctaLabel = "I agree",
  surface = "seller", onAgree, onBack,
}) {
  const [ticked, setTicked] = useState({});
  const [open, setOpen] = useState(null);

  const required = clauses.filter((c) => c.required !== false);
  const done = required.every((c) => ticked[c.id]);
  const remaining = required.filter((c) => !ticked[c.id]).length;

  const toggle = (id) => setTicked((t) => ({ ...t, [id]: !t[id] }));

  const submit = async () => {
    const at = new Date().toISOString();
    for (const c of clauses) {
      if (ticked[c.id]) {
        await record("agreement.accepted", {
          surface, clauseId: c.id, title: c.title,
          version: AGREEMENT_VERSION, at,
        });
      }
    }
    onAgree && onAgree({ version: AGREEMENT_VERSION, accepted: Object.keys(ticked).filter(k => ticked[k]), at });
  };

  return (
    <Shell title={title} subtitle={subtitle} onBack={onBack}>
      {intro && <p style={introStyle}>{intro}</p>}

      {clauses.map((c) => {
        const on = !!ticked[c.id];
        const expanded = open === c.id;
        return (
          <div key={c.id} style={{
            background: C.white, borderRadius: 14, marginBottom: 10,
            border: `1.5px solid ${on ? C.terra : C.border}`, overflow: "hidden",
          }}>
            <button onClick={() => toggle(c.id)} style={{
              width: "100%", display: "flex", gap: 12, alignItems: "flex-start",
              padding: "14px 16px", background: "none", border: "none",
              textAlign: "left", cursor: "pointer",
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: 7, flexShrink: 0, marginTop: 1,
                border: `1.5px solid ${on ? C.terra : C.border}`,
                background: on ? C.terra : C.white,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {on && <Icon name="check" size={13} stroke={2.4} style={{ color: C.white }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: C.ink, fontWeight: 600, lineHeight: 1.35,
                              display: "flex", alignItems: "center", gap: 7 }}>
                  {c.icon && <Icon name={c.icon} size={17} style={{ color: C.terraTx }} />}
                  {c.title}
                </div>
                {c.titleAr && (
                  <div style={{ fontSize: 11, color: C.terraTx, marginTop: 2 }}>{c.titleAr}</div>
                )}
                <div style={{
                  fontSize: 12, color: C.inkLt, marginTop: 6, lineHeight: 1.55,
                  maxHeight: expanded ? 400 : 34, overflow: "hidden",
                }}>
                  {c.body}
                  {expanded && c.bodyAr && (
                    <div style={{ marginTop: 8, direction: "rtl", textAlign: "right" }}>{c.bodyAr}</div>
                  )}
                </div>
              </div>
            </button>
            <button onClick={() => setOpen(expanded ? null : c.id)} style={{
              width: "100%", background: "none", border: "none", borderTop: `1px solid ${C.border}`,
              padding: "7px 0", fontSize: 11, color: C.inkLt, cursor: "pointer",
            }}>
              {expanded ? "Show less" : t("read_in_full")}
            </button>
          </div>
        );
      })}

      <Btn disabled={!done} onClick={submit}>
        {done ? ctaLabel : `${remaining} left to confirm`}
      </Btn>

      <Note>
        Each line is recorded separately against version {AGREEMENT_VERSION}, so
        there's a record of exactly what you agreed to and when. Read them back
        any time in Profile → Privacy &amp; Safety.
      </Note>
    </Shell>
  );
}

const introStyle = { fontSize: 13, color: C.inkLt, lineHeight: 1.65, margin: "0 0 18px" };
