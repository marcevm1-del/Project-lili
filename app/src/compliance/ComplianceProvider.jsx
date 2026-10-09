import { useEffect, useState, lazy, Suspense } from "react";
import { ComplianceContext, useCompliance } from "./context.js";
import { Capacitor } from "@capacitor/core";
import { MARKETS, getMarket, listMarkets, DEFAULT_MARKET, POLICY_VERSION } from "./markets.js";
import * as store from "./store.js";
import { record } from "./audit.js";
import { ACCEPT, ACKNOWLEDGE, AGREEMENT_VERSION } from "./agreements.js";
import { parseYear } from "../ux/input.js";
import Icon from "../icons/Icon.jsx";
import { C, Shell, Btn, GhostBtn, Field, Note } from "./ui.js";
import * as remote from "../backend/remote.js";
import * as funnel from "../analytics/funnel.js";
import { shiftEnd, alignStart } from "../i18n/direction.js";
import { APP_VERSION } from "../version.js";
import { t } from "../i18n/t.js";
// The full documents behind the two signup ticks. Lazy: most people never open them.
const PolicyViewer = lazy(() => import("../legal/PolicyViewer.jsx"));
const POLICY_FOR = { "platform-terms": "terms", "privacy-notice": "privacy" };

export { useCompliance };

const K = {
  market:  "lili.market.v1",
  age:     "lili.age.v1",
  consent: "lili.consent.v1",
  blocked: "lili.blocked.v1",
  agreed:  "lili.agreed.v1",
  beta:    "lili.beta.v1",
};

// ── market resolution ──────────────────────────────────────────────────────
// Device locale and timezone are a *hint*, never a control. Both are one
// settings toggle away from being anything the user wants, so the same check
// has to run server-side against the request IP before any transaction is
// allowed. This is here so the UI knows what to render, not to enforce.
function guessMarket() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (/Dubai|Abu_Dhabi|Muscat/.test(tz)) return "AE";
    if (/Riyadh|Jeddah/.test(tz)) return "SA";
    if (/London|Belfast/.test(tz)) return "GB";
    if (/^America\//.test(tz)) return "US";
    if (/^Europe\//.test(tz)) return "EU";
    const region = (navigator.language || "").split("-")[1];
    if (region && MARKETS[region]) return region;
  } catch { /* fall through */ }
  return DEFAULT_MARKET;
}

export function ComplianceProvider({ children }) {
  const [ready, setReady]     = useState(false);
  const [market, setMarket]   = useState(DEFAULT_MARKET);
  const [age, setAge]         = useState(null);
  const [consent, setConsent] = useState(null);
  const [blocked, setBlocked] = useState([]);
  const [agreed, setAgreed]   = useState(null);
  // "Have a look around anyway" — deliberately NOT persisted.
  //
  // v2.8 tried to remember it, on the reasoning that meeting the wall on every
  // cold start is friction in front of the only open door. That was wrong, and
  // smoke.test.mjs said so: "an unlicensed market shows its wall on every
  // launch." The wall is a notice that lili is not licensed here, and carrying
  // someone past a legal notice once and then never showing it again is exactly
  // the shortcut a regulator would ask about. It stays session-only.
  const [override, setOverride] = useState(false);
  // v2.8 — private beta. `betaMember` is a cached answer to a question only the
  // database can answer; the row-level policies refuse a listing from a
  // non-member whatever this says. It exists so the interface can tell a woman
  // she needs an invite BEFORE she photographs six pieces, not after.
  const [betaMember, setBetaMember] = useState(false);
  // A device-only build has no server to publish to and nothing to gate — the
  // "private beta" is a property of the backend, so with no backend configured
  // the sell flow is simply the app working offline, as designed.
  const [backendOn, setBackendOn] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await store.get(K.market);
      setMarket(saved || guessMarket());
      setAge(await store.getJSON(K.age, null));
      const savedConsent = await store.getJSON(K.consent, null);
      setConsent(savedConsent);
      // v2.9: the analytics toggle now switches something on. It had been
      // collected, audited and made withdrawable since v2.7 with no code path
      // reading it — consent for a capability that did not exist.
      funnel.init({ version: APP_VERSION });
      funnel.enable(!!(savedConsent && savedConsent.analytics));
      setBlocked(await store.getJSON(K.blocked, []));
      setAgreed(await store.getJSON(K.agreed, null));
      setBetaMember(await store.getJSON(K.beta, false));
      setReady(true);
      // Re-ask the server in the background: a code redeemed on another device,
      // or revoked since, should not be decided by what this phone remembers.
      try {
        setBackendOn(remote.isConfigured());
        if (remote.isConfigured()) {
          const live = await remote.isBetaMember();
          setBetaMember(live);
          await store.setJSON(K.beta, live);
        }
      } catch { /* offline — the cached answer stands until the next launch */ }
    })();
  }, []);

  const m = getMarket(market);

  /**
   * Redeem an invite code. The database decides; this only caches the answer.
   * Returns the raw { ok, reason } so the screen can say something specific
   * rather than "something went wrong".
   */
  const redeemInvite = async (code) => {
    try {
      const res = await remote.redeemInvite(code);
      if (res && res.ok) {
        setBetaMember(true);
        await store.setJSON(K.beta, true);
        await record("beta.invite.redeemed", { reason: res.reason });
      } else {
        await record("beta.invite.refused", { reason: res && res.reason });
      }
      return res;
    } catch (e) {
      return { ok: false, reason: "offline" };
    }
  };

  const chooseMarket = async (code) => {
    setMarket(code);
    await store.set(K.market, code);
    await record("market.selected", { market: code });
  };

  const confirmAge = async (yearOfBirth) => {
    const yrs = new Date().getFullYear() - Number(yearOfBirth);
    const ok = yrs >= m.minAge && yrs < 120;
    const value = { yearOfBirth: Number(yearOfBirth), passed: ok, minAge: m.minAge,
                    at: new Date().toISOString() };
    setAge(value);
    await store.setJSON(K.age, value);
    await record("age.checked", { passed: ok, minAge: m.minAge, market });
    return ok;
  };

  const acceptTerms = async (ids) => {
    const value = { ids, version: AGREEMENT_VERSION, at: new Date().toISOString() };
    setAgreed(value);
    await store.setJSON(K.agreed, value);
    for (const id of ids) {
      await record("agreement.accepted", { surface: "signup", clauseId: id,
                                           version: AGREEMENT_VERSION });
    }
  };

  const saveConsent = async (choices) => {
    const value = { ...choices, policyVersion: POLICY_VERSION, market,
                    at: new Date().toISOString() };
    setConsent(value);
    await store.setJSON(K.consent, value);
    await record("consent.recorded", value);
    // Switching analytics off does not merely stop collection: funnel.enable
    // erases what was already sent. A withdrawal that leaves the history is not
    // a withdrawal (PDPL, Federal Decree-Law 45 of 2021, art. 16).
    await funnel.enable(!!value.analytics);
  };

  const withdrawConsent = async () => {
    setConsent(null);
    await store.remove(K.consent);
    await record("consent.withdrawn", { market });
    await funnel.enable(false);
  };

  const blockSeller = async (shopId, name) => {
    const next = Array.from(new Set([...blocked, shopId]));
    setBlocked(next);
    await store.setJSON(K.blocked, next);
    await record("seller.blocked", { shopId, name });
  };

  const unblockSeller = async (shopId) => {
    const next = blocked.filter((id) => id !== shopId);
    setBlocked(next);
    await store.setJSON(K.blocked, next);
    await record("seller.unblocked", { shopId });
  };

  const value = {
    ready, market, m, chooseMarket,
    age, confirmAge, consent, saveConsent, withdrawConsent,
    agreed, acceptTerms, agreementVersion: AGREEMENT_VERSION,
    blocked, blockSeller, unblockSeller,
    policyVersion: POLICY_VERSION,
    // Selling and messaging are open when the market is live, or when she holds
    // an invite while it is not. Browsing needs neither.
    betaMember, redeemInvite,
    canSell: m.status === "live" || betaMember || !backendOn,
  };

  if (!ready) return null;   // native splash is still up

  // ── the gate, in order ───────────────────────────────────────────────────
  let gate = null;
  if (m.status !== "live" && !override) {
    gate = <MarketClosed m={m} onChange={chooseMarket} onBrowse={() => setOverride(true)}
                         onRedeem={redeemInvite} invited={betaMember} />;
  } else if (!age?.passed || !agreed || agreed.version !== AGREEMENT_VERSION) {
    // Age and contract acceptance share a screen: a year of birth is a fact,
    // not a consent, so nothing that must stay separate is being bundled.
    // Data consent keeps its own screen — that separation is the one that
    // carries legal weight.
    gate = <TermsGate m={m} onAccept={acceptTerms} onConfirmAge={confirmAge} age={age} />;
  } else if (!consent || consent.policyVersion !== POLICY_VERSION) {
    gate = <ConsentSheet m={m} existing={consent} onSave={saveConsent} />;
  }

  return <ComplianceContext.Provider value={value}>{gate || children}</ComplianceContext.Provider>;
}

// ── screens ────────────────────────────────────────────────────────────────

function MarketClosed({ m, onChange, onBrowse, onRedeem, invited }) {
  const [picking, setPicking] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [result, setResult] = useState(null);

  const submitCode = async () => {
    if (!code.trim() || redeeming) return;
    setRedeeming(true); setResult(null);
    const res = await onRedeem(code);
    setRedeeming(false);
    setResult(res);
    if (res && res.ok) onBrowse();          // she is in — open the app
  };

  // Say which thing went wrong. "Something went wrong" is what you write when
  // you have not decided what you would want to be told.
  const message = {
    welcome: "You're in. Welcome.",
    already_a_member: "You're already on the list — go ahead.",
    unknown: "We don't recognise that code. Check it against the message we sent you.",
    already_used: "That code has already been used. If that wasn't you, tell us and we'll issue another.",
    sign_in_required: "We need to know who you are before a code can be attached to you.",
    needs_real_account: "Sign in with your email or Google first, then use the code. An invite has to attach to an account you can get back into — otherwise a new phone would cost you your shop.",
    empty: "Enter the code from your invitation.",
    offline: "We couldn't reach lili just now. Try again when you have signal.",
  }[result && result.reason] || null;

  return (
    <Shell title="Not open here yet" subtitle="لم نفتح هنا بعد">
      <p style={p}>
        We're not in <b>{m.name}</b> yet — and we'd rather tell you that than let
        you set up a shop we can't look after properly. Here's exactly what we're
        waiting on.
      </p>
      <div style={card}>
        <div style={cardHead}>Still on our list</div>
        {(m.readiness || []).map((r) => (
          <div key={r} style={row}><span style={{ color: C.terraTx }}>◦</span><span>{r}</span></div>
        ))}
      </div>

      {picking ? (
        <div style={{ marginTop: 4 }}>
          {listMarkets().map((x) => (
            <GhostBtn key={x.code} onClick={() => { onChange(x.code); setPicking(false); }}>
              {x.name}{x.status === "live" ? "  ·  open" : "  ·  waitlist"}
            </GhostBtn>
          ))}
        </div>
      ) : (
        <GhostBtn onClick={() => setPicking(true)}>I'm not in {m.name}</GhostBtn>
      )}

      <Btn onClick={onBrowse}>Have a look around anyway</Btn>

      {/* v2.8 — the private beta door.
          The code is checked by the database, not here: lili_redeem_invite()
          writes a membership row, and the row-level policies on shops, items
          and conversations require it. A code compared in JavaScript would be
          a string in a bundle anyone can read, which is not a control at all.
          The note below therefore describes something that is actually true. */}
      {!invited && (showCode ? (
        <div style={{ marginTop: 4 }}>
          <Field value={code} onChange={(v) => setCode(v.toUpperCase())}
                 placeholder="INVITE CODE" maxLength={24} />
          <Btn onClick={submitCode} disabled={redeeming || !code.trim()}>
            {redeeming ? "Checking…" : t("use_my_invite")}
          </Btn>
          {message && (
            <div style={{ ...noteBox,
                          borderColor: result && result.ok ? C.green : C.red,
                          color: C.ink }}>
              {message}
            </div>
          )}
        </div>
      ) : (
        <GhostBtn onClick={() => setShowCode(true)}>{t("i_have_an_invite")}</GhostBtn>
      ))}

      <Note>
        Browsing is open to everyone, today. Opening a shop, listing a piece and
        messaging a seller are invite-only until {m.name} is properly open —
        and that is enforced by the database, not just hidden in the app.
      </Note>
    </Shell>
  );
}

function AgeGate({ m, onConfirm, failed }) {
  const [year, setYear] = useState("");
  const valid = /^\d{4}$/.test(year);
  return (
    <Shell title="Your year of birth" subtitle="سنة الميلاد">
      <p style={p}>
        lili is for adults. {m.name} sets that at <b>{m.minAge}</b>. We keep the
        year only — never the full date, never a document.
      </p>
      <Field value={year} onChange={setYear} placeholder="1996"
             inputMode="numeric" maxLength={4} />
      {failed && (
        <div style={{ ...noteBox, borderColor: C.red, color: C.red }}>
          You need to be {m.minAge} or over to use lili.
        </div>
      )}
      <Btn disabled={!valid} onClick={() => onConfirm(year)}>{t("continue_2")}</Btn>
      <Note>
        A self-declared year is the lightest check that still works. Swap it for
        document or bank verification only where a market demands it — collecting
        ID you don't need is itself a privacy problem.
      </Note>
    </Shell>
  );
}

function TermsGate({ m, onAccept, onConfirmAge, age }) {
  const [ticked, setTicked] = useState({});
  const [open, setOpen] = useState(null);
  const [reading, setReading] = useState(null);
  const [year, setYear] = useState("");
  const needsAge = !age?.passed;
  // Accepts ١٩٩٦ as readily as 1996 — an Arabic keyboard is the default for
  // many users here, and rejecting their own numerals is our bug, not theirs.
  const parsedYear = parseYear(year);
  const yearValid = parsedYear !== null;
  const done = ACCEPT.every((a) => ticked[a.id]) && (!needsAge || yearValid);

  const submit = async () => {
    if (needsAge) {
      const passed = await onConfirmAge(parsedYear);
      if (!passed) return;          // stay on the screen and show the refusal
    }
    onAccept(ACCEPT.map((a) => a.id));
  };

  return (
    <Shell title="Before you start" subtitle="قبل أن نبدأ">
      <p style={p}>
        Your year of birth, two things to agree to, and four we think you should
        know. That's everything — we'd rather you actually read six than scroll
        past twenty.
      </p>

      {needsAge && (
        <>
          {/* The heading was a plain div, so nothing connected it to the
              field: a screen reader announced "1996" — the placeholder — and
              nothing else. The first thing this app asks anybody for should
              not be the one field that does not say what it is. */}
          <label htmlFor="lili-year-of-birth" style={{ ...sectionLabel, display: "block" }}>
            {t("year_of_birth")}
          </label>
          <input value={year} onChange={(e) => setYear(e.target.value)}
            id="lili-year-of-birth" aria-label="Your year of birth"
            placeholder="1996" inputMode="numeric" maxLength={4}
            style={{ width: "100%", padding: "14px 16px", borderRadius: 12,
                     fontSize: 16, background: C.white, border: `1px solid ${C.border}`,
                     color: C.ink, outline: "none", marginBottom: 6,
                     fontFamily: "inherit" }} />
          <div style={{ fontSize: 11, color: C.inkLt, marginBottom: 8, lineHeight: 1.5 }}>
            lili is for grown-ups — {m.minAge} and over here. Just the year, never
            the full date, and we'll never ask you for a document.
          </div>
          {age && !age.passed && (
            <div style={{ fontSize: 12, color: C.red, marginBottom: 12 }}>
              You need to be {m.minAge} or over to use lili.
            </div>
          )}
          <div style={{ height: 12 }} />
        </>
      )}

      {reading && (
        <Suspense fallback={null}>
          <PolicyViewer initial={reading} onBack={() => setReading(null)} />
        </Suspense>
      )}
      {ACCEPT.map((a) => {
        const on = !!ticked[a.id];
        return (
          <div key={a.id}>
          <button onClick={() => setTicked((t) => ({ ...t, [a.id]: !t[a.id] }))}
            style={{ ...acceptRow, borderColor: on ? C.terra : C.border }}>
            <div style={{ ...tickBox, background: on ? C.terra : C.white,
                          borderColor: on ? C.terra : C.border }}>
              {on && <Icon name="check" size={13} stroke={2.4} style={{ color: C.white }} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>
                I agree to {a.title}
              </div>
              <div style={{ fontSize: 11, color: C.terraTx, marginTop: 2 }}>{a.titleAr}</div>
              <div style={{ fontSize: 12, color: C.inkLt, marginTop: 6, lineHeight: 1.55 }}>
                {a.body}
              </div>
            </div>
          </button>
          {POLICY_FOR[a.id] && (
            <button onClick={() => setReading(POLICY_FOR[a.id])}
              style={{ background: "none", border: "none", color: C.terraTx, fontSize: 13, fontWeight: 600,
                       textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer",
                       padding: "4px 0 12px", minHeight: 44 }}>
              Read the full {a.title.replace(/^lili's /, "")}
            </button>
          )}
          </div>
        );
      })}

      <div style={{ ...sectionLabel, marginTop: 20 }}>{t("worth_knowing")}</div>
      <p style={{ fontSize: 12, color: C.inkLt, lineHeight: 1.6, margin: "0 0 12px" }}>
        Nothing to tick. These are things we owe you, not things you're signing
        away. Tap to open any of them.
      </p>

      {ACKNOWLEDGE.map((a) => {
        const expanded = open === a.id;
        return (
          <button key={a.id} onClick={() => setOpen(expanded ? null : a.id)} style={ackRow}>
            <Icon name={a.icon} size={20} style={{ color: C.terraTx, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: C.ink, fontWeight: 600, lineHeight: 1.35 }}>
                {a.title}
              </div>
              <div style={{ fontSize: 12, color: C.inkLt, marginTop: 5, lineHeight: 1.55,
                            maxHeight: expanded ? 400 : 0, overflow: "hidden" }}>
                {a.body}
                {a.bodyAr && (
                  <div style={{ marginTop: 8, direction: "rtl", textAlign: "right" }}>{a.bodyAr}</div>
                )}
              </div>
            </div>
            <span style={{ color: C.inkLt, fontSize: 12 }}>{expanded ? "−" : "+"}</span>
          </button>
        );
      })}

      <Btn disabled={!done} onClick={submit}>
        {done ? t("agree_and_continue")
              : needsAge && !yearValid ? "Add your year of birth"
              : "Tick both to continue"}
      </Btn>
      <Note>
        What we do with your data is the next screen, on its own. Rolling it into
        this tick would make that consent worthless — so we keep them apart.
      </Note>
    </Shell>
  );
}

function ConsentSheet({ m, existing, onSave }) {
  const optIn = m.consent.model === "opt-in";
  const [choices, setChoices] = useState({
    essential: true,                                   // cannot be switched off
    analytics: existing?.analytics ?? !optIn,          // opt-out markets: on
    marketing: existing?.marketing ?? false,           // never on by default
    personalisation: existing?.personalisation ?? !optIn,
  });

  const toggles = [
    { key: "essential", label: "Keep the app working",
      sub: "Staying signed in, your saved pieces, your cart. Without these there's no app.",
      locked: true },
    { key: "analytics", label: "Help us fix what's broken",
      sub: "Which screens get used and where the app falls over. We're not building a profile of you.",
      },
    { key: "personalisation", label: "Show me things I'd actually love",
      sub: "Uses what you save and search so your feed looks like your taste." },
    { key: "marketing", label: "Tell me about new drops",
      sub: "Off unless you want it. One tap to stop, always." },
  ];

  return (
    <Shell title="Your data, your call" subtitle="بياناتك، قرارك">
      {/* v2.11.1 — this said, flatly, "Nothing here is switched on for you.
          Nothing is pre-ticked. Everything below stays off until you decide
          otherwise." It is a first-run sentence on a screen that is not always
          a first run, and it was false in two situations:

            · she has been here before, so `existing` restores what she chose,
              and she arrives to three toggles already on under a paragraph
              swearing nothing is;
            · in an opt-out market the defaults ARE on, by design, and the
              sentence contradicts the code four lines above it.

          A promise about pre-ticking is exactly the promise this app cannot
          afford to get wrong — it is the one a regulator reads. It now says
          which of the three situations she is in. */}
      <p style={p}>
        {existing
          ? "These are the choices you saved last time. Change any of them, or leave them as they are."
          : optIn
          ? "Nothing here is switched on for you. Nothing is pre-ticked. Everything below stays off until you decide otherwise, and you can change your mind any time."
          : "Two of these start on, because that is the default where you are. Switch off whatever you do not want — now, or any time from Privacy & Safety."}
      </p>
      <div style={{ background: C.sand, border: `1px solid ${C.border}`,
                    borderRadius: 12, padding: "12px 14px", fontSize: 12,
                    color: C.inkLt, lineHeight: 1.6, marginBottom: 16 }}>
        This is between you and <b style={{ color: C.ink }}>lili</b>. When you buy
        something, that's between you and the woman selling it — we introduce
        you, and the piece is hers, not ours.{" "}
        {/* v2.9 correction. This paragraph said "we introduce you and hold the
            payment safe". lili holds no money: fees.COLLECTION_LIVE is false,
            there is no escrow, no processor and no trade licence yet, and
            messages/MeetSafely.jsx tells her so in as many words. Two screens
            in one app disagreeing about whether her money is protected is the
            worst kind of copy bug — she would meet a stranger believing there
            was a refund behind her. */}
        <b style={{ color: C.ink }}>lili doesn't hold your money.</b> You pay her
        directly when you meet.
      </div>

      {toggles.map((t) => (
        <button key={t.key} disabled={t.locked}
          onClick={() => setChoices((c) => ({ ...c, [t.key]: !c[t.key] }))}
          style={{ ...toggleRow, opacity: t.locked ? 0.62 : 1,
                   cursor: t.locked ? "default" : "pointer" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>{t.label}</div>
            <div style={{ fontSize: 11, color: C.inkLt, marginTop: 3, lineHeight: 1.45 }}>{t.sub}</div>
          </div>
          <div style={{ ...pill, background: choices[t.key] ? C.terra : C.sand }}>
            {/* v2.9.1: translateX(18px) moved the knob physically right, so
                with the track mirrored the "on" position sat at the reading
                start — every privacy toggle in the app read INVERTED in
                Arabic. Whether a woman believes she turned analytics off is
                not a cosmetic question. */}
            <div style={{ ...knob, transform: choices[t.key] ? shiftEnd(18) : "translateX(0)" }} />
          </div>
        </button>
      ))}

      {/* No terms tick here. Contract acceptance happened on the previous
          screen; bundling it with data consent would invalidate the consent. */}
      <Btn onClick={() => onSave(choices)}>{t("save_choices")}</Btn>
      <Note>
        Saved against version {POLICY_VERSION}. Change your mind whenever —
        Profile → Privacy &amp; Safety.
      </Note>
    </Shell>
  );
}

// ── local styles ───────────────────────────────────────────────────────────
const p = { fontSize: 13, color: C.inkLt, lineHeight: 1.65, margin: "0 0 18px" };
const card = { background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
               padding: "14px 16px", marginBottom: 16 };
const cardHead = { fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase",
                   color: C.terraTx, fontWeight: 700, marginBottom: 10 };
const row = { display: "flex", gap: 10, fontSize: 12, color: C.inkLt,
              lineHeight: 1.5, marginBottom: 7, alignItems: "flex-start" };
const toggleRow = { width: "100%", display: "flex", alignItems: "center", gap: 12,
                    background: C.white, border: `1px solid ${C.border}`,
                    borderRadius: 14, padding: "12px 16px", marginBottom: 10,
                    textAlign: "left" };
const pill = { width: 40, height: 22, borderRadius: 12, padding: 2, flexShrink: 0,
               transition: "background .18s" };
const knob = { width: 18, height: 18, borderRadius: "50%", background: "#fff",
               transition: "transform .18s", boxShadow: "0 1px 3px #0002" };
const checkbox = { width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                   border: `1.5px solid ${C.terra}`, display: "flex",
                   alignItems: "center", justifyContent: "center" };
const acceptRow = { width: "100%", display: "flex", gap: 12, alignItems: "flex-start",
                    background: C.white, border: "1.5px solid", borderRadius: 14,
                    padding: "14px 16px", marginBottom: 10, textAlign: "left",
                    cursor: "pointer" };
const ackRow = { width: "100%", display: "flex", gap: 12, alignItems: "flex-start",
                 background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
                 padding: "12px 14px", marginBottom: 8, textAlign: "left", cursor: "pointer" };
const tickBox = { width: 22, height: 22, borderRadius: 7, flexShrink: 0, marginTop: 1,
                  border: "1.5px solid", display: "flex", alignItems: "center",
                  justifyContent: "center" };
const sectionLabel = { fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase",
                       color: C.terraTx, fontWeight: 700, marginBottom: 8 };
const noteBox = { border: "1px solid", borderRadius: 12, padding: "10px 12px",
                  fontSize: 12, marginBottom: 12 };
