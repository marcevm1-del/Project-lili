import { useEffect, useState } from "react";
import { C, Shell, Btn, Note } from "../compliance/ui.js";
import { LANGUAGES, getLanguage, guessLanguage, isRTL, DEFAULT_LANGUAGE } from "./languages.js";
import * as store from "../compliance/store.js";
import { record } from "../compliance/audit.js";
import Icon from "../icons/Icon.jsx";
import { setDir, alignStart } from "./direction.js";
import { setLang } from "./t.js";
import * as funnel from "../analytics/funnel.js";

const KEY = "lili.language.v1";
const WANTED = "lili.language.requested.v1";

export async function loadLanguage() {
  return (await store.get(KEY)) || guessLanguage();
}

/**
 * Applying a language is more than swapping strings: right-to-left languages
 * mirror the whole layout.
 *
 * v2.9.1. The docstring above used to end "...makes the browser do that work
 * for flex order, text alignment, scrollbars and logical properties", and it
 * was wrong in the way that matters: this app has exactly one logical property
 * in twenty thousand lines and eighty-seven physical left/right ones. The
 * browser mirrored the text and left every margin, inset and arrow where it
 * was, so choosing Arabic produced a layout that was worse than not offering it.
 *
 * `setDir` publishes the change now, so the tree actually re-renders — nothing
 * did before, because this function wrote to the DOM and told no one, and
 * LanguagePicker's own `onChange` was never passed by its parent.
 */
export async function applyLanguage(code) {
  const lang = getLanguage(code);
  await store.set(KEY, lang.code);
  try { document.documentElement.lang = lang.code; } catch { /* no document in a test harness */ }
  setDir(lang.dir);
  setLang(lang.code);
  await record("language.selected", { code: lang.code, dir: lang.dir, status: lang.status });
  funnel.track(funnel.EVENTS.LANGUAGE_SET, { lang: lang.code, dir: lang.dir });
  funnel.setLanguage(lang.code, lang.dir);
  return lang;
}

export default function LanguagePicker({ onBack, onChange }) {
  const [current, setCurrent] = useState(DEFAULT_LANGUAGE);
  const [requested, setRequested] = useState([]);

  useEffect(() => {
    loadLanguage().then(setCurrent);
    store.getJSON(WANTED, []).then(setRequested);
  }, []);

  const choose = async (lang) => {
    if (lang.status === "planned") return askFor(lang);
    setCurrent(lang.code);
    await applyLanguage(lang.code);
    onChange && onChange(lang);
  };

  // A language we haven't built is a request, not a setting. Recording it is
  // how the translation order gets decided by demand rather than by guesswork.
  const askFor = async (lang) => {
    if (requested.includes(lang.code)) return;
    const next = [...requested, lang.code];
    setRequested(next);
    await store.setJSON(WANTED, next);
    await record("language.requested", { code: lang.code });
  };

  const ready = LANGUAGES.filter((l) => l.status !== "planned");
  const planned = LANGUAGES.filter((l) => l.status === "planned");

  return (
    <Shell title="Language" subtitle="اللغة · भाषा · ഭാഷ" onBack={onBack}>
      <p style={p}>
        The UAE speaks dozens of languages and most residents are working in
        their second or third. We'd rather add these properly than badly.
      </p>

      <div style={head}>Available now</div>
      {ready.map((l) => (
        <Row key={l.code} lang={l} selected={current === l.code} onClick={() => choose(l)} />
      ))}

      <div style={head}>Not translated yet</div>
      <p style={{ ...p, fontSize: 12, marginBottom: 12 }}>
        Tap one to tell us you want it. We're ordering the work by what people
        actually ask for — not by which is easiest.
      </p>
      {planned.map((l) => (
        <Row key={l.code} lang={l} requested={requested.includes(l.code)}
             onClick={() => askFor(l)} />
      ))}

      <Note>
        Numbers already work in every script here — type a price in
        ١٢٩٠٠, ১২৯০০, ൧൨൯൦൦ or 12,900 and lili reads all of them the same way.
        Right-to-left languages mirror the whole layout, not just the text.
        Where a language is marked <b>partly translated</b>, the interface,
        search, prices and dates are in it and the longer text is still
        English — we would rather tell you that than machine-translate a
        refund policy and hope.
      </Note>
    </Shell>
  );
}

function Row({ lang, selected, requested, onClick }) {
  const planned = lang.status === "planned";
  const partial = lang.status === "partial";
  return (
    <button onClick={onClick} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 12,
      background: C.white, borderRadius: 14, padding: "12px 16px", marginBottom: 8,
      border: `1.5px solid ${selected ? C.terra : C.border}`,
      textAlign: alignStart(), cursor: "pointer", minHeight: 44,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, color: C.ink, fontWeight: selected ? 700 : 600,
                      direction: lang.dir, textAlign: "start" }}>
          {lang.native}
        </div>
        <div style={{ fontSize: 11, color: C.inkLt, marginTop: 2 }}>
          {lang.name}
          {lang.dir === "rtl" && <span style={{ color: C.terraTx }}> · right-to-left</span>}
          {/* Said on the row she is about to tap, not buried in a note. A
              language offered as finished when it is a quarter finished is the
              same fabricated claim as a review count nobody wrote. */}
          {partial && <span style={{ color: C.goldTx }}> · partly translated</span>}
        </div>
        {lang.note && (
          <div style={{ fontSize: 11, color: C.inkLt, marginTop: 5, lineHeight: 1.5 }}>
            {lang.note}
          </div>
        )}
      </div>
      {selected && <Icon name="check" size={15} stroke={2.2} style={{ color: C.terraTx }} />}
      {planned && (
        <span style={{
          fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", borderRadius: 20,
          padding: "3px 10px",
          background: requested ? C.terra : C.sand,
          color: requested ? C.white : C.inkLt,
          border: `1px solid ${requested ? C.terra : C.border}`,
        }}>
          {requested ? "Requested" : "Request"}
        </span>
      )}
    </button>
  );
}

const p = { fontSize: 13, color: C.inkLt, lineHeight: 1.65, margin: "0 0 18px" };
const head = { fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase",
               color: C.terraTx, fontWeight: 700, margin: "20px 0 10px" };
