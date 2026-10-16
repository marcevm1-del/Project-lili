# Compliance layer

## What this is, and what it is not

**It is not legal compliance.** No code makes an app lawful. What it does is
turn each market's rules into a configuration value instead of an assumption
buried in the UI, so that when a lawyer hands you a number, there is exactly one
place to change it — and so that adding a country is an entry in a file rather
than an archaeology project across 1,900 lines.

Nothing here is legal advice, and I'm not a lawyer. Every market in the registry
ships as `waitlist` on purpose: the app will not open for trade in a country
until someone with a licence to give legal advice says it can.

## The gate

Nothing in the marketplace renders until three things are settled, in order:

```
resolve market → not live?  → "Not open here yet" + what's still missing
              → age gate    → market's own minimum, year of birth only
              → consent     → granular, nothing pre-ticked in your favour
              → marketplace
```

Each decision is written to durable storage with a policy version stamp. Change
`POLICY_VERSION` in `markets.js` and every user is re-prompted on next launch —
which is what a material change to a privacy notice actually requires.

## Files

| File | Does |
|---|---|
| `markets.js` | The registry. Per-country rules, readiness lists, prohibited goods |
| `ComplianceProvider.jsx` | Market resolution, age gate, consent sheet, block list |
| `ReportDialog.jsx` | Report a listing or seller, block a seller, counterfeit path |
| `LegalCenter.jsx` | Consent management, data export, deletion, reports, market rules |
| `audit.js` | Append-only trail of consent, reports, erasure requests |
| `store.js` | Capacitor Preferences on device, localStorage in a browser |
| `ui.js` | Shared primitives, using the marketplace's own tokens |

## What each piece answers

**Geo-gating** — the app refuses to trade where you have no licence. This is the
single most useful thing in here, because trading unlicensed is the failure that
gets a company fined rather than an app rejected.

**Age gate** — year of birth only, checked against the market's own minimum. Not
a document, not a full date. Collecting ID you don't need is itself a privacy
problem; escalate only where a market demands it.

**Consent** — granular, and opt-in where the market requires opt-in. Marketing is
off by default in every market including the opt-out ones. Withdrawal is one tap,
because "as easy to withdraw as to give" is the actual legal standard in the UAE
and the EU.

**Reporting and blocking** — this is the Google Play blocker from the last
checklist, closed. Every listing has a report route, every seller can be blocked,
and blocked sellers vanish from the feed, search, categories and seller list at
once — hiding them in one place only is what makes a block button feel like a lie.

**Counterfeit route** — a separate rights-holder path, because a brand reporting a
fake is a different transaction from a shopper flagging one, and in the UAE it's
the one carrying real legal weight.

**Data rights** — export as JSON, delete with a typed confirmation, and an
explicit note that completed orders survive deletion where tax law requires it.

## Verified, not assumed

`npm run smoke` mounts the real app in jsdom and walks the whole gate: 17 checks
covering market blocking, underage refusal, consent defaults, terms gating,
persistence across relaunch, and audit writes. All passing. Run it before every
release — it catches the class of bug a build cannot.

## Known gaps — read these before launch

1. **Geo-resolution is client-side and therefore advisory.** It reads timezone
   and locale, both one settings toggle from being anything the user wants. The
   smoke test proves the point: jsdom reports `en-US` and the app resolves to the
   United States. Before any transaction is allowed, the same check has to run
   server-side against the request IP. The client version is for rendering.
2. **The audit trail is local.** It proves the flow works and lets a user see
   their own history. It is not a compliance record — one device, user-wipeable.
   Mirror every entry server-side with a server timestamp; that copy is the one a
   regulator would accept.
3. **Reports go nowhere.** They're captured, structured, and stored. There is no
   moderation queue at the other end. An unread report is worse than no report
   button — connect this before launch.
4. **The EU entry is incomplete by design.** DSA notice-and-action needs a
   reasoned decision back to the reporter and an appeal route; trader
   traceability needs identity verification. Both are flagged in the readiness
   list and neither is built.
5. **Account deletion needs a public web page.** Google Play requires deletion to
   be requestable without installing the app. That page is not code in this repo.
6. **Nothing is translated yet.** Arabic appears as labels beside English. The UAE
   expects consumer terms in Arabic — that's a translation job for a human, not a
   string file I should fill in.

## Adding a market

```js
JP: {
  ...base,
  code: "JP", name: "Japan", currency: "JPY",
  privacyRegime: "APPI", cooloffDays: 0,
  prohibited: ["counterfeit or replica goods", ...],
  readiness: ["Specified Commercial Transactions Act disclosures", ...],
}
```

It appears in the picker, the rules screen and the gate automatically. Leave
`status` at `waitlist` until counsel clears it, then flip one word.
