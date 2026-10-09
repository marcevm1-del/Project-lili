import { useState } from "react";
import { C, Shell } from "../compliance/ui.js";
import { POLICIES, POLICY_VERSION, LEGALLY_REVIEWED, policyById } from "./policies.js";
import { chevron } from "../i18n/direction.js";

// ─────────────────────────────────────────────────────────────────────────────
//  The policies, readable in full inside the app.
//
//  Until v2.12 signup asked her to agree to "lili's Platform Terms" and the
//  "Privacy Notice" while showing one paragraph about each; the documents
//  themselves were nowhere she could open them. Agreement to text you can't
//  read is the classic way terms get struck out, and the stores require a
//  privacy policy a person can actually reach.
//
//  Opened with `initial` to land on one policy (from the signup tick), or with
//  none for the list (from Privacy & Safety).
// ─────────────────────────────────────────────────────────────────────────────

export default function PolicyViewer({ initial = null, onBack }) {
  const [id, setId] = useState(initial);
  const policy = id ? policyById(id) : null;

  if (policy) {
    return (
      <Shell title={policy.title} subtitle={policy.titleAr}
             onBack={() => (initial ? onBack() : setId(null))}>
        <Status />
        <p style={lead}>{policy.summary}</p>
        {policy.sections.map((s) => (
          <section key={s.h} style={{ marginBottom: 18 }}>
            <h3 style={h3}>{s.h}</h3>
            {s.body.map((b, i) => typeof b === "string"
              ? <p key={i} style={para}>{b}</p>
              : (
                <ul key={i} style={list}>
                  {b.list.map((li) => <li key={li} style={{ marginBottom: 6 }}>{li}</li>)}
                </ul>
              ))}
          </section>
        ))}
        <p style={{ ...para, fontSize: 12 }}>Version {POLICY_VERSION}.</p>
      </Shell>
    );
  }

  return (
    <Shell title="Policies" subtitle="السياسات" onBack={onBack}>
      <Status />
      {POLICIES.map((p) => (
        <button key={p.id} onClick={() => setId(p.id)} style={row}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{p.title}</div>
            <div style={{ fontSize: 12, color: C.inkLt, marginTop: 3, lineHeight: 1.5 }}>{p.summary}</div>
          </div>
          <span aria-hidden="true" style={{ color: C.inkLt, fontSize: 18, flexShrink: 0 }}>{chevron()}</span>
        </button>
      ))}
    </Shell>
  );
}

function Status() {
  if (LEGALLY_REVIEWED) return null;
  return (
    <div role="note" style={{ background: C.sand, border: `1px solid ${C.border}`, borderRadius: 12,
                              padding: "10px 12px", fontSize: 12, color: C.inkLt, lineHeight: 1.5,
                              marginBottom: 16 }}>
      Draft awaiting review by a UAE lawyer. It describes how lili works today; the Arabic
      version will be the one that counts once it is published.
    </div>
  );
}

const lead = { fontSize: 14, color: C.ink, lineHeight: 1.6, margin: "0 0 18px" };
const h3 = { fontSize: 15, fontWeight: 700, color: C.ink, margin: "0 0 8px" };
const para = { fontSize: 13, color: C.inkLt, lineHeight: 1.65, margin: "0 0 10px" };
const list = { fontSize: 13, color: C.inkLt, lineHeight: 1.6, margin: "0 0 10px", paddingInlineStart: 20 };
const row = {
  width: "100%", display: "flex", alignItems: "center", gap: 12, textAlign: "start",
  background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
  padding: "12px 14px", marginBottom: 8, cursor: "pointer", minHeight: 44,
};
