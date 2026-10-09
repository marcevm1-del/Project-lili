import { useMemo, useState } from "react";
import { C } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import { scoreListing } from "./listingQuality.js";

// ─────────────────────────────────────────────────────────────────────────────
//  LISTING QUALITY — the seller-facing half
//
//  Three rules this component keeps, because each one is a way this pattern
//  usually goes wrong:
//
//  1. It never blocks. Publishing stays one tap away at every score.
//  2. It shows at most three things, highest-value first. A checklist of nine
//     is a checklist nobody completes.
//  3. Every suggestion can be expanded to show WHY, and the why cites what it
//     rests on. A nudge a seller cannot interrogate is just a nag.
//
//  It also does not appear until she has started — scoring an empty form 12%
//  is a way of greeting someone with a failure.
// ─────────────────────────────────────────────────────────────────────────────

const TONE = {
  ready: { label: "Ready to list", bar: C.green },
  good:  { label: "Nearly there",  bar: C.gold },
  thin:  { label: "Worth two more minutes", bar: C.terra },
};

export default function ListingQuality({ form, photos, compact }) {
  const [open, setOpen] = useState(null);

  const result = useMemo(
    () => scoreListing({ ...form, photos }),
    [form.title, form.titleAr, form.desc, form.brand, form.price,
     form.category, form.condition, photos.length]
  );

  const started = (form.title || "").trim().length > 0 || photos.length > 0;
  if (!started) return null;

  const tone = TONE[result.grade];

  return (
    <div style={{
      background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
      padding: compact ? "11px 12px" : "13px 14px", marginTop: 14,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>{tone.label}</span>
        <span style={{ fontSize: 11, color: C.inkLt, marginLeft: "auto" }}>
          {result.score}/100
        </span>
      </div>

      {/* The bar reports what was actually earned. No head start, no padding to
          make an empty listing look half done. */}
      <div style={{ height: 4, borderRadius: 4, background: C.border, overflow: "hidden" }}>
        <div style={{
          width: `${result.score}%`, height: "100%", background: tone.bar,
          transition: "width 0.35s ease",
        }} />
      </div>

      {result.top.length === 0 ? (
        <div style={{ fontSize: 12, color: C.inkLt, marginTop: 10, lineHeight: 1.5 }}>
          Everything we can check from here is done. The rest is the photograph
          itself, and no score can judge that.
        </div>
      ) : (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
          {result.top.map((c) => (
            <div key={c.id}>
              <button
                onClick={() => setOpen(open === c.id ? null : c.id)}
                className="tap-target"
                style={{
                  background: "none", border: "none", padding: 0, cursor: "pointer",
                  display: "flex", alignItems: "flex-start", gap: 7, textAlign: "left",
                  width: "100%", color: C.ink,
                }}
                aria-expanded={open === c.id}
              >
                <Icon
                  name={c.state === "missing" ? "plus" : "sparkle"}
                  size={11} stroke={2}
                  style={{ marginTop: 2, color: c.state === "missing" ? C.terra : C.inkLt }}
                />
                <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.45, flex: 1 }}>
                  {c.title}
                </span>
                <span style={{ fontSize: 11, color: C.inkLt, marginTop: 2 }}>
                  {open === c.id ? "−" : "why"}
                </span>
              </button>
              {open === c.id && (
                <div style={{ fontSize: 11, color: C.inkLt, lineHeight: 1.55,
                              margin: "5px 0 2px 18px" }}>
                  {c.why}
                  {c.evidence && (
                    <div style={{ fontSize: 11, opacity: 0.75, marginTop: 5, lineHeight: 1.5 }}>
                      {c.evidence}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 11, color: C.inkLt, marginTop: 10, lineHeight: 1.5 }}>
        Advice, not a gate — you can publish at any score.
      </div>
    </div>
  );
}
