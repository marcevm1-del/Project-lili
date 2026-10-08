import { useEffect, useState, lazy, Suspense } from "react";
import { C, Shell, Btn, GhostBtn, Field, Note } from "./ui.js";
import { useCompliance } from "./context.js";
import { record, readLog, exportAll } from "./audit.js";
import { remove as removeKey } from "./store.js";
import { listMarkets } from "./markets.js";
import { SELLER_TYPES } from "./intermediary.js";
import { KYC_TIERS, PAYMENT_POSTURE, HOW_MONEY_WORKS, taxPosition, SHIPPING, disputeRoute,
         ADVERTISING } from "./sellerRules.js";
import { STRIKE_POLICY } from "./listingRules.js";
// Both are moderator-only and both were statically imported, so they shipped
// inside whatever chunk this file landed in — to every shopper's handset,
// whether or not she will ever be a moderator. Loaded on the tap now.
const ModerationQueue = lazy(() => import("./ModerationQueue.jsx"));
const InviteRoster    = lazy(() => import("../invites/InviteRoster.jsx"));
import { listQueue, myReports, STATES as MOD_STATES, queueStats } from "./moderation.js";
import Icon from "../icons/Icon.jsx";
import * as remote from "../backend/remote.js";
import * as repo from "../data/repo.js";
import { shiftEnd, alignStart, chevron, when } from "../i18n/direction.js";

export default function LegalCenter({ onClose }) {
  const [view, setView] = useState("menu");
  const back = () => setView("menu");

  if (view === "consent")  return <ConsentView onBack={back} />;
  if (view === "data")     return <DataView onBack={back} />;
  if (view === "delete")   return <DeleteView onBack={back} />;
  if (view === "activity") return <ActivityView onBack={back} />;
  if (view === "how")      return <HowItWorksView onBack={back} />;
  if (view === "selling")  return <SellingView onBack={back} />;
  if (view === "money")    return <MoneyView onBack={back} />;
  if (view === "disputes") return <DisputesView onBack={back} />;
  if (view === "safety")   return <SafetyView onBack={back} />;
  if (view === "queue")    return <Suspense fallback={null}><ModerationQueue onBack={back} /></Suspense>;
  if (view === "invites")  return <Suspense fallback={null}><InviteRoster onBack={back} /></Suspense>;
  if (view === "rules")    return <RulesView onBack={back} />;
  if (view === "rights")   return <RightsHolderView onBack={back} />;
  return <Menu onPick={setView} onClose={onClose} />;
}

function Menu({ onPick, onClose }) {
  const { m, policyVersion } = useCompliance();
  // v2.11 — the same thirteen rows, in four groups.
  //
  // `npm run ux` has flagged this menu since it was written: "Group them —
  // legal, safety, and your data are three different errands." It was right,
  // and the profile menu had the identical problem. A flat list of thirteen
  // makes a woman read all thirteen to find the one she came for; four
  // labelled runs make her read one label and then four rows.
  //
  // Nothing is removed or renamed. The moderator rows stay visible to
  // everyone, for the reason they always have: a menu that changes shape by
  // role is a menu that leaks roles, and neither screen can do anything
  // without the claim.
  const groups = [
    ["Your data", [
      ["consent",  "Data choices",        "What you've agreed to, and undo it"],
      ["data",     "Get a copy of my data", "Everything held about you"],
      ["delete",   "Delete my account",   "Permanent, and we mean it"],
    ]],
    ["How lili works", [
      ["how",      "How lili works",      "Who you're buying from, and who owes you what"],
      ["money",    "Payments, tax & delivery", "Who holds the money and who ships"],
      ["selling",  "Verification & payouts", "What we ask for, and when"],
    ]],
    ["If something is wrong", [
      ["activity", "My reports",          "Reports you've sent and their state"],
      ["disputes", "If something goes wrong", "How a dispute is handled"],
      ["safety",   "Safety & moderation",  "How listings and sellers are policed"],
      ["rights",   "Brand owner? Report a fake", "Rights-holder takedown route"],
    ]],
    ["Rules and internal", [
      ["rules",    "Selling rules here",  `What can and can't be listed in ${m.name}`],
      ["queue",    "Moderation queue",     "Internal — reports waiting on a decision"],
      ["invites",  "Beta roster",          "Internal — invitations, and who actually listed"],
    ]],
  ];
  return (
    <Shell title="Privacy & Safety" subtitle="الخصوصية والأمان" onBack={onClose}>
      {groups.map(([title, rows]) => (
        <div key={title} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
                        textTransform: "uppercase", color: C.inkLt,
                        margin: "8px 4px 8px" }}>{title}</div>
          {rows.map(([key, label, sub]) => (
            <button key={key} onClick={() => onPick(key)} style={rowBtn}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 11, color: C.inkLt, marginTop: 2 }}>{sub}</div>
              </div>
              <span style={{ color: C.inkLt }}>›</span>
            </button>
          ))}
        </div>
      ))}
      <Note>
        Operating in {m.name} under {m.privacyRegime || "local law"}. Policy
        version {policyVersion}.
      </Note>
    </Shell>
  );
}

function ConsentView({ onBack }) {
  const { consent, saveConsent, withdrawConsent, m } = useCompliance();
  const [c, setC] = useState(consent || {});
  const rows = [
    ["analytics", "Help us fix what's broken"],
    ["personalisation", "Show me pieces I'd like"],
    ["marketing", "Email and push about new drops"],
  ];
  return (
    <Shell title="Data choices" subtitle="خياراتك" onBack={onBack}>
      <p style={p}>
        Turning something off stops it from that moment. It does not erase what
        was already collected — use <b>Delete my account</b> for that.
      </p>
      {rows.map(([k, label]) => (
        <button key={k} onClick={() => setC((x) => ({ ...x, [k]: !x[k] }))} style={rowBtn}>
          <span style={{ flex: 1, fontSize: 14, color: C.ink }}>{label}</span>
          <div style={{ width: 40, height: 22, borderRadius: 12, padding: 2,
                        background: c[k] ? C.terra : C.sand }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff",
                          transform: c[k] ? shiftEnd(18) : "translateX(0)",
                          transition: "transform .18s" }} />
          </div>
        </button>
      ))}
      <Btn onClick={() => { saveConsent({ ...c, essential: true }); onBack(); }}>
        Save changes
      </Btn>
      <Btn tone="ghost" onClick={() => { withdrawConsent(); onBack(); }}>
        Withdraw all consent
      </Btn>
      <Note>
        {m.consent.model === "opt-in"
          ? "Withdrawing is as easy as giving — that's the rule here, and it's why this is one tap."
          : "You can opt out of sale or sharing of your data at any time."}
      </Note>
    </Shell>
  );
}

/**
 * A copy of her data — all of it, not the five keys on this phone.
 *
 * v2.9.1. `exportAll()` returned lili.consent.v1, lili.age.v1, lili.market.v1,
 * lili.blocked.v1 and the local audit log. It omitted her shop, her listings,
 * her messages, her offers, her saves, her cart, her follows and every
 * analytics event — everything that is actually held about her. The screen's
 * own footnote said this had to be produced server-side "once accounts exist",
 * rendered to the user as a note rather than tracked as work.
 *
 * `lili_export_me` produces the server half. The device half is still included,
 * because some of it — her consent record, her block list — genuinely lives
 * only here.
 */
function DataView({ onBack }) {
  const [payload, setPayload] = useState(null);
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    (async () => {
      const onDevice = await exportAll();
      let fromServer = null;
      if (remote.isConfigured()) {
        try { fromServer = await remote.exportMe(); }
        catch (e) { setProblem((e && e.message) || "We couldn't reach lili for the server half."); }
      }
      setPayload({
        note: fromServer
          ? "Two halves: what lili holds about your account, and what is stored only on this phone."
          : "This device is not connected to lili, so this is the phone's half only.",
        from_lili: fromServer,
        on_this_device: onDevice,
      });
    })();
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      await record("data.exported", { via: "clipboard" });
    } catch { setCopied(false); }
  };

  const counts = payload && payload.from_lili
    ? Object.entries(payload.from_lili)
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => `${v.length} ${k.replace(/_/g, " ")}`)
    : [];

  return (
    <Shell title="Your data" subtitle="نسخة من بياناتك" onBack={onBack}>
      <p style={p}>
        Everything lili holds about you, from the database and from this phone.
        UAE law gives you a right to this in a portable format — here it is as
        JSON.
      </p>
      {counts.length > 0 && (
        <div style={{ ...warnBox, background: C.sand, borderColor: C.border }}>
          {counts.join(" · ")}
        </div>
      )}
      {problem && <div style={warnBox} role="alert">{problem}</div>}
      <pre style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 12,
                    padding: 14, fontSize: 11, color: C.inkLt, overflowX: "auto",
                    maxHeight: 280, lineHeight: 1.5, userSelect: "text" }}>
        {payload ? JSON.stringify(payload, null, 2) : "Gathering…"}
      </pre>
      <Btn onClick={copy}>{copied ? "Copied" : "Copy as JSON"}</Btn>
      <Note>
        Produced live, from the database, when you asked. Under the UAE PDPL
        (Federal Decree-Law 45 of 2021) a request must be answered within the
        statutory window; answering it here and now is the shortest version of
        that.
      </Note>
    </Shell>
  );
}

function DeleteView({ onBack }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [problem, setProblem] = useState(null);
  const armed = typed.trim().toUpperCase() === "DELETE";
  const remoteOn = remote.isConfigured();

  if (receipt) {
    const k = receipt.kept || {}, r = receipt.redacted || {}, e = receipt.erased || {};
    return (
      <Shell title="Your account is gone" subtitle="تم حذف حسابك" onBack={onBack}>
        <p style={p}>
          Deleted: your account, your shop{e.shops ? "" : ""}, {e.listings || 0} listing
          {e.listings === 1 ? "" : "s"}, everything you saved and followed, your
          basket, your notifications and {e.analytics_events || 0} analytics
          event{e.analytics_events === 1 ? "" : "s"}.
        </p>
        {r.messages > 0 && (
          <div style={warnBox}>
            <b>{r.messages} message{r.messages === 1 ? "" : "s"} were changed, not removed.</b>
            <div style={{ marginTop: 5 }}>{r.why}</div>
          </div>
        )}
        {k.moderation_cases > 0 && (
          <div style={warnBox}>
            <b>{k.moderation_cases} moderation record{k.moderation_cases === 1 ? " is" : "s are"} kept.</b>
            <div style={{ marginTop: 5 }}>{k.why}</div>
            <div style={{ marginTop: 5 }}>{k.basis}</div>
            <div style={{ marginTop: 5 }}>{k.how_to_object}</div>
          </div>
        )}
        <p style={p}>
          You are signed out. Close the app when you're ready.
        </p>
        <Btn onClick={onBack}>Back</Btn>
      </Shell>
    );
  }

  return (
    <Shell title="Delete my account" subtitle="حذف الحساب" onBack={onBack}>
      <div style={warnBox}>
        This deletes your account, your shop, your listings, your saved pieces,
        your basket, your offers and everything we have measured about how you
        use the app. It cannot be undone.
      </div>
      <p style={p}>
        Two things are not deleted, and you'll be shown exactly how many of each:
        the messages you sent are <b>changed rather than removed</b>, because a
        conversation belongs to both people in it; and any moderation record is
        kept, because it is evidence in someone's complaint.
      </p>
      {!remoteOn && (
        <div style={warnBox}>
          This device isn't connected to lili, so there is no account to delete —
          only what is stored on the phone. Deleting will clear this device.
        </div>
      )}
      <p style={p}>Type <b>DELETE</b> to confirm.</p>
      <Field value={typed} onChange={setTyped} placeholder="DELETE" />
      {problem && <div style={warnBox} role="alert">{problem}</div>}
      <Btn disabled={!armed || busy} onClick={async () => {
        setBusy(true); setProblem(null);
        await record("account.deletion_requested", { confirmed: true });
        try {
          let result = null;
          if (remoteOn) result = await remote.eraseMe();
          // The device, always — including the catalogue cache, the draft
          // listing and her saves. `repo.reset()` existed and was never called.
          await repo.reset();
          for (const key of ["lili.consent.v1", "lili.age.v1", "lili.blocked.v1",
                             "lili.beta.v1", "lili.taste.v1", "lili.events.q.v1",
                             "lili.events.sid.v1", "lili.audit.v1"]) {
            await removeKey(key);
          }
          setReceipt(result || { erased: {}, redacted: {}, kept: {} });
        } catch (err) {
          setProblem((err && err.message)
            ? `Nothing was deleted: ${err.message}`
            : "Nothing was deleted — we couldn't reach lili. Your account is untouched. Try again in a moment.");
        }
        setBusy(false);
      }}>
        {busy ? "Deleting…" : "Delete my account permanently"}
      </Btn>
      <Btn tone="ghost" onClick={onBack}>Keep my account</Btn>
      <Note>
        Google Play also requires a way to request this <b>without installing the
        app</b> — a public web page. That page still has to exist before you
        publish.
      </Note>
    </Shell>
  );
}

function ActivityView({ onBack }) {
  const [cases, setCases] = useState([]);
  const [wide, setWide] = useState(false);

  // v2.9.1. This called `listQueue()` with no filter. For a moderator account
  // `serverQueue` is true and listQueue returns EVERY case in the marketplace —
  // other people's reports, other people's report text — rendered under a
  // heading that says "My reports".
  //
  // A moderator has a queue, and it is a different screen with a different
  // name. This one is hers.
  useEffect(() => {
    (async () => {
      const mine = await myReports().catch(() => []);
      setCases(mine || []);
      // If she also moderates, say where the rest of them are rather than
      // leaving her wondering why the queue she just saw is not here.
      try { setWide(remote.isConfigured() && await remote.isModerator()); } catch { setWide(false); }
    })();
  }, []);

  const reports = cases;
  return (
    <Shell title="My reports" subtitle="بلاغاتي" onBack={onBack}>
      {reports.length === 0 && (
        <p style={p}>You haven't reported anything. Nothing to see is a good sign.</p>
      )}
      {reports.map((r) => (
        <div key={r.id} style={{ background: C.white, border: `1px solid ${C.border}`,
                                 borderRadius: 12, padding: "12px 16px", marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>{r.title}</div>
          <div style={{ fontSize: 11, color: C.inkLt, marginTop: 3 }}>
            {(r.reasons || []).join(", ")} · {new Date(r.createdAt).toLocaleDateString()}
          </div>
          <div style={{ fontSize: 11, color: C.terraTx, marginTop: 6 }}>
            ● {MOD_STATES[r.state] ? MOD_STATES[r.state].label : r.state}
          </div>
          {r.decision && (
            <div style={{ fontSize: 12, color: C.inkLt, marginTop: 8, lineHeight: 1.6,
                          paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
              {r.decision.statementToReporter}
            </div>
          )}
        </div>
      ))}
      {wide && (
        <Note>
          You moderate, so there are other people's cases too. They are in the
          moderation queue, not here — this screen is yours.
        </Note>
      )}
      <Note>
        Every report gets an outcome and the reason for it — required under the
        EU DSA, and the right way to run a marketplace anywhere.
      </Note>
    </Shell>
  );
}

function HowItWorksView({ onBack }) {
  const { m } = useCompliance();
  const rows = [
    // v2.10 — the eighth claim, and the first one found by the register rather
    // than by accident. This said the seller "packs and ships it, and handles
    // the return". There is no shipping, no label, no carrier, no returns
    // window: SHIPPING.live is false and has been all along. The row was
    // written from the plan and never checked against it.
    ["The seller", SHIPPING.live
      ? "Owns the item, sets the price, writes the listing, packs and ships it, and handles the return. The sale contract is with them."
      : "Owns the item, sets the price, writes the listing, and hands it to you herself. The sale contract is with her — lili is not a party to it."],
    // v2.9: both of these described a payment flow that does not exist. See
    // the note above HOW_MONEY_WORKS in sellerRules.js.
    ["lili", HOW_MONEY_WORKS.liliRole],
    ["If something's wrong", HOW_MONEY_WORKS.ifWrong],
  ];
  return (
    <Shell title="How lili works" subtitle="كيف تعمل lili" onBack={onBack}>
      <p style={p}>
        lili is a marketplace, not a shop. Everything here belongs to the person
        selling it. That changes who owes you what, so it's worth two minutes.
      </p>
      {rows.map(([who, what]) => (
        <div key={who} style={{ background: C.white, border: `1px solid ${C.border}`,
                                borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
          <div style={{ fontFamily: "Georgia,serif", fontWeight: 700, fontSize: 15,
                        color: C.terraTx, marginBottom: 5 }}>{who}</div>
          <div style={{ fontSize: 13, color: C.inkLt, lineHeight: 1.6 }}>{what}</div>
        </div>
      ))}

      <div style={sectionHead}>Private vs business sellers</div>
      {Object.values(SELLER_TYPES).map((t) => (
        <div key={t.key} style={ruleRow}>
          <span style={{ color: t.consumerRightsApply ? C.terraTx : C.inkLt }}>◦</span>
          <span><b>{t.badge}</b> — {t.note}</span>
        </div>
      ))}

      {m.disputeBody && (
        <>
          <div style={sectionHead}>If we can't resolve it</div>
          <div style={{ ...ruleRow, color: C.inkLt }}>
            You can take a dispute to {m.disputeBody}. Using lili's own process
            first doesn't take that right away.
          </div>
        </>
      )}
      <Note>
        Say this plainly and often. A marketplace that lets buyers believe it is
        the seller can be treated as the seller — which is the whole exposure
        this page exists to avoid.
      </Note>
    </Shell>
  );
}

function SellingView({ onBack }) {
  return (
    <Shell title="Verification & payouts" subtitle="التحقق والدفعات" onBack={onBack}>
      <p style={p}>
        We ask for as little as the law allows, and we ask for it when you reach
        the point that needs it — not on day one.
      </p>
      {Object.values(KYC_TIERS).filter(t => t.tier > 0).map((t) => (
        <div key={t.tier} style={cardBox}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontFamily: "Georgia,serif", fontWeight: 700, fontSize: 15, color: C.terraTx }}>
              {t.name}
            </div>
            <div style={{ fontSize: 11, color: C.inkLt }}>Tier {t.tier}</div>
          </div>
          {t.trigger && <div style={{ fontSize: 11, color: C.inkLt, marginTop: 3 }}>
            Triggered by: {t.trigger}</div>}
          <div style={{ ...sectionHead, margin: "10px 0 6px" }}>We'll ask for</div>
          {t.needs.map(n => <div key={n} style={ruleRow}><span style={{color:C.terraTx}}>◦</span><span>{n}</span></div>)}
          {t.note && <div style={{ fontSize: 11, color: C.inkLt, marginTop: 8, lineHeight: 1.55,
                                    fontStyle: "italic" }}>{t.note}</div>}
        </div>
      ))}
      <Note>
        Tiers escalate with what you actually do, not what you declare. Selling
        at volume moves you up whether or not you called yourself a business.
      </Note>
    </Shell>
  );
}

function MoneyView({ onBack }) {
  const { m } = useCompliance();
  const tax = taxPosition(m.code);
  return (
    <Shell title="Payments, tax & delivery" subtitle="الدفع والضريبة والتوصيل" onBack={onBack}>
      <div style={sectionHead}>Who holds your money</div>
      <p style={p}>
        <b style={{ color: C.ink }}>{HOW_MONEY_WORKS.holder}.</b>{" "}
        {HOW_MONEY_WORKS.short}
      </p>
      {HOW_MONEY_WORKS.live ? (
        PAYMENT_POSTURE.flow.map((f, i) => (
          <div key={f} style={ruleRow}>
            <span style={{ color: C.terraTx, fontWeight: 700 }}>{i + 1}</span><span>{f}</span>
          </div>
        ))
      ) : (
        // The escrow flow is the design, and it is written down in
        // PAYMENT_POSTURE. Printing its four steps here while none of them
        // happens is how the rest of this screen came to promise a refund
        // nobody could issue. It is shown as a plan, marked as one.
        <>
          <div style={ruleRow}>
            <span style={{ color: C.terraTx }}>◦</span>
            <span>You agree the price in lili, then meet and pay her directly.</span>
          </div>
          <div style={ruleRow}>
            <span style={{ color: C.terraTx }}>◦</span>
            <span>lili's commission is the seller's to pay, not yours — and with
                  no payment rail there is nothing to deduct it from, so it is
                  not being collected yet either. The schedule she'll be charged
                  under is shown to her before she lists.</span>
          </div>
          <div style={{ ...ruleRow, alignItems: "flex-start" }}>
            <span style={{ color: C.terraTx }}>◦</span>
            <span><b>Planned, not live:</b> a licensed processor holding the payment
                  until the piece reaches you. It needs a trade licence and a
                  Central Bank–regulated processor first. This page changes the
                  day it does.</span>
          </div>
        </>
      )}

      <div style={sectionHead}>Tax</div>
      {[["VAT on our commission", tax.commissionVAT],
        ["Registration threshold", tax.registrationThreshold],
        ["Tax on the seller's sale", tax.deemedSupplier],
        ["Seller earnings reporting", tax.sellerReporting]].map(([k, v]) => (
        <div key={k} style={ruleRow}>
          <span style={{ color: C.terraTx }}>◦</span><span><b>{k}:</b> {v}</span>
        </div>
      ))}

      <div style={sectionHead}>Delivery</div>
      <p style={{ ...p, marginBottom: 10 }}>{HOW_MONEY_WORKS.delivery}</p>
      {SHIPPING.live && SHIPPING.rules.map(r => (
        <div key={r} style={ruleRow}><span style={{color:C.terraTx}}>◦</span><span>{r}</span></div>
      ))}
      <Note>{SHIPPING.crossBorder.reason}</Note>
    </Shell>
  );
}

function DisputesView({ onBack }) {
  const { m } = useCompliance();
  const route = disputeRoute(m.code);
  return (
    <Shell title="If something goes wrong" subtitle="حل النزاعات" onBack={onBack}>
      {route.stages.map((st, i) => (
        <div key={st.key} style={cardBox}>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
            <span style={{ fontFamily: "Georgia,serif", fontSize: 20, color: C.terraTx,
                           fontWeight: 700 }}>{i + 1}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{st.label}</div>
              <div style={{ fontSize: 12, color: C.inkLt, marginTop: 3, lineHeight: 1.55 }}>
                {st.detail}
              </div>
            </div>
            {st.window !== "—" && (
              <span style={{ fontSize: 11, color: C.inkLt, whiteSpace: "nowrap" }}>{st.window}</span>
            )}
          </div>
        </div>
      ))}
      <div style={ruleRow}><span style={{color:C.terraTx}}>◦</span><span>{route.holdFunds}</span></div>
      <div style={ruleRow}><span style={{color:C.terraTx}}>◦</span><span>{route.cooloff}</span></div>
      <div style={{ ...cardBox, borderColor: C.terra }}>
        <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.6 }}>{route.statutoryNote}</div>
      </div>
      <Note>
        A platform process that behaves like the only route is itself a consumer
        law problem. Ours never replaces the statutory one.
      </Note>
    </Shell>
  );
}

function SafetyView({ onBack }) {
  return (
    <Shell title="Safety & moderation" subtitle="الأمان والرقابة" onBack={onBack}>
      <div style={sectionHead}>Before a listing goes live</div>
      <p style={{ ...p, marginBottom: 12 }}>
        Every listing is screened as it's written. Prohibited items can't be
        published at all. Anything that looks like a counterfeit goes to a person
        before it reaches buyers.
      </p>

      <div style={sectionHead}>Repeat offenders</div>
      <div style={{ fontSize: 11, color: C.inkLt, marginBottom: 8 }}>
        {STRIKE_POLICY.window}
      </div>
      {STRIKE_POLICY.thresholds.map(t => (
        <div key={t.strikes} style={ruleRow}>
          <span style={{ color: C.terraTx, fontWeight: 700 }}>{t.strikes}</span>
          <span>{t.action}</span>
        </div>
      ))}
      <div style={{ ...cardBox, marginTop: 12 }}>
        <div style={{ fontSize: 12, color: C.inkLt, lineHeight: 1.6 }}>{STRIKE_POLICY.counterNotice}</div>
      </div>

      <div style={sectionHead}>Advertising</div>
      {ADVERTISING.rules.map(r => (
        <div key={r} style={ruleRow}><span style={{color:C.terraTx}}>◦</span><span>{r}</span></div>
      ))}
      <Note>{ADVERTISING.influencers.note}</Note>
    </Shell>
  );
}

function RulesView({ onBack }) {
  const { m, chooseMarket } = useCompliance();
  const [switching, setSwitching] = useState(false);
  return (
    <Shell title={`Selling in ${m.name}`} subtitle={m.nameLocal || ""} onBack={onBack}>
      <div style={sectionHead}>Can't be listed</div>
      {(m.prohibited || ["Rules for this market are still being mapped."]).map((x) => (
        <div key={x} style={ruleRow}><Icon name="close" size={12} stroke={2.2} style={{ color: C.red, marginTop: 3 }} /><span>{x}</span></div>
      ))}

      {m.imageryGuidance && (
        <>
          <div style={sectionHead}>Photos</div>
          <div style={{ ...ruleRow, color: C.inkLt }}>{m.imageryGuidance}</div>
        </>
      )}

      <div style={sectionHead}>The commercial bits</div>
      {m.vatRate != null && (
        <div style={ruleRow}><span style={{ color: C.terraTx }}>◦</span>
          <span>VAT {(m.vatRate * 100).toFixed(0)}%
            {m.vatThreshold ? `, once turnover passes ${m.vatThreshold.toLocaleString()} ${m.currency}` : ""}</span>
        </div>
      )}
      {m.cooloffDays > 0 && (
        <div style={ruleRow}><span style={{ color: C.terraTx }}>◦</span>
          <span>{m.cooloffDays}-day right to return on professional-seller sales</span></div>
      )}
      {m.paymentNote && (
        <div style={ruleRow}><span style={{ color: C.terraTx }}>◦</span><span>{m.paymentNote}</span></div>
      )}
      {m.disputeBody && (
        <div style={ruleRow}><span style={{ color: C.terraTx }}>◦</span>
          <span>Disputes: {m.disputeBody}</span></div>
      )}

      {switching ? (
        <div style={{ marginTop: 18 }}>
          {listMarkets().map((x) => (
            <GhostBtn key={x.code} onClick={() => { chooseMarket(x.code); setSwitching(false); }}>
              {x.name}
            </GhostBtn>
          ))}
        </div>
      ) : (
        <Btn tone="ghost" onClick={() => setSwitching(true)}>Change market</Btn>
      )}
      <Note>
        Written from the market registry in the code, not hardcoded into these
        screens. Add a market there and it appears here with its own rules.
      </Note>
    </Shell>
  );
}

function RightsHolderView({ onBack }) {
  const { m } = useCompliance();
  const [brand, setBrand] = useState("");
  const [contact, setContact] = useState("");
  const [detail, setDetail] = useState("");
  const [sent, setSent] = useState(false);
  const ok = brand.trim() && contact.trim() && detail.trim();

  if (sent) {
    return (
      <Shell title="Notice received" subtitle="تم الاستلام" onBack={onBack}>
        <p style={p}>
          Logged. Rights-holder notices are handled ahead of general reports.
        </p>
        <Btn onClick={onBack}>Back</Btn>
      </Shell>
    );
  }

  return (
    <Shell title="Report a counterfeit" subtitle="بلاغ تقليد" onBack={onBack}>
      <p style={p}>
        For brands and their representatives. Counterfeit trading is treated
        seriously in {m.name} — {m.ipRegime ? m.ipRegime + " applies." : ""} Give
        us enough to act on and we will act fast.
      </p>
      <div style={fieldLabel}>Brand you represent</div>
      <Field value={brand} onChange={setBrand} placeholder="Brand name" />
      <div style={fieldLabel}>Your contact — email or phone</div>
      <Field value={contact} onChange={setContact} placeholder="legal@brand.com" />
      <div style={fieldLabel}>Listings and why they infringe</div>
      <Field multiline value={detail} onChange={setDetail}
             placeholder="Item names, seller handles, and what identifies them as fake" />
      <Btn disabled={!ok} onClick={async () => {
        await record("ip.takedown_notice", { brand, contact, detail: detail.slice(0, 4000), market: m.code });
        setSent(true);
      }}>Submit notice</Btn>
      <Note>
        A real takedown route needs a named responsible person, a
        counter-notice path for the seller, and a repeat-infringer policy that
        actually removes sellers. Those are policy decisions, not code — write
        them before you launch.
      </Note>
    </Shell>
  );
}

const p = { fontSize: 13, color: C.inkLt, lineHeight: 1.65, margin: "0 0 18px" };
const rowBtn = { width: "100%", display: "flex", alignItems: "center", gap: 12,
                 background: C.white, border: `1px solid ${C.border}`, borderRadius: 14,
                 padding: "14px 16px", marginBottom: 10, textAlign: "left", cursor: "pointer" };
const sectionHead = { fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase",
                      color: C.terraTx, fontWeight: 700, margin: "18px 0 10px" };
const ruleRow = { display: "flex", gap: 10, fontSize: 13, color: C.ink,
                  lineHeight: 1.55, marginBottom: 8, alignItems: "flex-start" };
const cardBox = { background: C.white, border: `1px solid ${C.border}`,
                  borderRadius: 14, padding: "14px 16px", marginBottom: 10 };
const warnBox = { background: C.white, border: `1.5px solid ${C.red}`, borderRadius: 12,
                  padding: "12px 16px", fontSize: 13, color: C.ink,
                  lineHeight: 1.6, marginBottom: 16 };
const fieldLabel = { fontSize: 11, color: C.terraTx, fontWeight: 700, letterSpacing: 0.5,
                     textTransform: "uppercase", marginBottom: 7 };
