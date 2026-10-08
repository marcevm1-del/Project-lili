import { useState } from "react";
import { C } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import { t } from "../i18n/t.js";

// ─────────────────────────────────────────────────────────────────────────────
//  MEET SAFELY
//
//  This exists because of a decision about what lili is at launch.
//
//  There is no payment rail, so there is no escrow, no held funds and no
//  platform-mediated dispute. Two women agree a price in a thread and then meet
//  somewhere in Dubai to exchange a bag for cash. That is how Gulf resale
//  already works on Instagram, and pretending otherwise would be the dishonest
//  move. What lili can do is make the handover safer than a DM does.
//
//  Deliberately not a scare screen. It appears once per thread, folds away, and
//  says the three things that actually reduce risk: meet somewhere public,
//  don't move the conversation off lili, and check the piece before money
//  changes hands.
//
//  The middle one is the one people skip and the one that matters most: a
//  thread here cannot be edited after sending and is visible to both parties
//  and to nobody else. A WhatsApp conversation that was moved off-platform is
//  not evidence anyone can produce later.
// ─────────────────────────────────────────────────────────────────────────────

const POINTS = [
  {
    icon: "shield",
    en: "Meet somewhere public",
    ar: "التقيا في مكان عام",
    why: "A mall, a café, a hotel lobby. Daylight. Never a home address, and never a car park after dark.",
  },
  {
    icon: "lock",
    en: "Keep it in lili",
    ar: "أبقيا المحادثة هنا",
    why: "Messages here can't be edited after they're sent, and only the two of you can read them. If something goes wrong, this thread is what we can look at. A chat moved to another app is not.",
  },
  {
    icon: "eye",
    en: "Check the piece before you pay",
    ar: "افحصي القطعة قبل الدفع",
    why: "Serial, stitching, hardware, the flaws in the photos. lili does not hold your money, so the moment to be sure is before it leaves your hand.",
  },
];

export default function MeetSafely({ onDismiss }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      background: C.sand, borderBottom: `1px solid ${C.border}`,
      padding: "10px 14px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="shield" size={13} stroke={2} style={{ color: C.terraTx }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, flex: 1 }}>
          {t("meeting_to_hand_it_over")}
        </span>
        <button
          onClick={() => setOpen(!open)}
          className="tap-target"
          style={{ background: "none", border: "none", cursor: "pointer",
                   color: C.terraTx, fontSize: 11, fontWeight: 600, padding: "2px 4px" }}
          aria-expanded={open}
        >
          {open ? "Hide" : "Read this first"}
        </button>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss safety note"
            className="tap-target"
            style={{ background: "none", border: "none", cursor: "pointer",
                     color: C.inkLt, padding: "2px 2px", display: "flex" }}
          >
            <Icon name="close" size={12} stroke={2} />
          </button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          {POINTS.map((pt) => (
            <div key={pt.en} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Icon name={pt.icon} size={12} stroke={2}
                    style={{ color: C.terraTx, marginTop: 3, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>
                  {pt.en}
                  <span style={{ fontSize: 10, color: C.inkLt, fontWeight: 400 }}> · {pt.ar}</span>
                </div>
                <div style={{ fontSize: 11, color: C.inkLt, lineHeight: 1.55, marginTop: 2 }}>
                  {pt.why}
                </div>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 10, color: C.inkLt, lineHeight: 1.55 }}>
            lili does not take payment or hold funds. The sale is between the two
            of you.
          </div>
        </div>
      )}
    </div>
  );
}
