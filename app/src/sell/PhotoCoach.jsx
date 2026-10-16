import { useState } from "react";
import { C } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import { PHOTO_CHECKLIST, PHOTO_TARGET } from "./listingQuality.js";
import { t, getLang } from "../i18n/t.js";

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

// What data/imageQuality.js found, by its code, in the reader's language. The
// checker keeps writing English (its suite reads those sentences); a code not
// listed here is shown as the checker wrote it.
const FINDING_KEYS = {
  "blur.bad": "iq_blur_bad", "blur.soft": "iq_blur_soft",
  "exposure.dark": "iq_dark", "exposure.blown": "iq_blown",
  "framing.small": "iq_small", "framing.landscape": "iq_landscape",
};
const findingText = (f, part) =>
  getLang() === "ar" && FINDING_KEYS[f.code] ? t(`${FINDING_KEYS[f.code]}_${part}`) : f[part];

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
                <b style={{ color: C.ink }}>{findingText(f, "title")}.</b>{" "}
                <span style={{ color: C.inkLt }}>{findingText(f, "fix")}</span>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: C.inkLt, lineHeight: 1.5 }}>
            {t("pc_checked_on_phone")}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="tap-target"
        style={{
          background: "none", border: "none", padding: 0, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          textAlign: "start", color: C.ink,
        }}
        aria-expanded={open}
      >
        <Icon name="camera" size={14} stroke={2} style={{ color: C.terraTx || C.terra }} />
        <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>
          {count === 0
            ? t("six_photos_that_sell")
            : remaining > 0
            ? t(remaining > 1 ? "pc_more_photos" : "pc_one_more_photo", { n: remaining })
            : t("pc_got_the_shots")}
        </span>
        <span style={{ fontSize: 11, color: C.inkLt }}>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <>
          <ol style={{ margin: "10px 0 0", padding: 0, paddingInlineStart: 16,
                       display: "flex", flexDirection: "column", gap: 7 }}>
            {PHOTO_CHECKLIST.map((s) => (
              <li key={s.id} style={{ fontSize: 12, color: C.ink, lineHeight: 1.5 }}>
                {/* One language per label: this printed "Daylight, near a window ·
                    ضوء النهار…" in a single line, which the rest of the app stopped
                    doing in v2.9.3. */}
                {getLang() === "ar" ? s.ar : s.en}
                {s.why && (
                  <div style={{ fontSize: 11, color: C.inkLt, lineHeight: 1.5, marginTop: 1 }}>
                    {getLang() === "ar" && s.whyAr ? s.whyAr : s.why}
                  </div>
                )}
              </li>
            ))}
          </ol>
          <div style={{ fontSize: 11, color: C.inkLt, marginTop: 10, lineHeight: 1.55 }}>
            {t("pc_research_a")} {t("pc_research_b")} {t("pc_research_c")}
          </div>
        </>
      )}
    </div>
  );
}
