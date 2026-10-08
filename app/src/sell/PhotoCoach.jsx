import { useState } from "react";
import { C } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import { PHOTO_CHECKLIST, PHOTO_TARGET } from "./listingQuality.js";
import { t } from "../i18n/t.js";

// ─────────────────────────────────────────────────────────────────────────────
//  PHOTO COACH
//
//  Shown BEFORE and DURING capture, never after. That ordering is the whole
//  design: composition is something a seller can act on while the bag is still
//  on the table, and a score delivered afterwards is something she can only
//  feel bad about.
//
//  v2.7 had one line here — "AI Tip: include photos of the serial number,
//  authenticity card, and any original packaging" — and only in the guided
//  flow, which is the flow used by the sellers who already knew. The women who
//  most needed it took the quick path and were told nothing.
//
//  This is not an "AI tip". It is six things, in the order you would actually
//  take them, and it says so plainly rather than borrowing authority from a
//  model that is not running.
//
//  ── v2.9.1: it looks at the photographs now
//
//  Everything above stayed generic, which meant a seller who had just uploaded
//  something dark and blurred was told, in the abstract, to use natural light —
//  next to the photograph proving she hadn't. `data/imageQuality.js` measures
//  focus, exposure and framing on the phone, from the same canvas that strips
//  the EXIF, and what appears here is about HER picture.
//
//  Findings come first and the checklist stays underneath: a specific fault she
//  can correct in ten seconds beats general advice, and general advice is still
//  what she needs once there is nothing specific to say.
// ─────────────────────────────────────────────────────────────────────────────

export default function PhotoCoach({ count = 0, findings = [] }) {
  const [open, setOpen] = useState(count === 0);
  const remaining = Math.max(0, PHOTO_TARGET - count);
  const worst = findings.filter(Boolean);

  return (
    <div style={{
      background: C.sand, borderRadius: 12, padding: "12px 12px", marginTop: 14,
    }}>
      {/* What is wrong with the photograph she is looking at, and the fix. */}
      {worst.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {worst.map((f) => (
            <div key={f.code} style={{
              display: "flex", gap: 10, alignItems: "flex-start",
              background: C.white, borderRadius: 10, padding: "10px 12px", marginBottom: 6,
              border: `1px solid ${f.severity === "high" ? C.red : C.border}` }}>
              <Icon name={f.severity === "high" ? "warning" : "eye"} size={14} stroke={2}
                    style={{ color: f.severity === "high" ? C.redTx : C.terraTx,
                             marginTop: 2, flexShrink: 0 }} />
              <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                <b style={{ color: C.ink }}>{f.title}.</b>{" "}
                <span style={{ color: C.inkLt }}>{f.fix}</span>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 10, color: C.inkLt, lineHeight: 1.5 }}>
            Checked on your phone — the photograph isn't sent anywhere to be
            looked at. You can list it as it is; this is a suggestion, not a rule.
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="tap-target"
        style={{
          background: "none", border: "none", padding: 0, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          textAlign: "left", color: C.ink,
        }}
        aria-expanded={open}
      >
        <Icon name="camera" size={14} stroke={2} style={{ color: C.terraTx || C.terra }} />
        <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>
          {count === 0
            ? t("six_photos_that_sell")
            : remaining > 0
            ? `${remaining} more photo${remaining > 1 ? "s" : ""} and this listing is doing its job`
            : "You've got the shots that matter"}
        </span>
        <span style={{ fontSize: 11, color: C.inkLt }}>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <>
          <ol style={{ margin: "10px 0 0", padding: "0 0 0 16px",
                       display: "flex", flexDirection: "column", gap: 7 }}>
            {PHOTO_CHECKLIST.map((s) => (
              <li key={s.id} style={{ fontSize: 12, color: C.ink, lineHeight: 1.5 }}>
                {s.en}
                <span style={{ fontSize: 10, color: C.inkLt }}> · {s.ar}</span>
                {s.why && (
                  <div style={{ fontSize: 11, color: C.inkLt, lineHeight: 1.5, marginTop: 1 }}>
                    {s.why}
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div style={{ fontSize: 10, color: C.inkLt, marginTop: 10, lineHeight: 1.55 }}>
            Marketplace research is consistent on this: better photographs sell
            more, and the effect is largest on handbags and shoes — about 1.25×
            and 1.17× the chance of selling, in a study of 75,000 listing images
            (Ma et al., 2019). It is the cheapest improvement available to any
            seller here.
          </div>
        </>
      )}
    </div>
  );
}
