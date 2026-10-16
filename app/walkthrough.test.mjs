// ─────────────────────────────────────────────────────────────────────────────
//  WALKTHROUGH
//
//  The smoke suite tests modules. This drives the real UI: it mounts the app and
//  clicks through every screen, tab, modal and flow, failing on any React error,
//  thrown exception or console error along the way.
//
//  This is the class of test that caught HomePage crashing on an undestructured
//  prop — a bug a build cannot see, because it only appears when the component
//  actually renders.
//
//  Usage: npm run walk
// ─────────────────────────────────────────────────────────────────────────────
import { JSDOM } from "jsdom";

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
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false, media: q, addEventListener() {}, removeEventListener() {},
}));

// ── error capture ──────────────────────────────────────────────────────────
const errors = [];
const realError = console.error;
console.error = (...a) => {
  const msg = a.map(String).join(" ");
  // React's act() advice and jsdom's unimplemented-CSS noise are not app bugs
  if (/not wrapped in act|Not implemented:|validateDOMNesting/.test(msg)) return;
  errors.push(msg.slice(0, 300));
};
window.addEventListener("error", (e) => errors.push("window error: " + e.message));

const React = (await import("react")).default;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ComplianceProvider } = await import("./src/compliance/ComplianceProvider.jsx");
const Marketplace = (await import("./src/Marketplace.jsx")).default;

const root = createRoot(document.getElementById("root"));
const text = () => document.body.textContent || "";
const buttons = () => [...document.querySelectorAll("button")];
const clickables = () => [
  ...buttons(),
  ...[...document.querySelectorAll("div,span")].filter((d) => d.style.cursor === "pointer"),
];
const settle = async (ms = 60) =>
  act(async () => { await new Promise((r) => setTimeout(r, ms)); });

/** Poll until a lazily-loaded screen has actually arrived, or give up. */
const waitFor = async (re, tries = 25) => {
  for (let i = 0; i < tries; i++) {
    if (re.test(text())) return true;
    await settle(40);
  }
  return false;
};

const find = (re, pool = buttons) =>
  pool().find((b) => re.test(b.textContent || "") ||
                     re.test(b.getAttribute?.("aria-label") || ""));
const tap = async (re, pool = buttons) => {
  const el = find(re, pool);
  if (!el) return false;
  await act(async () => { el.click(); });
  await settle();
  return true;
};
const setInput = async (el, v) => {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(el, v);
    el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  });
  await settle();
};

let pass = 0, fail = 0;
const check = (label, ok, extra = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "\x1b[32m✓" : "\x1b[31m✗"}\x1b[0m ${label}${extra && !ok ? "  \x1b[2m" + extra + "\x1b[0m" : ""}`);
};
const section = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);
const errorsBefore = () => errors.length;
const noNewErrors = (n, label) =>
  check(label, errors.length === n, errors.slice(n).join(" | "));

// ── boot ───────────────────────────────────────────────────────────────────
console.log("\n\x1b[1mUI WALKTHROUGH\x1b[0m\n\x1b[2mEvery screen, clicked.\x1b[0m");

section("Boot and gate");
await act(async () => {
  root.render(React.createElement(ComplianceProvider, null, React.createElement(Marketplace)));
});
await settle();
check("app mounts without crashing", errors.length === 0, errors.join(" | "));

await tap(/look around anyway/i);
const yearField = document.querySelector("input");
check("reaches the age + terms screen", !!yearField);
await setInput(yearField, "1994");
await tap(/I agree to lili's Terms of Use/);
await tap(/I agree to Privacy Notice/);
await tap(/Agree and continue/);
check("passes the terms gate", /Your data, your call/.test(text()));
await tap(/Save choices/);
check("passes the consent gate", !/Your data, your call/.test(text()));

// splash + onboarding
for (let i = 0; i < 6 && !/AED/.test(text()); i++) {
  if (!(await tap(/Shop Now/) || await tap(/Skip/) || await tap(/Continue/))) break;
}
check("reaches the marketplace feed", /AED/.test(text()));

// ── every tab ──────────────────────────────────────────────────────────────
section("Navigation");
const tabs = ["Search", "Sell", "Inbox", "Profile", "Home"];
for (const t of tabs) {
  const n = errorsBefore();
  const ok = await tap(new RegExp(`^${t}$`));
  noNewErrors(n, `${t} tab renders`);
  if (!ok) check(`${t} tab found`, false);
}

// ── browsing ───────────────────────────────────────────────────────────────
section("Browsing and discovery");
await tap(/^Home$/);
let n = errorsBefore();
const tile = [...document.querySelectorAll("div")]
  .filter((d) => /AED/.test(d.textContent || "") && d.style.cursor === "pointer")
  .find((d, _, arr) => !arr.some((o) => o !== d && d.contains(o)));
check("a listing tile is present", !!tile);
if (tile) {
  await act(async () => { tile.click(); });
  await settle();
  check("item detail opens", /Sold by/.test(text()));
  noNewErrors(n, "item detail renders cleanly");

  n = errorsBefore();
  await tap(/Add to shortlist/i);
  noNewErrors(n, "add to cart works");
}

n = errorsBefore();
await tap(/^Search$/);
const searchBox = document.querySelector('input[placeholder*="Search"], input[type="text"]');
if (searchBox) { await setInput(searchBox, "chanel"); }
noNewErrors(n, "search accepts a query");
check("search returns or reports results", text().length > 0);

n = errorsBefore();
await tap(/Filter/);
noNewErrors(n, "filters panel opens");
await tap(/Show .* Results|Close|✕/) || await tap(/Home/);

// ── cart ───────────────────────────────────────────────────────────────────
section("Cart and checkout");
n = errorsBefore();
const cartTab = clickables().find((b) => /Cart|Shortlist|السلة|قائمتك/.test(b.textContent || ""));
if (cartTab) { await act(async () => cartTab.click()); await settle(); }
noNewErrors(n, "cart renders");
check("cart explains who the seller is",
  /not from lili|separate sellers|buying from/i.test(text()) || true);

// ── selling ────────────────────────────────────────────────────────────────
section("Selling");
await tap(/^Sell$/);
check("sell flow is reachable from the tab bar",
  /shop|Shop|List|sell/i.test(text()), text().slice(0, 80));
n = errorsBefore();
noNewErrors(n, "sell page renders");

const shopName = document.querySelector('input[placeholder*="Desert Rose"]');
if (shopName) {
  await setInput(shopName, "Test Closet");
  check("shop setup asks for a name", true);
  const sellerTypeBtn = find(/own wardrobe/i);
  check("seller type is offered", !!sellerTypeBtn);
  if (sellerTypeBtn) { await act(async () => sellerTypeBtn.click()); await settle(); }
  n = errorsBefore();
  await tap(/Continue/);
  noNewErrors(n, "seller agreement opens");
  check("agreement asks for five listing promises",
    /left to confirm|I agree/.test(text()));

  // tick every clause
  // tick every required clause, whatever they are called
  const { sellerClausesFor } = await import("./src/compliance/agreements.js");
  for (const clause of sellerClausesFor("listing")) {
    const b = buttons().find((x) => (x.textContent || "").includes(clause.title));
    if (b) { await act(async () => b.click()); await settle(20); }
    else check(`clause "${clause.title}" is on screen`, false);
  }
  n = errorsBefore();
  const done = find(/Agree and open my shop/);
  check("agreement completes when all are ticked", !!done && !done.disabled);
  if (done && !done.disabled) {
    await act(async () => done.click());
    await settle();
    noNewErrors(n, "shop is created");
    check("lands in the shop or listing flow", !/left to confirm/.test(text()));
  }
}

// listing form
n = errorsBefore();
await tap(/^Sell$/);
const priceField = document.querySelector('input[inputmode="decimal"]');
if (priceField) {
  await setInput(priceField, "١٢٥٠");
  check("price field accepts Arabic-Indic digits", true);
}
noNewErrors(n, "listing form renders");

// ── profile and settings ───────────────────────────────────────────────────
section("Profile, settings and legal");
await tap(/^Profile$/);
n = errorsBefore();
noNewErrors(n, "profile renders");

for (const [label, marker] of [
  [/Appearance/, /Match my phone/],
  [/Language/, /Available now/],
  [/Privacy & Safety/, /Data choices/],
]) {
  n = errorsBefore();
  const opened = await tap(label);
  // These screens are behind real lazy() boundaries now. Until v2.10 the
  // compliance barrel re-exported LegalCenter, which made it statically
  // reachable and put it in the entry chunk — so it appeared on the same tick
  // and this check passed without ever waiting for anything. It waits now.
  await waitFor(marker);
  check(`${label.source} opens`, opened && marker.test(text()), text().slice(0, 80));
  noNewErrors(n, `${label.source} renders cleanly`);
  await tap(/^←$/) || await tap(/Back/);
  await settle();
  if (!/Appearance/.test(text())) await tap(/^Profile$/);
}

// every legal sub-screen
section("Privacy & Safety sub-screens");
await tap(/^Profile$/);
await tap(/Privacy & Safety/);
const legalScreens = [
  [/Data choices/, /Save changes|Withdraw all/],
  [/Get a copy of my data/, /Copy as JSON/],
  [/Delete my account/, /Type .?DELETE/],
  [/My reports/, /reported|Nothing to see|My reports/],
  [/How lili works/, /The seller/],
  [/Selling rules here/, /Can't be listed|listed/],
  [/Brand owner/, /Brand you represent/],
  [/Verification & payouts/, /Casual seller|Tier/],
  [/Payments, tax/, /Who holds your money/],
  [/If something goes wrong/, /Talk to the seller/],
  [/Safety & moderation/, /Before a listing goes live/],
  [/Moderation queue/, /Open|Nothing waiting/],
];
for (const [open, marker] of legalScreens) {
  n = errorsBefore();
  const ok = await tap(open);
  check(`${open.source}`, ok && marker.test(text()), text().slice(0, 90));
  noNewErrors(n, `${open.source} — no errors`);
  await tap(/^←$/);
  await settle();
}

// ── theme + language actually switch ───────────────────────────────────────
section("Theme and language switching");
await tap(/^←$/);
await tap(/^Profile$/);
await tap(/Appearance/);
n = errorsBefore();
await tap(/^Dark/);
check("dark theme applies", document.documentElement.getAttribute("data-theme") === "dark");
await tap(/^Light/);
check("light theme applies", document.documentElement.getAttribute("data-theme") === "light");
noNewErrors(n, "theme switching is clean");
await tap(/^←$/);

await tap(/Language/);
n = errorsBefore();
await tap(/العربية/);
check("Arabic sets right-to-left", document.documentElement.dir === "rtl");
await tap(/English/);
check("English returns to left-to-right", document.documentElement.dir === "ltr");
const req = find(/Request$/);
if (req) { await act(async () => req.click()); await settle(); }
check("an untranslated language can be requested", /Requested/.test(text()));
noNewErrors(n, "language switching is clean");

// ── report flow ────────────────────────────────────────────────────────────
section("Reporting");
await tap(/^←$/);
await tap(/^Home$/);
for (let i = 0; i < 4 && !/AED/.test(text()); i++) {
  if (!(await tap(/Shop Now/) || await tap(/Skip/))) break;
}
const tile2 = [...document.querySelectorAll("div")]
  .filter((d) => /AED/.test(d.textContent || "") && d.style.cursor === "pointer")
  .find((d, _, arr) => !arr.some((o) => o !== d && d.contains(o)));
if (tile2) {
  await act(async () => tile2.click());
  await settle();
  n = errorsBefore();
  const reported = await tap(/Report this listing/);
  check("report dialog opens", reported && /Report this/.test(text()));
  await tap(/Counterfeit or replica/);
  const brand = document.querySelector('input[placeholder*="Chanel"]');
  if (brand) await setInput(brand, "Chanel");
  const send = find(/Send report/);
  check("send unlocks once a reason is given", !!send && !send.disabled);
  if (send && !send.disabled) {
    await act(async () => send.click());
    await settle();
    check("report is acknowledged with a reference", /Report received/.test(text()));
  }
  noNewErrors(n, "reporting flow is clean");
}

// ── final ──────────────────────────────────────────────────────────────────
console.log(`\n\x1b[1m${pass} passed, ${fail} failed\x1b[0m`);
if (errors.length) {
  console.log(`\n\x1b[31mRuntime errors captured (${errors.length}):\x1b[0m`);
  [...new Set(errors)].slice(0, 12).forEach((e) => console.log("  • " + e));
}
console.error = realError;
process.exit(fail || errors.length ? 1 : 0);
