import { useEffect, useState } from "react";
import { getLang } from "../i18n/t.js";
import { C, Shell, Note } from "../compliance/ui.js";
import { MODES, getMode, setMode, resolve } from "./theme.js";
import Icon from "../icons/Icon.jsx";

export default function ThemePicker({ onBack }) {
  const [mode, setModeState] = useState("system");
  const [effective, setEffective] = useState("light");

  useEffect(() => {
    getMode().then((m) => { setModeState(m); setEffective(resolve(m)); });
  }, []);

  const choose = async (key) => {
    setModeState(key);
    setEffective(await setMode(key));
  };

  return (
    <Shell title="Appearance" subtitle="المظهر" onBack={onBack}>
      <p style={p}>
        Dark mode here is warm, not grey — lili is peach and terracotta, and a
        brand that turns cold after dark stops being itself.
      </p>

      {MODES.map((m) => {
        const on = mode === m.key;
        const showsDark = m.key === "dark" || (m.key === "system" && effective === "dark");
        return (
          <button key={m.key} onClick={() => choose(m.key)} style={{
            width: "100%", display: "flex", alignItems: "center", gap: 12,
            background: C.white, borderRadius: 14, padding: "12px 16px",
            marginBottom: 10, textAlign: "left", cursor: "pointer", minHeight: 44,
            border: `1.5px solid ${on ? C.terra : C.border}`,
          }}>
            <Swatch dark={showsDark} />
            <div style={{ flex: 1 }}>
              {/* v2.11.1 — one language, like the other 119 labels.
                  This printed "Match my phone · حسب الجهاز" in a single label:
                  the pattern v2.9.3 removed everywhere else, and the same one
                  found on the category chips a release ago. An English speaker
                  reads past Arabic she cannot use; an Arabic speaker reads past
                  English to find her half, second and in a smaller size.
                  This screen is reached from Settings, after the language has
                  been chosen, so there is no excuse for hedging. */}
              <div style={{ fontSize: 14, color: C.ink, fontWeight: on ? 700 : 600 }}>
                {getLang() === "ar" ? (m.labelAr || m.label) : m.label}
              </div>
              <div style={{ fontSize: 11, color: C.inkLt, marginTop: 3, lineHeight: 1.5 }}>
                {m.note}
              </div>
            </div>
            {on && <Icon name="check" size={15} stroke={2.2} style={{ color: C.terraTx }} />}
          </button>
        );
      })}

      <div style={{ background: C.sand, border: `1px solid ${C.border}`, borderRadius: 12,
                    padding: "12px 14px", marginTop: 6 }}>
        <div style={{ fontSize: 11, color: C.inkLt, lineHeight: 1.6 }}>
          Currently showing <b style={{ color: C.ink }}>{effective}</b>
          {mode === "system" && " — following your phone"}.
        </div>
      </div>

      <Note>
        Every colour pairing in both themes is measured against WCAG AA rather
        than eyeballed. Run <b>npm run contrast</b> to see the numbers.
      </Note>
    </Shell>
  );
}

/** A miniature of the app, so the choice is visible rather than described. */
function Swatch({ dark }) {
  const t = dark
    ? { bg: "#16110E", card: "#241C17", ink: "#F2E4D8", accent: "#D9997A", line: "#3A2E26" }
    : { bg: "#FDEBD8", card: "#FFFFFF", ink: "#5C4A3A", accent: "#C4856A", line: "#F0DDD0" };
  return (
    <div style={{ width: 46, height: 46, borderRadius: 10, flexShrink: 0,
                  background: t.bg, border: `1px solid ${t.line}`, padding: 6,
                  display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ height: 6, borderRadius: 2, background: t.card }} />
      <div style={{ height: 6, borderRadius: 2, background: t.card, width: "70%" }} />
      <div style={{ height: 8, borderRadius: 4, background: t.accent, width: "55%",
                    marginTop: "auto" }} />
    </div>
  );
}

const p = { fontSize: 13, color: C.inkLt, lineHeight: 1.65, margin: "0 0 18px" };
