// Mounts the real app in jsdom and walks the compliance gate end to end.
// Catches the class of bug a build cannot: undefined components, bad hooks,
// state that never advances.
import { JSDOM } from "jsdom";

import { marketSource } from "./market-source.mjs";
const dom = new JSDOM("<!doctype html><html><body><div id=root></div></body></html>", {
  url: "https://localhost/", pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.getComputedStyle = dom.window.getComputedStyle;
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");

const { ComplianceProvider } = await import("./src/compliance/ComplianceProvider.jsx");
const Marketplace = (await import("./src/Marketplace.jsx")).default;

const root = createRoot(document.getElementById("root"));
const text = () => document.body.textContent || "";
const buttons = () => [...document.querySelectorAll("button")];
const findBtn = (re) => buttons().find((b) => re.test(b.textContent || ""));
const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 40)); }); };

const { ACCEPT: _ACC } = await import("./src/compliance/agreements.js");
const ACCEPT_COUNT = _ACC.length;
const { readFileSync: _rfs } = await import("node:fs");
const readFileSyncSafe = (p) => { try { return _rfs(p, "utf8"); } catch { return ""; } };
let pass = 0, fail = 0;
const check = (label, ok, extra = "") => {
  if (ok) { pass++; console.log("  ✓", label); }
  else { fail++; console.log("  ✗", label, extra); }
};

console.log("\nMounting app…");
await act(async () => {
  root.render(React.createElement(ComplianceProvider, null, React.createElement(Marketplace)));
});
await settle();

console.log("\n1. Market gate");
check("blocks an uncleared market", /Not open here yet/.test(text()));
// jsdom reports en-US, so resolution lands on the US entry — which is the
// point: locale is a guess, and the server must be the authority.
check("names the resolved market",
  /United Arab Emirates|United States|European Union|United Kingdom|Saudi Arabia/.test(text()));
// Asserts the readiness list itself renders, not the intro paragraph — the
// previous version matched wording in the intro and would have passed with an
// empty list.
check("shows the card of outstanding requirements", /Still on our list/.test(text()));
check("lists real market-specific requirements",
  /marketplace facilitator|INFORM Act|e-commerce activity|trade licence|Maroof|DAC7|Online Safety/i.test(text()));

const browse = findBtn(/look around anyway/i);
check("offers a browse-anyway route", !!browse);
await act(async () => { browse.click(); });
await settle();

console.log("\n2. Age + terms (one screen)");
check("asks for year of birth", /Year of birth/i.test(text()));
check("states the market's minimum age", /18/.test(text()));
check("age and contract share a screen, cutting a gate",
  /Year of birth/i.test(text()) && /Terms of Use/.test(text()));

const input = document.querySelector("input");
check("has a year field", !!input);

// underage → must be refused
const setVal = (el, v) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
  setter.call(el, v);
  el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
};
for (const re of [/I agree to lili's Terms of Use/, /I agree to Privacy Notice/]) {
  const b = findBtn(re);
  if (b) { await act(async () => { b.click(); }); await settle(); }
}
await act(async () => { setVal(input, String(new Date().getFullYear() - 12)); });
await settle();
await act(async () => { findBtn(/Agree and continue/).click(); });
await settle();
check("refuses an underage year", /need to be 18/i.test(text()));
check("stays on the screen rather than dumping the user out",
  /Year of birth/i.test(text()));

await act(async () => { setVal(document.querySelector("input"), "1996"); });
await settle();
await act(async () => { findBtn(/Agree and continue/).click(); });
await settle();

console.log("\n3. Signup agreement");
check("two agreements, not fourteen", ACCEPT_COUNT === 2);
console.log("\n4. Consent");
check("reaches the consent sheet", /Your data, your call/.test(text()));
check("marketing is off by default", /Off unless you want it/.test(text()));
check("consent is unbundled from contract acceptance",
  !/I agree to lili's Terms of Use/.test(text()));
const saveBtn = buttons().find((b) => /Save choices/.test(b.textContent));
check("consent can be saved on its own", saveBtn && !saveBtn.disabled);
await act(async () => { saveBtn.click(); });
await settle();

console.log("\n5. App opens");
// Deliberately strict. An earlier version of this check matched the word
// "lili" — which also appears on the market-blocked screen — and passed while
// the app was actually crashing behind it.
check("marketplace renders past the gate",
  /Shop Now/.test(text())
  && !/Your data, your call/.test(text())
  && !/Not open here yet/.test(text())
  && !/year of birth/i.test(text()));

console.log("\n6. Consent persists across a relaunch");
await act(async () => { root.unmount(); });
const root2 = createRoot(document.getElementById("root"));
await act(async () => {
  root2.render(React.createElement(ComplianceProvider, null, React.createElement(Marketplace)));
});
await settle();
check("gate does not re-prompt", !/year of birth/i.test(text()) && !/Your data, your call/.test(text()));

const stored = JSON.parse(window.localStorage.getItem("lili.consent.v1") || "{}");
check("consent stamped with a policy version", !!stored.policyVersion, stored.policyVersion);
const audit = JSON.parse(window.localStorage.getItem("lili.audit.v1") || "[]");
check("audit trail written", audit.some((e) => e.type === "consent.recorded"));
check("age check audited", audit.some((e) => e.type === "age.checked"));
check("each agreement recorded separately with a version",
  audit.filter(e => e.type === "agreement.accepted").length === 2
  && audit.every(e => e.type !== "agreement.accepted" || !!e.detail.version));

console.log("\n7. Intermediary posture");
// The browse-anyway override is deliberately NOT persisted — an unlicensed
// market shows its wall on every launch. Click through it again.
check("market wall returns on relaunch", /Not open here yet/.test(text()));
await act(async () => { findBtn(/look around anyway/i).click(); });
await settle();

// splash -> style onboarding -> feed. Looped rather than a fixed number of
// steps, so adding an onboarding screen later doesn't silently break this.
for (let n = 0; n < 6 && !/AED/.test(text()); n++) {
  const b = findBtn(/Shop Now/) || findBtn(/Skip/) || findBtn(/Continue/);
  if (!b) break;
  await act(async () => { b.click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
}
const { SELLER_TYPES, PLATFORM_ROLE } = await import("./src/compliance/intermediary.js");
check("lili is not the merchant of record", PLATFORM_ROLE.merchantOfRecord === false);
check("private sellers carry no consumer-rights promise",
  SELLER_TYPES.private.consumerRightsApply === false);
check("business sellers do", SELLER_TYPES.trader.consumerRightsApply === true);

// open an item and confirm the buyer is told who they are contracting with
// tiles are clickable divs, not buttons
// the deepest pointer-div containing a price is the tile itself, not a wrapper
const priced = [...document.querySelectorAll("div")]
  .filter(d => /AED/.test(d.textContent || "") && d.style.cursor === "pointer");
const tile = priced.find(d =>
  !priced.some(o => o !== d && d.contains(o))) || priced[0];
if (tile) {
  await act(async () => { tile.click(); });
  await settle();
  check("listing names the seller before the buy button", /Sold by/.test(text()));
  check("listing says lili is not the seller", /not by lili/.test(text()));
  check("listing carries a seller-type badge",
    /Private seller|Business seller/.test(text()));
  check("listing offers a report route", /Report this listing/.test(text()));
} else {
  check("found a listing to open", false,
    `| screen text: ${text().slice(0,140)}`);
}

console.log("\n8. Listing screening");
const { screenListing, priceIsPlausible } = await import("./src/compliance/listingRules.js");

const blocked = screenListing({ title: "Chanel replica bag", brand: "Chanel", price: 900 });
check("blocks a self-declared replica", blocked.verdict === "block");

const cites = screenListing({ title: "Crocodile skin clutch", price: 5000 });
check("blocks protected-species material", cites.verdict === "block");

const cheap = screenListing({ title: "Classic Flap", brand: "Chanel", price: 400 });
check("sends an implausibly cheap designer bag to review", cheap.verdict === "review",
  `got ${cheap.verdict}`);
check("authentication clears the price flag",
  screenListing({ title: "Classic Flap", brand: "Chanel", price: 400,
                  hasAuthentication: true }).verdict !== "review");

const clean = screenListing({ title: "Silk midi dress", brand: "Zara", price: 350,
                              description: "Worn twice, like new" });
check("passes an ordinary listing", clean.verdict === "ok", `got ${clean.verdict}`);

check("price floor logic is right",
  priceIsPlausible(400, "Chanel").ok === false && priceIsPlausible(9000, "Chanel").ok === true);

const undeclared = screenListing({ title: "Bulk stock available", description: "MOQ 20",
                                   price: 500, sellerType: "private" });
check("flags undeclared trading", undeclared.findings.some(f => f.code === "trader.undeclared"));

console.log("\n9. Seller tiers, tax and disputes");
const { requiredTier, taxPosition, PAYMENT_POSTURE, disputeRoute, screenAdCopy } =
  await import("./src/compliance/sellerRules.js");
check("casual seller starts at tier 1", requiredTier({ sellerType: "private" }) === 1);
check("payout demands identity", requiredTier({ sellerType: "private", wantsPayout: true }) === 2);
check("declared business needs tier 3", requiredTier({ sellerType: "trader" }) === 3);
check("high volume forces tier 3 regardless of declaration",
  requiredTier({ sellerType: "private", valueLast12m: 250000 }) === 3);
check("lili never holds funds", PAYMENT_POSTURE.liliHoldsFunds === false);
check("UAE tax position flags the agent/principal question",
  /Unsettled/.test(taxPosition("AE").deemedSupplier));
check("US treats the platform as deemed supplier",
  /Yes/.test(taxPosition("US").deemedSupplier));
check("dispute route preserves the statutory right",
  /does not remove/.test(disputeRoute("AE").statutoryNote));
check("blocks unsupportable ad claims",
  screenAdCopy("100% authentic, guaranteed return").length >= 2);

console.log("\n10. Seller agreement");
const { SELLER_AGREEMENT, ACCEPT, ACKNOWLEDGE } = await import("./src/compliance/agreements.js");
check("signup asks for exactly two agreements", ACCEPT.length === 2);
check("four disclosures carry no tick",
  ACKNOWLEDGE.length === 4 && ACKNOWLEDGE.every(a => a.required === undefined));
check("seller agreement covers eight obligations", SELLER_AGREEMENT.length === 8);
check("every seller clause is required and bilingual",
  SELLER_AGREEMENT.every(c => c.required && c.bodyAr && c.titleAr));
check("seller agreement states the seller is the merchant",
  SELLER_AGREEMENT.some(c => c.id === "merchant-of-record"));
check("no blanket lili-not-liable clause survives",
  !SELLER_AGREEMENT.some(c => /not responsible for/i.test(c.body)));

console.log("\n11. Moderation queue");
const mod = await import("./src/compliance/moderation.js");

const c1 = await mod.enqueue({ source:"user_report", kind:"listing", targetId:"item-1",
  title:"Chanel flap", shopId:"shop-9", shopName:"Leen", reason:"counterfeit", marketCode:"AE" });
check("counterfeit gets the 24h clock", c1.slaHours === 24);
check("case opens pending", c1.state === "pending");

const c1b = await mod.enqueue({ source:"user_report", kind:"listing", targetId:"item-1",
  title:"Chanel flap", shopId:"shop-9", reason:"scam", marketCode:"AE" });
check("duplicate reports merge into one case", c1b.id === c1.id && c1b.reportCount === 2);
check("merged case keeps both reasons", c1b.reasons.includes("counterfeit") && c1b.reasons.includes("scam"));

await mod.enqueue({ source:"user_report", kind:"listing", targetId:"item-2",
  title:"Wrong size", shopId:"shop-3", reason:"miscategorised", marketCode:"AE" });
check("low-severity gets a longer clock",
  (await mod.caseById((await mod.listQueue())[0].id)) !== null);

const q = await mod.listQueue();
check("most-reported sorts first", q[0].targetId === "item-1", `got ${q[0].targetId}`);

await mod.claim(c1.id, "moderator-a");
check("claiming moves it to reviewing", (await mod.caseById(c1.id)).state === "reviewing");

const decided = await mod.decide(c1.id, "remove_and_warn", "Stitching and serial don't match.", 0);
check("decision records a strike", decided.decision.strikeApplied === 1);
check("decision writes a statement to the reporter", !!decided.decision.statementToReporter);
check("decision writes a statement to the seller", !!decided.decision.statementToSeller);
check("reason is carried into both statements",
  /serial/.test(decided.decision.statementToReporter) && /serial/.test(decided.decision.statementToSeller));
check("strike counts against the seller", (await mod.sellerStrikes("shop-9")) === 1);

await mod.appeal(c1.id, "I have the receipt from the boutique.");
check("appeal suspends the strike", (await mod.sellerStrikes("shop-9")) === 0,
  "an appealed strike must not count while undecided");
check("case is under appeal", (await mod.caseById(c1.id)).state === "appealed");

await mod.resolveAppeal(c1.id, false, "Receipt checks out.");
const overturned = await mod.caseById(c1.id);
check("overturned appeal clears the strike",
  overturned.state === "overturned" && overturned.decision.strikeApplied === 0);
check("seller standing is clean again", (await mod.sellerStrikes("shop-9")) === 0);

const dismissed = await mod.enqueue({ source:"user_report", kind:"listing", targetId:"item-3",
  title:"Fine dress", shopId:"shop-3", reason:"other", marketCode:"AE" });
const d = await mod.decide(dismissed.id, "dismiss", "Nothing wrong with it.", 0);
check("a dismissal tells the reporter but not the seller",
  !!d.decision.statementToReporter && d.decision.statementToSeller === null);

const stats = await mod.queueStats();
check("stats count open and closed cases", stats.total >= 3 && stats.decided >= 1);
check("server contract is documented for the swap",
  Object.keys(mod.SERVER_CONTRACT).length >= 6);

console.log("\n12. Persistence");
const repo = await import("./src/data/repo.js");

// The app already bootstrapped earlier in this run, so clear storage to test
// genuine first-run behaviour. This section runs last for that reason.
await repo.reset();

const seedItems = [{ id: "seed-1", title: "Seed dress" }];
const seedShops = [{ id: "seed-shop", name: "Seed shop" }];
const boot = await repo.bootstrap(seedItems, seedShops);
check("first run seeds the catalogue", boot.items.length === 1 && boot.shops.length === 1);

const listed = await repo.addItem({ title: "Silk slip", brand: "Zara", price: 320 });
check("a new listing gets an id and a status", !!listed.id && listed.status === "live");
check("listing is stored", (await repo.getItems()).some(i => i.id === listed.id));

// the bug this guards: re-seeding on every launch would wipe seller listings
const boot2 = await repo.bootstrap(seedItems, seedShops);
check("re-bootstrapping does NOT wipe seller listings",
  boot2.items.some(i => i.id === listed.id),
  "seed must not overwrite storage after first run");

const shop = await repo.createShop({ name: "My shop", sellerType: "private" });
check("shop is created and remembered", (await repo.getMyShop()).id === shop.id);
check("shop appears in the shop list", (await repo.getShops()).some(s => s.id === shop.id));

await repo.removeItem(listed.id);
const removed = (await repo.getItems()).find(i => i.id === listed.id);
check("removal is a soft delete, keeping the evidence trail",
  removed && removed.status === "removed");

await repo.saveCart([{ id: listed.id, qty: 2 }]);
check("cart survives a restart", (await repo.getCart())[0].qty === 2);

check("backend swap surface is documented",
  repo.BACKEND_SWAP.functions.length === 6 &&
  Object.keys(repo.BACKEND_SWAP.endpoints).length === 6);

console.log("\n13. Photos");
const img = await import("./src/data/images.js");

check("rejects a non-image file",
  img.validateFile({ type: "application/pdf", size: 1000 }).ok === false);
check("rejects an oversized photo",
  img.validateFile({ type: "image/jpeg", size: 20 * 1048576 }).ok === false);
check("accepts a normal phone photo",
  img.validateFile({ type: "image/jpeg", size: 3 * 1048576 }).ok === true);
check("accepts iPhone HEIC", img.validateFile({ type: "image/heic", size: 2e6 }).ok === true);

const big = img.targetSize(4032, 3024);
check("downscales a phone photo to the long-edge cap",
  big.width === 1600 && big.height === 1200 && big.scaled === true,
  `got ${big.width}x${big.height}`);
check("keeps aspect ratio on portrait too", (() => {
  const p = img.targetSize(3024, 4032);
  return p.height === 1600 && p.width === 1200;
})());
check("never upscales a small image",
  img.targetSize(800, 600).scaled === false);
check("handles a zero-dimension image without dividing by zero",
  img.targetSize(0, 0).width === 0);

check("a listing needs at least one photo", img.countProblems(0).ok === false);
check("caps photos per listing", img.countProblems(99).ok === false);
check("a normal listing passes", img.countProblems(4).ok === true);

console.log("\n14. Postel's Law — input tolerance");
const inp = await import("./src/ux/input.js");

check("accepts Arabic-Indic year ١٩٩٦", inp.parseYear("١٩٩٦") === 1996);
check("accepts Persian year ۱۹۹۶", inp.parseYear("۱۹۹۶") === 1996);
check("still accepts Latin 1996", inp.parseYear("1996") === 1996);
check("rejects a nonsense year", inp.parseYear("99") === null);
check("rejects a year in the future", inp.parseYear("3000") === null);

check("price in Arabic digits ١٢٩٠٠", inp.parsePrice("١٢٩٠٠") === 12900);
check("price with a thousands comma", inp.parsePrice("12,900") === 12900);
check("price with a currency word", inp.parsePrice("AED 12900") === 12900);
check("price written in Arabic with درهم", inp.parsePrice("١٢٬٩٠٠ درهم") === 12900,
  `got ${inp.parsePrice("١٢٬٩٠٠ درهم")}`);
check("Arabic decimal separator ٫", inp.parsePrice("١٢٫٥") === 12.5);
check("gibberish returns null, not NaN", inp.parsePrice("abc") === null);
check("empty returns null", inp.parsePrice("") === null);

check("phone 0501234567", inp.parsePhoneAE("0501234567") === "+971501234567");
check("phone +971 50 123 4567", inp.parsePhoneAE("+971 50 123 4567") === "+971501234567");
check("phone 00971501234567", inp.parsePhoneAE("00971501234567") === "+971501234567");
check("phone in Arabic digits", inp.parsePhoneAE("٠٥٠١٢٣٤٥٦٧") === "+971501234567");
check("landline rejected as a mobile", inp.parsePhoneAE("042345678") === null);

check("strips invisible paste characters",
  inp.clean("\u200Bhello\u202E") === "hello");
check("email domain lowercased, local part preserved",
  inp.normaliseEmail("Sara.K@Example.COM") === "Sara.K@example.com");

console.log("\n15. Languages");
const L = await import("./src/i18n/languages.js");

check("covers the UAE's largest communities",
  ["en","ar","hi","ml","ur","bn","tl","ta"].every(c => L.LANGUAGES.some(l => l.code === c)));
check("Malayalam included, not just Hindi", L.LANGUAGES.some(l => l.code === "ml"));
check("every language has a native name", L.LANGUAGES.every(l => l.native && l.native.length));
check("RTL languages flagged: Arabic, Urdu, Persian",
  ["ar","ur","fa"].every(c => L.isRTL(c)) && !L.isRTL("hi"));
// v2.9.1: Arabic moved from "ready" to "partial". An audit counted ~150
// bilingual labels against 600+ English strings — under a quarter, all of them
// headings, no body copy anywhere — and this file's own scheme defines "ready"
// as "real strings exist". The assertion now checks the honest shape: English
// is finished, Arabic is served but not claimed to be finished, and nothing
// untranslated is dressed up as either.
check("only genuinely translated languages are 'ready'",
  L.readyLanguages().map(l => l.code).sort().join() === "en");
check("Arabic is served, and not claimed to be finished",
  L.getLanguage("ar").status === "partial" &&
  L.servedLanguages().map(l => l.code).sort().join() === "ar,en");
check("untranslated ones are marked planned, not faked",
  L.plannedLanguages().length >= 8);

// the honest-fallback rule: a Malayalam phone gets English, not half a translation
const origLangs = Object.getOwnPropertyDescriptor(global.navigator, "languages");
Object.defineProperty(global.navigator, "languages", { value: ["ml-IN","en"], configurable: true });
check("untranslated device language falls back to English", L.guessLanguage() === "en");
Object.defineProperty(global.navigator, "languages", { value: ["ar-AE"], configurable: true });
check("Arabic device language is honoured", L.guessLanguage() === "ar");
if (origLangs) Object.defineProperty(global.navigator, "languages", origLangs);

console.log("\n16. Numerals in every script");
const inp2 = await import("./src/ux/input.js");
const scripts = [
  ["Arabic", "\u0661\u0662\u0669\u0660\u0660"], ["Persian", "\u06f1\u06f2\u06f9\u06f0\u06f0"],
  ["Devanagari", "\u0967\u0968\u096f\u0966\u0966"], ["Bengali", "\u09e7\u09e8\u09ef\u09e6\u09e6"],
  ["Tamil", "\u0be7\u0be8\u0bef\u0be6\u0be6"], ["Malayalam", "\u0d67\u0d68\u0d6f\u0d66\u0d66"],
  ["Gujarati", "\u0ae7\u0ae8\u0aef\u0ae6\u0ae6"], ["Telugu", "\u0c67\u0c68\u0c6f\u0c66\u0c66"],
  ["Kannada", "\u0ce7\u0ce8\u0cef\u0ce6\u0ce6"], ["Gurmukhi", "\u0a67\u0a68\u0a6f\u0a66\u0a66"],
  ["Sinhala", "\u0de7\u0de8\u0def\u0de6\u0de6"], ["Odia", "\u0b67\u0b68\u0b6f\u0b66\u0b66"],
  ["Thai", "\u0e51\u0e52\u0e59\u0e50\u0e50"],
];
for (const [name, digits] of scripts) {
  check(`${name} price parses to 12900`, inp2.parsePrice(digits) === 12900,
        `got ${inp2.parsePrice(digits)}`);
}
check("Latin is untouched by all of this", inp2.parsePrice("12,900") === 12900);

console.log("\n17. Theme");
const th = await import("./src/theme/theme.js");
global.window.matchMedia = global.window.matchMedia || ((q) => ({
  matches: false, media: q, addEventListener() {}, removeEventListener() {},
}));

check("three modes offered, including 'match my phone'",
  th.MODES.length === 3 && th.MODES.some(m => m.key === "system"));
check("defaults to following the phone", th.DEFAULT_MODE === "system");
check("explicit modes resolve to themselves",
  th.resolve("dark") === "dark" && th.resolve("light") === "light");

await th.applyTheme("dark");
check("dark sets the document attribute",
  document.documentElement.getAttribute("data-theme") === "dark");
await th.applyTheme("light");
check("light sets the document attribute",
  document.documentElement.getAttribute("data-theme") === "light");

await th.setMode("dark");
check("choice is persisted", (await th.getMode()) === "dark");

check("semantic aliases exist for new code",
  th.T.surface === "var(--c-white)" && th.T.text === "var(--c-ink)");

// the bug this guards: colours built by string concatenation silently produce
// "var(--c-white)cc", which the browser drops entirely
const mk = marketSource();
check("no colour value is built by string concatenation",
  !/C\.[a-zA-Z]+\s*\+\s*"/.test(mk));
check("palette resolves through CSS variables", /var\(--c-ink\)/.test(mk));

console.log("\n18. Friction: obligations bind when they matter");
const ag = await import("./src/compliance/agreements.js");

const listing = ag.sellerClausesFor("listing");
const payout  = ag.sellerClausesFor("payout");
check("first listing asks for five promises, not eight", listing.length === 5);
check("the money and penalty clauses wait for the first payout", payout.length === 3);
check("nothing was lost in the split",
  listing.length + payout.length === ag.SELLER_AGREEMENT.length);
check("authenticity is required to list, not deferred",
  listing.some(c => c.id === "authenticity"));
check("counterfeit and prohibited rules bind at listing time",
  listing.some(c => c.id === "prohibited"));
check("ID verification waits until she's actually being paid",
  payout.some(c => c.id === "verification"));
check("every clause still carries its Arabic",
  ag.SELLER_AGREEMENT.every(c => c.bodyAr && c.titleAr));

const mk2 = marketSource();
check("shop setup asks for one field, not four",
  !/اسم الدكان \(Arabic\)/.test(mk2) && !/Describe your style/.test(mk2));
check("bio and banner moved to settings, not deleted from the product",
  /Arabic name, bio and colour are all in Settings/.test(mk2));

console.log("\n19. Icons, not emoji");
const { readdirSync, statSync } = await import("node:fs");
const { join } = await import("node:path");
const srcFiles = [];
(function walk(d){ for (const f of readdirSync(d)) {
  const p = join(d, f);
  statSync(p).isDirectory() ? walk(p) : /\.jsx?$/.test(f) && srcFiles.push(p);
}})("src");

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
const offenders = srcFiles.filter(f => !f.includes("icons/Icon"))
  .filter(f => EMOJI.test(readFileSyncSafe(f)));
check("no emoji anywhere in the app source", offenders.length === 0,
  offenders.map(f => f.replace("src/","")).join(", "));

const IconSrc = readFileSyncSafe("./src/icons/Icon.jsx");
const appSrcForEmoji = srcFiles.filter(f => !f.includes("icons/Icon"))
  .map(f => readFileSyncSafe(f)).join("\n");
const names = [...IconSrc.matchAll(/^  (\w+):\s+"/gm)].map(m => m[1]);
check("icon set is substantial", names.length >= 40, `${names.length} icons`);
check("icons inherit colour so they theme",
  /stroke: "currentColor"/.test(IconSrc) && /fill: solid \? "currentColor"/.test(IconSrc));
// The 🕌 that used to stand for abayas is a mosque — a garment labelled with a
// place of worship. This asserts it is gone from the app, not from the comment
// explaining why.
check("abaya has a garment icon, and the mosque emoji is gone",
  names.includes("abaya") && !/\u{1F54C}/u.test(appSrcForEmoji));

// every icon name referenced in the app must exist in the set
const appSrc = srcFiles.filter(f => !f.includes("icons/Icon"))
  .map(f => readFileSyncSafe(f)).join("\n");
const referenced = new Set([...appSrc.matchAll(/<Icon\s+name="([a-zA-Z]+)"/g)].map(m => m[1]));
const unknown = [...referenced].filter(n => !names.includes(n));
check("no listing references a missing icon", unknown.length === 0, unknown.join(", "));

const mk3 = marketSource();
check("shop identity is a monogram, not a picture", /Monogram|charAt\(0\)\.toUpperCase/.test(mk3));
check("listings fall back to a category icon", /Placeholder item=/.test(mk3));

console.log("\n20. Error boundary");
const EB = (await import("./src/ErrorBoundary.jsx")).default;

// A component that throws, so the boundary is proved rather than assumed.
function Bomb() { throw new Error("deliberate test crash"); }

const ebRoot = createRoot(document.getElementById("root"));
const quiet = console.error; console.error = () => {};   // React logs the catch
await act(async () => {
  ebRoot.render(React.createElement(EB, { name: "test" }, React.createElement(Bomb)));
});
await settle();
console.error = quiet;

check("a crashing component does not blank the screen", text().length > 0);
check("the user is told what happened", /Something went wrong/.test(text()));
check("it speaks Arabic too", /حدث خطأ ما/.test(text()));
check("it blames itself, not the user", /on our side, not yours/.test(text()));
check("recovery is offered", !!buttons().find(b => /Try again/.test(b.textContent)));
check("a fresh start is offered", !!buttons().find(b => /Start fresh/.test(b.textContent)));

const crashes = JSON.parse(window.localStorage.getItem("lili.crashes.v1") || "[]");
check("the crash is recorded for later reporting",
  crashes.some(c => /deliberate test crash/.test(c.message)));
check("the component stack is captured",
  crashes.some(c => c.componentStack && c.componentStack.length > 0));
await act(async () => { ebRoot.unmount(); });

console.log("\n21. Backend switch");
const rem = await import("./src/backend/remote.js");
const rp  = await import("./src/data/repo.js");
const cfg = (await import("./src/backend/config.js")).default;

// The project is now wired to a real Supabase instance, so these assert the
// live state rather than the unconfigured one they were written against.
check("a live config is present", !!cfg.url && !!cfg.publishableKey);
check("it targets the API-served schema", cfg.schema === "public");
check("a live config reports configured", rem.configure(cfg) === true);
check("an empty config falls back to local",
  rem.configure({ url: "", publishableKey: "" }) === false);
rem.configure(cfg);

// Configured is not the same as usable. initBackend only enters remote mode if
// it can actually obtain a session; with anonymous sign-in switched off it
// stays local, which is the designed behaviour rather than a failure.
const live = await rp.initBackend();
check("boot resolves to a definite mode", typeof live === "boolean");
check("remote mode is only entered with a working session",
  live === false || rp.isRemote() === true);
check("either way the catalogue is served",
  Array.isArray(await rp.getItems()));

check("the adapter covers the whole repo surface",
  ["getItems","addItem","updateItem","removeItem","getShops","createShop",
   "updateShop","getMyShop","getFollowing","toggleFollow","getSaved",
   "toggleSave","getCart","saveCart","watchItems"].every(f => typeof rem[f] === "function"));

const src = readFileSyncSafe("./src/backend/remote.js");
check("server-owned columns are stripped before every write",
  /SERVER_OWNED = \["id","owner_uid","status","screening","followers","strikes"/.test(src));
// These used to assert the queue was refused outright. It is now reachable —
// but only through database functions that check a claim the client cannot
// grant itself, so the property to assert is "gated", not "absent".
check("the queue is reached through a gated database function",
  /rpc\("lili_moderation_list"/.test(src));
check("decisions go through a gated database function",
  /rpc\("lili_moderation_decide"/.test(src));
check("a decision cannot be made without a reason",
  /p_reason: reason/.test(src));
check("moderator status is asked of the server, never assumed",
  /rpc\("lili_is_moderator"\)/.test(src));
check("no service-role key anywhere in the app",
  !/service_role|sb_secret_/.test(readFileSyncSafe("./src/backend/config.js") + src));

console.log("\n22. Screening does not loop");
const ls = readFileSyncSafe("./src/compliance/ListingScreen.jsx");
// React error #185: reporting the verdict during render set parent state
// mid-render, which re-rendered, which re-screened, forever — a crashed page
// the moment a seller typed a price.
check("the verdict is reported after the render commits, not during it",
  /useEffect\([\s\S]{0,400}onVerdict\(result\)/.test(ls));
check("nothing calls onVerdict in the render body",
  !/^\s{2}if \(onVerdict\) onVerdict\(result\);/m.test(ls));
check("the effect depends on the verdict shape, not a fresh object",
  /\[signature, onVerdict/.test(ls));
check("a repeated verdict is not re-sent", /lastSent\.current === signature/.test(ls));

console.log("\n23. Photos leave the phone");
const rsrc = readFileSyncSafe("./src/backend/remote.js");
// The call was renamed when thumbnails were added; the behaviour is the same
// and still verified — data URLs never reach a row.
check("photos are uploaded to storage, not stored as data URLs in a row",
  /const set = await uploadPhotoSet\(/.test(rsrc));
check("a data URL is converted to a real file before upload",
  /dataUrlToBlob/.test(rsrc));
check("each seller writes only inside her own folder",
  /\$\{uid\}\//.test(rsrc));
check("already-uploaded photos are not re-uploaded",
  /startsWith\("data:"\)\) return dataUrl/.test(rsrc));
check("one failed photo does not lose the others",
  /Promise\.allSettled/.test(rsrc));
check("the row keeps links, and drops the field when there are none",
  /else delete row\.photos/.test(rsrc));

console.log("\n24. Photos are sized for where they are shown");
const imgs = await import("./src/data/images.js");
const rsrc2 = readFileSyncSafe("./src/backend/remote.js");
const mk4 = marketSource();

check("a thumbnail size is defined", imgs.LIMITS.thumbDimension < imgs.LIMITS.maxDimension);
check("both sizes are produced at capture", /processImage\(raw, LIMITS\.thumbDimension\)/.test(mk4));
check("the listing carries both", /thumb:thumbs\[0\]\|\|null, thumbs/.test(mk4));
check("both are uploaded", /uploadPhotoSet/.test(rsrc2));
check("a tile loads the small one", /item\.thumb \|\| item\.photo/.test(mk4));
check("the item detail loads the full one", /item\.photo \|\| item\.thumb/.test(mk4));
check("only the detail view asks for full", (mk4.match(/<ItemPhoto item=\{item\} full\/>/g)||[]).length === 1);
check("a mismatched pairing is discarded rather than shown",
  /upThumbs\.length === up\.length \? upThumbs : \[\]/.test(rsrc2));

// the saving is worth stating in numbers
const px = (d) => d * d;
const ratio = px(imgs.LIMITS.maxDimension) / px(imgs.LIMITS.thumbDimension);
check("a tile downloads at least 10x fewer pixels", ratio >= 10, `${ratio.toFixed(0)}x`);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
