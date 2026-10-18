import { useEffect, useState } from "react";
import { C } from "../compliance/ui.js";
import { SYSTEMS, getSizeSystem, setSizeSystem, onSizeSystemChange, APPROXIMATE_NOTE } from "./sizeSystem.js";

/** Re-renders the caller whenever the size system changes anywhere in the app. */
export function useSizeSystem() {
  const [sys, setSys] = useState(getSizeSystem());
  useEffect(() => onSizeSystemChange(setSys), []);
  return sys;
}

/**
 * The size-system bar: EU · UK · US · IT · FR · AU · JP, one row that scrolls
 * sideways on a narrow phone. A radio group, so a screen reader announces it
 * as one choice of eight and arrow keys move along it.
 */
export function SizeSystemPicker({ label = "Show sizes in", note = true, compact = false }) {
  const sys = useSizeSystem();
  const pick = (k) => setSizeSystem(k);
  const onKey = (e) => {
    const i = SYSTEMS.findIndex((x) => x.key === sys);
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const dir = document.documentElement.dir === "rtl" ? -step : step;
    pick(SYSTEMS[(i + dir + SYSTEMS.length) % SYSTEMS.length].key);
  };
  return (
    <div style={{ marginBottom: compact ? 8 : 12 }}>
      <div id="size-system-label" style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 6 }}>{label}</div>
      <div role="radiogroup" aria-labelledby="size-system-label" onKeyDown={onKey}
        style={{ display: "flex", gap: 6, overflowX: "auto", padding: "2px 0 4px",
                 scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
        {SYSTEMS.map((s) => {
          const on = s.key === sys;
          return (
            <button key={s.key} role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
              title={s.name} aria-label={s.name} onClick={() => pick(s.key)}
              style={{ flexShrink: 0, minWidth: 48, minHeight: 40, padding: "0 14px", borderRadius: 20,
                       border: `1.5px solid ${on ? C.btn : C.border}`, background: on ? C.btn : C.white,
                       color: on ? C.onBtn : C.ink, fontSize: 13, fontWeight: on ? 700 : 500,
                       cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
              {s.label}
            </button>
          );
        })}
      </div>
      {note && sys !== "INTL" && (
        <div style={{ fontSize: 11, color: C.inkLt, marginTop: 4 }}>{APPROXIMATE_NOTE}</div>
      )}
    </div>
  );
}

export default SizeSystemPicker;
