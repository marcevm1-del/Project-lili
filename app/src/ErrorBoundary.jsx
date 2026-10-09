import { Component } from "react";
import { t } from "./i18n/t.js";
import { report } from "./ux/errorReport.js";

// ─────────────────────────────────────────────────────────────────────────────
//  ERROR BOUNDARY
//
//  Without one, a single component throwing anywhere in the tree unmounts the
//  WHOLE app and leaves a blank white screen. No message, no way back, and
//  nothing a user can describe beyond "it stopped working" — which is exactly
//  what happened when HomePage referenced an undestructured prop.
//
//  This catches it, keeps the brand on screen, and offers the two things that
//  actually recover the situation: try again, or go back to the start.
//
//  When a crash reporter is wired up, report() below is the one place to send
//  from — the error and component stack are both already here.
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  peach: "var(--c-peach, #FDEBD8)",
  white: "var(--c-white, #fff)",
  ink: "var(--c-ink, #5C4A3A)",
  inkLt: "var(--c-ink-lt, #756358)",
  terra: "var(--c-accent-btn, #9E6050)",
  onAccent: "var(--c-on-accent, #fff)",
  border: "var(--c-border, #F0DDD0)",
};

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, attempts: 0 };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    this.report(error, info);
  }

  report(error, info) {
    // A copy stays on the phone (the last 20), and a scrubbed one is reported.
    const entry = {
      message: String(error && error.message).slice(0, 500),
      stack: String((error && error.stack) || "").slice(0, 2000),
      componentStack: String((info && info.componentStack) || "").slice(0, 2000),
      at: new Date().toISOString(),
      screen: this.props.name || "app",
    };
    try {
      const key = "lili.crashes.v1";
      const prev = JSON.parse(window.localStorage.getItem(key) || "[]");
      window.localStorage.setItem(key, JSON.stringify([entry, ...prev].slice(0, 20)));
    } catch { /* storage unavailable — the console line below still fires */ }
    // eslint-disable-next-line no-console
    console.error("lili crashed:", entry.message);
    // and now it leaves the phone too, scrubbed (ux/errorReport.js)
    report("crash", error, entry.screen);
  }

  retry = () => {
    this.setState((s) => ({ error: null, info: null, attempts: s.attempts + 1 }));
  };

  restart = () => {
    try { window.location.reload(); } catch { /* no-op */ }
  };

  render() {
    if (!this.state.error) return this.props.children;

    // Twice in a row means retrying isn't going to fix it.
    const stuck = this.state.attempts >= 2;

    return (
      <div className="full-height" style={{
         background: C.peach, display: "flex",
        alignItems: "center", justifyContent: "center", padding: 28,
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif",
      }}>
        <div style={{ maxWidth: 320, textAlign: "center" }}>
          <div style={{ fontFamily: "Georgia,serif", fontWeight: 700, fontSize: 26,
                        color: C.ink, letterSpacing: -0.5 }}>
            Something went wrong
          </div>
          <div style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 14,
                        color: C.terraTx, marginTop: 5 }}>
            حدث خطأ ما
          </div>

          <p style={{ fontSize: 14, color: C.inkLt, lineHeight: 1.65, margin: "20px 0 0" }}>
            {stuck
              ? "That didn't work twice, so it's us and not you. Starting fresh usually clears it."
              : "This is on our side, not yours. Nothing you were doing has been lost."}
          </p>

          <button onClick={stuck ? this.restart : this.retry} style={{
            width: "100%", marginTop: 22, padding: "16px 0", borderRadius: 30,
            border: "none", background: C.terra, color: C.onAccent,
            fontWeight: 700, fontSize: 15, cursor: "pointer", minHeight: 44,
          }}>
            {stuck ? t("start_fresh") : t("try_again")}
          </button>

          {!stuck && (
            <button onClick={this.restart} style={{
              width: "100%", marginTop: 10, padding: "12px 0", borderRadius: 30,
              background: "transparent", border: `1.5px solid ${C.border}`,
              color: C.inkLt, fontSize: 13, cursor: "pointer", minHeight: 44,
            }}>
              Start fresh instead
            </button>
          )}

          <div style={{ fontSize: 11, color: C.inkLt, marginTop: 18, lineHeight: 1.5,
                        opacity: 0.85, wordBreak: "break-word" }}>
            {String(this.state.error.message || "").slice(0, 120)}
          </div>
        </div>
      </div>
    );
  }
}
