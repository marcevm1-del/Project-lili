import { useState } from "react";
import { C, Shell, Btn, Note } from "../compliance/ui.js";
import Icon from "../icons/Icon.jsx";
import * as remote from "../backend/remote.js";
import { checkPassword, describe, breachMessage } from "./breachCheck.js";
import { t } from "../i18n/t.js";

// ─────────────────────────────────────────────────────────────────────────────
//  SIGN IN
//
//  Browsing needs none of this. Identity is asked for when it starts to matter —
//  opening a shop, being paid, messaging a seller — and never as the price of
//  looking at a dress.
//
//  Three ways in, deliberately: Google for speed, a magic link for anyone who
//  does not want another password, and email + password for anyone who does not
//  want Google to know what she shops for. In this market that last one is not
//  a fringe preference.
// ─────────────────────────────────────────────────────────────────────────────

const MODES = {
  choose: "choose",
  email:  "email",
  sent:   "sent",
};

export default function AuthScreen({ onBack, onSignedIn, onSkip, reason }) {
  const [mode, setMode] = useState(MODES.choose);
  const [isNew, setIsNew] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [pwNote, setPwNote] = useState(null);
  const [breached, setBreached] = useState(null);

  const fail = (e) => {
    // Supabase messages are accurate but written for developers.
    const m = String((e && e.message) || e);
    if (/Invalid login/i.test(m)) return "That email and password don't match.";
    if (/already registered/i.test(m)) return "There's already an account with this email — try signing in.";
    if (/rate limit|too many/i.test(m)) return "Too many tries just now. Give it a minute.";
    if (/not enabled|disabled/i.test(m)) return "That sign-in method isn't switched on for this app yet.";
    if (/Failed to fetch|network/i.test(m)) return "Couldn't reach lili. Check your connection.";
    return m.slice(0, 140);
  };

  const google = async () => {
    setErr(""); setBusy(true);
    try { await remote.signInWithGoogle(); }
    catch (e) { setErr(fail(e)); }
    finally { setBusy(false); }
  };

  const magic = async () => {
    if (!email.trim()) { setErr("Pop your email in first."); return; }
    setErr(""); setBusy(true);
    try { await remote.sendMagicLink(email.trim()); setMode(MODES.sent); }
    catch (e) { setErr(fail(e)); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    setErr(""); setMsg(""); setBusy(true);
    try {
      if (isNew) {
        const scan = await checkPassword(password);
        if (scan.breached) { setBreached(scan); setBusy(false); return; }
        const r = await remote.signUpWithEmail(email.trim(), password);
        if (r.needsConfirmation) { setMode(MODES.sent); }
        else { onSignedIn && onSignedIn(r.session); }
      } else {
        const session = await remote.signInWithEmail(email.trim(), password);
        onSignedIn && onSignedIn(session);
      }
    } catch (e) { setErr(fail(e)); }
    finally { setBusy(false); }
  };

  const forgot = async () => {
    if (!email.trim()) { setErr("Enter your email and we'll send a reset link."); return; }
    setBusy(true);
    try { await remote.resetPassword(email.trim()); setMsg("Reset link sent — check your email."); }
    catch (e) { setErr(fail(e)); }
    finally { setBusy(false); }
  };

  // ── check your email ─────────────────────────────────────────────────────
  if (mode === MODES.sent) {
    return (
      <Shell title="Check your email" subtitle="راجعي بريدك" onBack={onBack}>
        <div style={{ textAlign: "center", padding: "8px 0 4px", color: C.terraTx }}>
          <Icon name="chat" size={34} stroke={1.3} style={{ margin: "0 auto" }} />
        </div>
        <p style={p}>
          We've sent a link to <b style={{ color: C.ink }}>{email}</b>. Tap it and
          you're in — no password needed.
        </p>
        <Note>
          Nothing there? Check spam, and make sure the address is right. Links
          expire after an hour.
        </Note>
        <Btn onClick={() => setMode(MODES.choose)}>Use a different email</Btn>
      </Shell>
    );
  }

  // ── email form ───────────────────────────────────────────────────────────
  if (mode === MODES.email) {
    return (
      <Shell title={isNew ? "Create your account" : "Welcome back"}
             subtitle={isNew ? "حساب جديد" : "أهلاً بعودتك"}
             onBack={() => setMode(MODES.choose)}>
        <p style={p}>
          {isNew
            ? "Your email and a password. That's all we need."
            : "Sign in and your shop, saves and cart come with you."}
        </p>

        <label style={label} htmlFor="lili-email">{t("email")}</label>
        <input id="lili-email" type="email" inputMode="email" autoComplete="email"
          value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }}
          placeholder="you@example.com" style={field} />

        <label style={label} htmlFor="lili-password">{t("password")}</label>
        <input id="lili-password" type="password"
          autoComplete={isNew ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value); setErr(""); setBreached(null);
            setPwNote(isNew ? describe(e.target.value) : null);
          }}
          onBlur={async () => {
            // On blur rather than on every keystroke: one request instead of
            // twelve, and nobody is told their half-typed password is weak.
            if (!isNew || password.length < 8) return;
            const r = await checkPassword(password);
            setBreached(r.breached ? r : null);
          }}
          placeholder={isNew ? "At least 8 characters" : "Your password"} style={field} />

        {isNew && pwNote && !breached && (
          <div style={{ fontSize: 12, marginTop: -8, marginBottom: 12,
            color: pwNote.level === "weak" || pwNote.level === "short" ? C.terraTx : C.inkLt }}>
            {pwNote.text}
          </div>
        )}

        {breached && (
          <div style={errBox}>
            {breachMessage(breached.count)}
            <div style={{ fontSize: 11, color: C.inkLt, marginTop: 6, lineHeight: 1.5 }}>
              Your password was never sent anywhere — only the first five
              characters of its fingerprint were, which match hundreds of others.
            </div>
          </div>
        )}

        {err && <div style={errBox}>{err}</div>}
        {msg && <div style={{ ...errBox, background: "transparent", color: C.terraTx }}>{msg}</div>}

        <Btn disabled={busy || !email.trim() || !!breached
                       || (isNew ? password.length < 8 : !password)}
             onClick={submit}>
          {busy ? "One moment…" : isNew ? t("create_account") : t("sign_in")}
        </Btn>

        <button onClick={() => { setIsNew(!isNew); setErr(""); }} style={linkBtn}>
          {isNew ? "I already have an account" : "I'm new here — create an account"}
        </button>

        {!isNew && (
          <button onClick={forgot} style={{ ...linkBtn, marginTop: 2 }}>
            Forgotten your password?
          </button>
        )}
      </Shell>
    );
  }

  // ── the choice ───────────────────────────────────────────────────────────
  return (
    <Shell title="Sign in to lili" subtitle="تسجيل الدخول" onBack={onBack}>
      <p style={p}>
        {reason || "You can browse without an account. Signing in is for selling, messaging and getting paid."}
      </p>

      <button onClick={google} disabled={busy} style={googleBtn}>
        <span style={{ display: "inline-flex", width: 18, height: 18, marginRight: 10 }}>
          <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C36.9 40.2 44 35 44 24c0-1.3-.1-2.6-.4-3.9z"/>
          </svg>
        </span>
        Continue with Google
      </button>

      <button onClick={() => setMode(MODES.email)} disabled={busy} style={secondaryBtn}>
        <Icon name="chat" size={17} style={{ marginRight: 10, color: C.ink }} />
        Continue with email
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 14px" }}>
        <div style={{ flex: 1, height: 1, background: C.border }} />
        <span style={{ fontSize: 11, color: C.inkLt }}>or</span>
        <div style={{ flex: 1, height: 1, background: C.border }} />
      </div>

      <label style={label} htmlFor="lili-magic">Email me a link instead</label>
      <input id="lili-magic" type="email" inputMode="email" autoComplete="email"
        value={email} onChange={(e) => { setEmail(e.target.value); setErr(""); }}
        placeholder="you@example.com" style={field} />
      <button onClick={magic} disabled={busy || !email.trim()} style={secondaryBtn}>
        {busy ? "Sending…" : "Send me a link"}
      </button>

      {err && <div style={errBox}>{err}</div>}

      {onSkip && (
        <button onClick={onSkip} style={{ ...linkBtn, marginTop: 4 }}>
          Not now — carry on without an account
        </button>
      )}

      <Note>
        {onSkip
          ? "Carrying on without an account keeps everything on this phone. You'll need one before you can be paid, and before your shop is visible to anyone else. "
          : ""}
        We ask for an email so you can get back into your shop on a new phone.
        Nothing is shared with sellers — they see your shop name, never your
        address.
      </Note>
    </Shell>
  );
}

const p = { fontSize: 13, color: C.inkLt, lineHeight: 1.65, margin: "0 0 18px" };
const label = { fontSize: 11, fontWeight: 700, color: C.terraTx, letterSpacing: 0.5,
                textTransform: "uppercase", display: "block", marginBottom: 7 };
const field = { width: "100%", padding: "12px 16px", borderRadius: 12, fontSize: 16,
                background: C.white, border: `1px solid ${C.border}`, color: C.ink,
                marginBottom: 14, fontFamily: "inherit" };
const baseBtn = { width: "100%", display: "flex", alignItems: "center",
                  justifyContent: "center", borderRadius: 30, padding: "14px 0",
                  fontSize: 15, fontWeight: 700, cursor: "pointer",
                  fontFamily: "inherit", minHeight: 48, marginBottom: 10 };
const googleBtn = { ...baseBtn, background: C.white, color: C.ink,
                    border: `1px solid ${C.border}` };
const secondaryBtn = { ...baseBtn, background: "transparent", color: C.ink,
                       border: `1px solid ${C.border}` };
const linkBtn = { width: "100%", background: "none", border: "none", marginTop: 12,
                  color: C.terraTx, fontSize: 13, fontWeight: 700, cursor: "pointer",
                  fontFamily: "inherit", minHeight: 44 };
const errBox = { background: "#FFF5F0", border: `1px solid ${C.rose}`, borderRadius: 10,
                 padding: "10px 12px", fontSize: 12, color: C.ink, lineHeight: 1.5,
                 marginBottom: 12 };
