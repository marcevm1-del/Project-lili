// ─────────────────────────────────────────────────────────────────────────────
//  RESEARCH-BACKED RULES — the suite for v2.8
//
//  The handover's own warning was "assert the property, not the shape": several
//  earlier tests passed for the wrong reason, because they grepped a file for a
//  string instead of exercising the behaviour. So almost everything below calls
//  the real functions with real listings and checks the decision.
//
//  The three greps that remain are honesty invariants — "this fabricated claim
//  is not in the source" is a property of the file, and the file is the right
//  place to assert it.
//
//  Run: npm run research
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";

let pass = 0, fail = 0;
const failures = [];
function check(name, ok) {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name); console.log(`  ✗ ${name}`); }
}
function section(t) { console.log(`\n${t}`); }

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

const { screenListing, priceIsPlausible, BRAND_FLOORS, REVIEW_THRESHOLD } =
  await import("./src/compliance/listingRules.js");
const { referenceBand, priceGuidance, pricePlausibility, inferKind, BRAND_TIERS,
        CONDITION_FACTOR, EXTREME_RATIO } =
  await import("./src/data/resaleValue.js");
const { scoreListing, PHOTO_CHECKLIST, PHOTO_TARGET } =
  await import("./src/sell/listingQuality.js");

// ─────────────────────────────────────────────────────────────────────────────
section("1. The v2.7 false positives that started this");

// The seed catalogue could not pass the app's own screen. Celine sunglasses at
// AED 800 tripped a category-blind Celine floor of AED 1,200.
check("Celine sunglasses at AED 800 are not sent for counterfeit review",
  screenListing({ title: "Celine Sunglasses", subtitle: "Cat Eye · Tortoiseshell",
    brand: "Celine", price: 800, category: "Luxury" }).verdict === "ok");

check("an Hermès silk scarf at AED 600 is not a counterfeit signal",
  screenListing({ title: "Hermès Twilly scarf", brand: "Hermès", price: 600,
    category: "Accessories" }).verdict === "ok");

check("an Hermès card holder at AED 1,100 is not a counterfeit signal",
  screenListing({ title: "Hermès card holder", brand: "Hermès", price: 1100,
    category: "Accessories" }).verdict === "ok");

check("a Gucci belt at AED 400 is not a counterfeit signal",
  screenListing({ title: "Gucci belt", brand: "Gucci", price: 400,
    category: "Accessories" }).verdict === "ok");

check("Louboutin heels at AED 450 are not a counterfeit signal",
  screenListing({ title: "Christian Louboutin heels", brand: "Christian Louboutin",
    price: 450, category: "Shoes" }).verdict === "ok");

// ─────────────────────────────────────────────────────────────────────────────
section("2. What must still be caught");

check("a Chanel Classic Flap at AED 400 still goes to review",
  screenListing({ title: "Classic Flap", brand: "Chanel", price: 400 }).verdict === "review");

check("an Hermès Birkin at AED 3,000 goes to review (model-level floor)",
  screenListing({ title: "Hermès Birkin 30", brand: "Hermès", price: 3000,
    category: "Bags" }).verdict === "review");

check("a self-declared replica is blocked, not reviewed",
  screenListing({ title: "Chanel replica bag", brand: "Chanel", price: 900 }).verdict === "block");

check("exotic skins are blocked on CITES grounds",
  screenListing({ title: "Crocodile skin clutch", price: 5000 }).verdict === "block");

check("a genuine Birkin priced like a Birkin passes",
  screenListing({ title: "Hermès Birkin 30", brand: "Hermès", price: 45000,
    category: "Bags" }).verdict === "ok");

// ─────────────────────────────────────────────────────────────────────────────
section("3. Scoring — price alone is not an accusation");
// Leipzig 2015: price is the only single indicator that survives contact with
// real marketplace data, and it is still only ~54–63% precise on its own.

const softOnly = screenListing({ title: "Gucci Marmont bag", brand: "Gucci",
  price: 800, category: "Bags", condition: "Good" });
check("a price modestly below the band does NOT reach review on its own",
  softOnly.verdict !== "review" && softOnly.score < REVIEW_THRESHOLD);

check("...but it is still said out loud, as advice",
  softOnly.findings.some((f) => f.code === "counterfeit.price_soft"));

const softPlusSignal = screenListing({ title: "Gucci Marmont bag",
  description: "Inspired by the original, no receipt", brand: "Gucci",
  price: 800, category: "Bags", condition: "Good" });
check("price below the band PLUS a second signal does reach review",
  softPlusSignal.verdict === "review" && softPlusSignal.score >= REVIEW_THRESHOLD);

check("an extreme price reaches review by itself",
  screenListing({ title: "Chanel Classic Flap", brand: "Chanel", price: 300,
    category: "Bags" }).score >= REVIEW_THRESHOLD);

check("over-assertion alone can never flag a listing",
  screenListing({ title: "Ganni dress", description: "100% authentic",
    brand: "Ganni", price: 400 }).verdict !== "review");

check("authentication removes the price signal entirely",
  screenListing({ title: "Classic Flap", brand: "Chanel", price: 400,
    hasAuthentication: true }).verdict !== "review");

check("the threshold is a stated constant, not a magic number",
  typeof REVIEW_THRESHOLD === "number" && REVIEW_THRESHOLD > 0);

// ─────────────────────────────────────────────────────────────────────────────
section("4. Condition moves the band (The RealReal 2025: fair-condition +32% YoY)");

const excellent = referenceBand({ brand: "Gucci", title: "Marmont bag", condition: "Excellent" });
const fair = referenceBand({ brand: "Gucci", title: "Marmont bag", condition: "Fair" });
check("a Fair-condition band sits below an Excellent one", fair.low < excellent.low);
check("Like New sits above Excellent",
  referenceBand({ brand: "Gucci", title: "Marmont bag", condition: "Like New" }).low > excellent.low);
check("every condition the UI offers has a factor",
  ["Like New", "Excellent", "Good", "Fair"].every((c) => CONDITION_FACTOR[c] > 0));

const worn = screenListing({ title: "Gucci Marmont bag", brand: "Gucci",
  price: 700, category: "Bags", condition: "Fair" });
const same = screenListing({ title: "Gucci Marmont bag", brand: "Gucci",
  price: 700, category: "Bags", condition: "Like New" });
check("the same price is treated more kindly on a Fair-condition piece",
  worn.score <= same.score);

// ─────────────────────────────────────────────────────────────────────────────
section("5. Category inference");

check("a title beats the category dropdown", inferKind({ title: "Hermès Twilly", category: "Luxury" }) === "silk");
check("'Luxury' alone is not a kind", inferKind({ title: "", category: "Luxury" }) === "other");
check("plurals are recognised — sellers write 'heels'", inferKind({ title: "Gianvito Rossi heels" }) === "shoes");
check("so are 'sunglasses'", inferKind({ title: "Celine sunglasses" }) === "sunglasses");
check("and 'scarves'", inferKind({ title: "Silk scarves bundle" }) === "silk");
check("abaya is a first-class kind", inferKind({ title: "Linen abaya", category: "Abayas" }) === "abaya");

// ─────────────────────────────────────────────────────────────────────────────
section("6. No opinion where there is no basis");

check("an unknown brand produces no band", referenceBand({ brand: "Zara", title: "dress" }) === null);
check("an unknown brand is never screened on price",
  screenListing({ title: "Silk midi dress", brand: "Zara", price: 40 })
    .findings.every((f) => !String(f.code).startsWith("counterfeit.price")));
check("a missing brand produces no band", referenceBand({ brand: "", title: "bag" }) === null);
check("modest wear has no bag or jewellery band invented for it",
  referenceBand({ brand: "Abaya Couture", title: "tote bag" }) === null);
check("an abaya from a local designer does have one",
  referenceBand({ brand: "Abaya Couture", title: "silk abaya" }) !== null);

// ─────────────────────────────────────────────────────────────────────────────
section("7. Every band is traceable to something");

check("every brand carries a tier", Object.values(BRAND_TIERS).every((b) => b.tier));
check("every published retention figure is between 0.5 and 3.0",
  Object.values(BRAND_TIERS).every((b) => b.retention == null || (b.retention > 0.5 && b.retention < 3)));
check("Hermès retention matches the Clair 2025 figure", BRAND_TIERS["Hermès"].retention === 1.38);
check("Rolex retention matches the Clair 2025 figure", BRAND_TIERS["Rolex"].retention === 1.04);
check("a band names its sources",
  (referenceBand({ brand: "Chanel", title: "flap bag" }).sources || []).length > 0);
check("a band explains its basis in words",
  /floor|model-level/i.test(referenceBand({ brand: "Chanel", title: "flap bag" }).basis));
check("the extreme ratio is a stated constant", EXTREME_RATIO > 0 && EXTREME_RATIO < 1);

// ─────────────────────────────────────────────────────────────────────────────
section("8. Backwards compatibility with the v2.7 call sites");

check("priceIsPlausible(400, 'Chanel') is still false", priceIsPlausible(400, "Chanel").ok === false);
check("priceIsPlausible(9000, 'Chanel') is still true", priceIsPlausible(9000, "Chanel").ok === true);
check("BRAND_FLOORS still exists and is populated", Object.keys(BRAND_FLOORS).length > 10);
check("floors are derived per brand's own category — Rolex's is a watch, not a bag",
  BRAND_FLOORS["Rolex"] >= 5000);
check("a returned floor is a number", typeof BRAND_FLOORS["Chanel"] === "number");

// ─────────────────────────────────────────────────────────────────────────────
section("9. Listing quality — a coach, not a gate");

const empty = scoreListing({});
const thin = scoreListing({ title: "bag", photos: ["a"] });
const good = scoreListing({
  title: "Chanel Classic Flap medium", titleAr: "شانيل كلاسيك فلاب",
  desc: "Bought at the Dubai Mall boutique in 2021, worn perhaps six times. Comes with the dust bag, box and authenticity card. Small scuff on the bottom corner, photographed.",
  brand: "Chanel", price: 24000, category: "Bags", condition: "Excellent",
  photos: ["a", "b", "c", "d", "e"],
});

check("an empty listing scores 0", empty.score === 0);
check("a thin listing scores low", thin.score < 50);
check("a complete listing scores high", good.score >= 80);
check("more photos never lowers the score",
  scoreListing({ title: "x", photos: ["a", "b", "c", "d"] }).score >=
  scoreListing({ title: "x", photos: ["a"] }).score);
check("the score is bounded 0–100", [empty, thin, good].every((r) => r.score >= 0 && r.score <= 100));
check("at most three suggestions are surfaced at a time", thin.top.length <= 3);
check("every check carries the evidence behind it",
  good.checks.every((c) => typeof c.evidence === "string" && c.evidence.length > 20));
check("every check carries a plain-words reason",
  good.checks.every((c) => typeof c.why === "string" && c.why.length > 20));
check("a missing Arabic title is raised", thin.checks.some((c) => c.id === "arabic" && c.state !== "pass"));
check("wear on a Fair-condition piece must be described",
  scoreListing({ title: "Gucci bag", condition: "Fair", desc: "Lovely bag", photos: ["a"] })
    .checks.some((c) => c.id === "condition" && c.state === "improve"));
check("...and describing it satisfies the check",
  scoreListing({ title: "Gucci bag", condition: "Fair", photos: ["a"],
    desc: "Corner scuffs and a mark on the strap, both photographed." })
    .checks.some((c) => c.id === "condition" && c.state === "pass"));
check("provenance is only asked for where it decides the sale",
  !scoreListing({ title: "Ganni dress", brand: "Ganni", photos: ["a"] })
    .checks.some((c) => c.id === "provenance") &&
  scoreListing({ title: "Chanel flap", brand: "Chanel", photos: ["a"] })
    .checks.some((c) => c.id === "provenance"));
check("the photo target is a stated constant", PHOTO_TARGET >= 3);
check("the photo checklist is bilingual",
  PHOTO_CHECKLIST.every((s) => s.en && s.ar));

// ─────────────────────────────────────────────────────────────────────────────
section("10. Pricing guidance for the seller");

check("underpricing is named as a cost to her, not a suspicion",
  priceGuidance({ price: 500, brand: "Chanel", title: "flap bag" }).state === "under");
check("a price inside the band says so",
  priceGuidance({ price: 20000, brand: "Chanel", title: "Classic Flap" }).state === "in");
check("no brand means no guidance", priceGuidance({ price: 500, brand: "Zara", title: "dress" }) === null);
check("guidance disclaims being an appraisal",
  /not an appraisal|a guide/i.test(priceGuidance({ price: 0, brand: "Chanel", title: "flap bag" }).detail +
    priceGuidance({ price: 0, brand: "Chanel", title: "flap bag" }).headline +
    " " + (priceGuidance({ price: 0, brand: "Chanel", title: "flap bag" }).detail || "")));

// ─────────────────────────────────────────────────────────────────────────────
section("11. Honesty invariants — nothing fabricated ships");

// Comments are stripped before these greps run. Without that, every check
// below passes or fails on the note explaining the removal rather than on the
// code — this suite caught itself asserting against its own commentary the
// first time it ran, which is exactly the failure mode the handover warned
// about: a test that passes for the wrong reason.
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const market = stripComments(read("./src/Marketplace.jsx"));
const repo = stripComments(read("./src/data/repo.js"));

check("no seed shop carries a fabricated rating",
  !/rating:\s*4\.\d/.test(market));
check("no seed shop carries a fabricated review count",
  !/reviews:\s*\d{2,}/.test(market));
check("the invented 'Trusted by 10,000+' claim is gone",
  !/10,000\+|2,000\+\s*reviews/.test(market));
check("no hard-coded 4.9 star rating anywhere in the app shell",
  !/>4\.9</.test(market) && !/fontWeight:700,marginLeft:4\}\}>4\.9/.test(market));
check("a newly created shop is not born with a rating",
  !/rating:\s*5\b/.test(repo));
check("the seed catalogue marks itself as demonstration data",
  /demo:\s*true/.test(market));
check("the dead isCaliberOK check is gone rather than left to rot",
  !/function isCaliberOK/.test(market));
check("authentication is no longer hard-coded true in the guided flow",
  !/hasAuthentication=\{true\}/.test(market));
check("no 'AI Tip' claiming a model that is not running",
  !/AI Tip/.test(market));
check("the photo limit in the copy comes from the limit, not a typed number",
  !/Add up to 6 photos/.test(market));

// ─────────────────────────────────────────────────────────────────────────────
section("12. Design tokens that were referenced but never defined");

const tokens = read("./src/Marketplace.jsx").match(/const C = \{[\s\S]*?\n\};/)[0];
const uiTokens = read("./src/compliance/ui.js").match(/export const C = \{[\s\S]*?\n\};/)[0];
for (const t of ["terraTx", "btn", "onBtn"]) {
  check(`C.${t} is defined in Marketplace.jsx`, new RegExp(`${t}\\s*:`).test(tokens));
  check(`C.${t} is defined in compliance/ui.js`, new RegExp(`${t}\\s*:`).test(uiTokens));
}


// ─────────────────────────────────────────────────────────────────────────────
section("13. v2.8 launch fixes — writes that actually reach the server");

const remoteSrc = stripComments(read("./src/backend/remote.js"));
const repoSrc   = stripComments(read("./src/data/repo.js"));
const convoSrc  = stripComments(read("./src/data/conversations.js"));

check("row mapping is an allowlist, not a denylist",
  /ROW_COLUMNS\s*=/.test(remoteSrc) && /for \(const k of allowed\)/.test(remoteSrc));
check("the allowlist covers the fields the sell form actually sends",
  ["category","subtitle","title_ar","condition","price","brand"].every((c) => remoteSrc.includes(`"${c}"`)));
check("shop writes go through the shop allowlist",
  /toRow\(form, "lili_shops"\)/.test(remoteSrc));
check("a server rejection is told apart from being offline",
  /export function isOffline/.test(remoteSrc));
check("a refused listing is raised, not swallowed into device storage",
  /REMOTE_REJECTED/.test(repoSrc) && /if \(!remote\.isOffline\(e\)\)/.test(repoSrc));
check("a listing held offline is marked pending rather than looking live",
  /pending: remoteReady/.test(repoSrc));

section("14. Messaging is no longer a puppet show");

check("the fabricated seller replies are gone",
  !/Thanks for reaching out|still available!|Can you share your size/.test(market));
check("no setTimeout invents a reply",
  !/setTimeout\([^)]*replies/.test(market));
check("the screen talks to the conversation repo",
  /convo\.sendMessage|convo\.getMessages|convo\.getConversations/.test(market));
check("the live thread is subscribed to",
  /convo\.watchMessages/.test(market));
check("read receipts are sent",
  /convo\.markRead/.test(market));
check("the conversation repo exists and routes to the backend",
  /remote\.sendMessage/.test(convoSrc) && /remote\.openConversation/.test(convoSrc));
check("a device-held message is marked undelivered, never auto-answered",
  /delivered: false/.test(convoSrc) && !/replies\s*=/.test(convoSrc));
check("a send failure is surfaced to the sender",
  /sendError/.test(market));
check("reporting is reachable from inside the thread",
  /kind:"conversation"/.test(market));
check("the meet-safely layer exists and names the three real risks",
  (() => {
    const ms = read("./src/messages/MeetSafely.jsx");
    return /public/i.test(ms) && /Keep it in lili/i.test(ms) && /before you pay/i.test(ms);
  })());
check("it says plainly that lili holds no money",
  /does not (take payment|hold)/i.test(read("./src/messages/MeetSafely.jsx")));

section("15. The private beta is enforced, not decorated");

const providerSrc = stripComments(read("./src/compliance/ComplianceProvider.jsx"));
check("no invite code is compared in the client",
  !/=== *['\"][A-Z0-9-]{4,}['\"]/.test(providerSrc));
check("redemption goes to the database",
  /remote\.redeemInvite/.test(providerSrc) && /lili_redeem_invite/.test(remoteSrc));
check("membership is re-asked of the server, not just cached",
  /remote\.isBetaMember\(\)/.test(providerSrc));
// The client does not decide the gate at all — lili_is_beta_member() does, and
// it is what the INSERT policies call. A client-side reading of the switch was
// added in this release, never used, and removed rather than shipped as dead
// code that looks like a control.
check("the client never decides the beta gate for itself",
  !/betaGateOn/.test(remoteSrc));
check("membership is only ever an answer from the server",
  /rpc\("lili_is_beta_member"\)/.test(remoteSrc));
check("a device-only build is not gated by a beta it has no server for",
  /!backendOn/.test(providerSrc));
check("the sell tab says invite-only before she does the work",
  /Invite only, for now/.test(market));
check("the gate copy no longer promises something the code does not do",
  !/Buying, selling and messages switch on the/.test(providerSrc));


// ─────────────────────────────────────────────────────────────────────────────
section("16. Consented disclosure — a report that can actually be reviewed");

const reportSrc = stripComments(read("./src/compliance/ReportDialog.jsx"));

check("the consent control exists and is off by default",
  /attachThread/.test(reportSrc) && /useState\(false\)[^\n]*\n?/.test(reportSrc) &&
  /setAttachThread/.test(reportSrc));
check("it is only offered on a conversation she is in",
  /isConversation && \(/.test(reportSrc));
check("the copy says plainly that nobody can read it otherwise",
  /Otherwise nobody can read it/.test(reportSrc));
check("she is told the copy is frozen",
  /frozen/i.test(reportSrc));
check("she is told the other person is not notified of the report",
  /is not told[\s\S]{0,60}reported|not told\s*\n?\s*that you reported/.test(reportSrc));
check("the report reaches the server, where the thread actually lives",
  /remote\.reportConversation/.test(reportSrc) && /lili_report_conversation/.test(remoteSrc));
check("a listing or shop report reaches the server too, not just the phone",
  /remote\.enqueueCase/.test(reportSrc));
check("a report never leaves her waiting on an unreachable server",
  /withTimeout\(/.test(reportSrc));
check("a moderator transcript read goes through the gated function",
  /lili_case_transcript/.test(remoteSrc));

section("17. The market wall stays a wall");

check("the browse override is deliberately NOT persisted — an unlicensed market shows its notice every launch",
  !/lili\.browse\.v1/.test(providerSrc));
check("an invite cannot be bound to a throwaway anonymous session",
  /needs_real_account/.test(providerSrc));


// ─────────────────────────────────────────────────────────────────────────────
section("18. Offers reach the seller");

const offersSrc = stripComments(read("./src/data/offers.js"));
const offersPage = stripComments(read("./src/offers/OffersPage.jsx"));

check("the fabricated seller response is gone",
  !/\["accept","counter","counter"\]|responses\[Math\.floor/.test(market));
check("no invented counter at 96% of the offer",
  !/\*0\.96/.test(market));
check("the invented 'similar items accept offers around' band is gone",
  !/Similar items accept offers around/.test(market));
check("the offer modal calls the real repo", /offers\.makeOffer/.test(market));
check("an offers repo exists and routes to the backend",
  /remote\.makeOffer/.test(offersSrc) && /remote\.acceptOffer/.test(offersSrc));
check("a buyer may only withdraw", /withdrawOffer/.test(offersPage) &&
  /isBuyer \?/.test(offersPage));
check("a seller may accept, decline or counter",
  /acceptOffer/.test(offersPage) && /declineOffer/.test(offersPage) && /counterOffer/.test(offersPage));
check("expiry is read from the clock, not a job", /hoursLeft/.test(offersSrc) &&
  /EXPIRY_HOURS/.test(offersSrc));
check("the Offers row is no longer a dead 'Soon' link",
  !/\{label:"Offers · العروض",icon:"tag",action:null,soon:true\}/.test(market) &&
  /setTab\("offers"\)/.test(market));
check("an accepted offer does not imply lili holds the money",
  /doesn't take payment or hold the\s+piece/.test(offersPage));
check("a held-offline offer is marked undelivered, never auto-answered",
  /delivered: false/.test(offersSrc) && !/responses\s*=/.test(offersSrc));

section("19. Notifications are delivered");

const notifSrc = stripComments(read("./src/notifications/NotificationsSheet.jsx"));
check("the bell opens something", /onClick=\{onOpenNotifications\}/.test(market));
check("the permanently-lit red dot is gone — the badge is a real count",
  /unreadCount > 0 &&/.test(market));
check("the count is asked of the server", /remote\.unreadCount/.test(market));
check("the sheet reads real notifications", /remote\.getNotifications/.test(notifSrc));
check("marking read is offered, and nothing else",
  /markNotificationRead/.test(notifSrc) && /markAllNotificationsRead/.test(notifSrc) &&
  !/createNotification|insert/.test(notifSrc));
check("it says notifications cannot be sent by a person",
  /nobody can send you one directly/.test(notifSrc));
check("a device-only build says so instead of showing a false empty state",
  /Nothing is\s*\n?\s*waiting on this device|once you're signed in and connected/.test(notifSrc));

section("20. The moderation queue reads the real cases");

const modSrc = stripComments(read("./src/compliance/moderation.js"));
const queueSrc = stripComments(read("./src/compliance/ModerationQueue.jsx"));
check("the queue can read the server", /remote\.listCases/.test(modSrc));
check("it only does so when the SERVER says you are a moderator",
  /remote\.isModerator\(\)/.test(modSrc));
check("claiming and deciding go to the server too",
  /remote\.claimCase/.test(modSrc) && /remote\.decideCase/.test(modSrc));
check("an unknown state cannot crash the queue — no unguarded STATES lookup anywhere",
  !/[^|)]\s*STATES\[[a-z]+\.state\]\.terminal/.test(modSrc) &&
  !/[^|)]\s*mod\.STATES\[[a-z]+\.state\]\.terminal/.test(queueSrc) &&
  /\|\| \{ key: state/.test(queueSrc));
check("the attached transcript is opened deliberately, not loaded with the case",
  /caseTranscript/.test(queueSrc) && /Open the attached conversation/.test(queueSrc));
check("the moderator is told the read is recorded",
  /recorded against your name/.test(queueSrc));


// ─────────────────────────────────────────────────────────────────────────────
section("21. Every wait ends");
// An unreachable server produces silence, not an error. Without a budget the
// notifications sheet sat on "Loading…" for as long as the app stayed open.

const timeoutSrc = stripComments(read("./src/ux/timeout.js"));
check("there is a shared bounded-wait helper", /export function withTimeout/.test(timeoutSrc));
check("interactive and background budgets are distinct constants",
  /interactive:\s*\d+/.test(timeoutSrc) && /background:\s*\d+/.test(timeoutSrc));
check("the notifications sheet bounds its load", /withTimeout\(/.test(notifSrc));
check("...and offers a way out rather than an endless spinner",
  /unreachable/.test(notifSrc) && /Try again/.test(notifSrc));
check("the offers page bounds its load",
  /withTimeout\(/.test(stripComments(read("./src/offers/OffersPage.jsx"))));
check("the background unread poll is bounded too",
  /withTimeout\(remote\.unreadCount\(\), BUDGET\.background\)/.test(market));
check("a device-only build does not even attempt the call",
  /if \(!remote\.isConfigured\(\)\) \{ setState\("unavailable"\)/.test(notifSrc));


// ─────────────────────────────────────────────────────────────────────────────
section("22. Saves, follows and the feed reach the server");

check("a save is a set of ids, not a flag written onto the listing",
  /export async function toggleSaved/.test(repoSrc) &&
  !/updateItem\(id, \{ saved/.test(repoSrc));
check("saves go to lili_saves", /remote\.toggleSave/.test(repoSrc) && /remote\.getSaved/.test(repoSrc));
check("follows go to lili_follows", /remote\.toggleFollow/.test(repoSrc));
check("following is read from the server too", /remote\.getFollowing/.test(repoSrc));
// v2.9: this used to count occurrences of the derivation expression, which was
// only ever a proxy for "there is one of it". Search results can now arrive
// straight from the server for listings this device has never held, so there
// are two call sites — and the right invariant is that they call the same
// function, not that the expression appears once.
check("there is exactly one place the heart is decided",
  (market.match(/function withHeart/g) || []).length === 1 &&
  !/\.map\(i ?=> ?\(savedIds\.includes/.test(market) &&
  (market.match(/withHeart\(/g) || []).length === 3);
check("the saved set is seeded at bootstrap, so the store and the screen agree",
  /setJSON\(K\.saved, stamped\.filter/.test(repoSrc));
check("a refused save puts the heart back rather than lying",
  /setSavedIds\(before\)/.test(market));
check("the feed subscribes to live changes", /repo\.watchItems/.test(market) &&
  /remote\.watchItems/.test(repoSrc));
check("the subscription is torn down", /if \(off\) off\(\);/.test(market));


// ─────────────────────────────────────────────────────────────────────────────
section("23. What lili charges");
// Benchmarks: Vestiaire 25/20/18/15/12% by band, Grailed 9% (6% under $120),
// Mercari 10%, Whatnot 8%, Vinted and Depop 0% seller + a buyer-paid fee.
// UAE card processing ~2.5-2.9% + ~AED 1 (Telr, Network International, Stripe,
// Tap), which is why a flat rate does not work at both ends of this catalogue.

const { breakdown, COMMISSION_BANDS, MINIMUM_FEE, VAT, COLLECTION_LIVE,
        SCHEDULE_VERSION, commissionRate } = await import("./src/data/fees.js");

check("every band sits inside the 6-10% the business asked for",
  COMMISSION_BANDS.every((b) => b.rate >= 0.06 && b.rate <= 0.10));
check("the rate falls as the price rises, the way this market prices it",
  COMMISSION_BANDS.every((b, i, a) => i === 0 || b.rate <= a[i - 1].rate));
check("a AED 260 abaya pays the top band", commissionRate(260) === 0.10);
check("a AED 40,000 Birkin pays the bottom band", commissionRate(40000) === 0.06);
check("the blended rate on a realistic catalogue lands in range", (() => {
  const cat = [260, 480, 800, 1250, 1500, 1650, 1800, 3200, 8200, 12900];
  const gross = cat.reduce((a, p) => a + p, 0);
  const fee = cat.reduce((a, p) => a + breakdown(p).commission, 0);
  const rate = fee / gross;
  return rate >= 0.06 && rate <= 0.10;
})());
check("commission never exceeds the sale", breakdown(10).commission <= 10);
check("the minimum never bites a listable item — the AED 200 floor clears it",
  breakdown(200).minimumApplied === false && MINIMUM_FEE < 200 * 0.10 + 0.01);
check("every price leaves lili a positive margin after card processing",
  [200, 260, 500, 1000, 5000, 15000, 40000].every((p) => breakdown(p).marginEstimate > 0));
check("VAT is inclusive, so the number she sees is the number she pays",
  VAT.inclusive === true &&
  Math.abs(breakdown(1000).commission - (breakdown(1000).commissionExVat + breakdown(1000).vat)) < 0.01);
check("the schedule is versioned, so a sale can be priced by the rules in force",
  typeof SCHEDULE_VERSION === "string" && SCHEDULE_VERSION.length >= 8);
check("nothing is collected until there is a processor", COLLECTION_LIVE === false);

section("24. One fee, stated once");

check("the buyer-side '+ 8-10% LILI fee' is gone",
  !/8-10% LILI fee/.test(market));
check("the flat 10% typed into the sell flow is gone",
  !/lili takes <b[^>]*>10%/.test(market) && !/\* *0\.9\)/.test(market));
check("the payout box reads from the fee module", /fees\.breakdown\(price\)/.test(market));
check("it leads with what she receives, not with the deduction",
  market.indexOf("You receive") < market.indexOf("lili's fee"));
check("it says plainly that nothing is deducted yet",
  /Nothing is deducted yet/.test(market));
check("an accepted offer shows the seller her net",
  /fees\.breakdown\(o\.amount\)/.test(stripComments(read("./src/offers/OffersPage.jsx"))));

section("25. Price drops reach the people who saved");

check("the Saved price-drop tab filters on something real",
  !/i\.priceDrop/.test(market) && /previous_price/.test(market));
check("previous_price is server-owned, so a discount cannot be invented",
  /"previous_price","price_changed_at"/.test(remoteSrc));
check("the saved screens read the derived heart, not the raw items",
  /<SavedPage items=\{visibleItems\}/.test(market) &&
  /<ProfilePage myShop=\{myShop\} items=\{visibleItems\}/.test(market));
check("notification icons match the kinds the database actually writes",
  /price_drop: "tag"/.test(notifSrc) && /moderation_outcome/.test(notifSrc));

// ─────────────────────────────────────────────────────────────────────────────
//  v2.9 — DISCOVERY, HONESTY AND THE FUNNEL
// ─────────────────────────────────────────────────────────────────────────────

const { fold, tokens: words, editDistance, fuzzyIncludes, tolerance } =
  await import("./src/discovery/text.js");
const { searchLocal, scoreItem, diagnose, suggestions, SEED_TERMS, hydrate, termCount } =
  await import("./src/discovery/search.js");
const { matchesFilters, activeCount, EMPTY_FILTERS } =
  await import("./src/discovery/filters.js");
const { applySort, availableSorts, canSort, isNewArrival, affinityOrder,
        tasteLabel, SORT_OPTIONS, NEW_DAYS } =
  await import("./src/discovery/ranking.js");
const { termIsCollectable, EVENTS } = await import("./src/analytics/funnel.js");
const { HOW_MONEY_WORKS, PAYMENTS_LIVE, SHIPPING: SHIP } =
  await import("./src/compliance/sellerRules.js");

const CAT = [
  { id:1, title:"Chanel Classic Flap Bag", titleAr:"شنطة شانيل كلاسيك فلاب", brand:"Chanel",
    category:"Luxury", condition:"Excellent", size:"OS", price:12900, era:"Modern",
    desc:"Beige lambskin, gold hardware, dust bag and card." },
  { id:2, title:"Linen Abaya", titleAr:"عباية كتان", brand:"Local Designer",
    category:"Abayas", condition:"Like New", size:"M", price:260, era:"Modern",
    desc:"Warm white linen, worn once." },
  { id:3, title:"Hermès Twilly", titleAr:"تويلي هيرمس", brand:"Hermès",
    category:"Accessories", condition:"Excellent", size:"OS", price:600, era:"Modern",
    desc:"Silk, in its box." },
  { id:4, title:"Gianvito Rossi Heels", titleAr:"كعب جيانفيتو روسي", brand:"Gianvito Rossi",
    category:"Shoes", condition:"Good", size:"38", price:1500, era:"Modern", desc:"Nude pumps." },
];

section("26. Spelling is folded before anything is compared");

check("Latin accents fold, so Hermes finds Hermès",
  fold("Hermès") === fold("Hermes"));
check("Arabic tashkeel is removed",
  fold("عَبَايَة") === fold("عباية"));
// Hammo et al. 2008: folding آ أ إ to ا collapses an Arabic index by ~22.6%,
// which is the measure of how many spellings of one word were kept apart.
check("the alef family folds to one letter",
  fold("أحذية") === fold("احذية") && fold("إبرة") === fold("ابرة"));
check("ta marbuta folds, so عباية and عبايه are one word",
  fold("عباية") === fold("عبايه"));
check("tatweel is a typographic stretch, not a letter",
  fold("عبــاية") === fold("عباية"));
check("Arabic-Indic digits become the digits the sizes are stored in",
  fold("٣٨") === "38");
check("tokens split on punctuation, in both scripts",
  words("chanel, classic-flap!").join("|") === "chanel|classic|flap");

section("27. Spelling tolerance is earned by length, not given away");

check("three letters get no tolerance — 'bag' must not match 'bar'",
  tolerance("bag") === 0 && !fuzzyIncludes(["bar"], "bag"));
check("a six-letter word gets one edit", tolerance("abayaa") === 1);
check("a long word gets two", tolerance("jacquemus") === 2);
check("a real typo is forgiven", fuzzyIncludes(words("Jacquemus"), "jaquemus") === "close");
check("the distance function bails out instead of scanning the whole catalogue",
  editDistance("a".repeat(40), "b".repeat(40), 2) === 3);
check("a prefix counts as exact — she is still typing",
  fuzzyIncludes(words("Linen Abaya"), "abay") === "exact");

section("28. The searches that returned nothing before");

check("عباية finds the Linen Abaya — the whole reason titleAr exists",
  searchLocal(CAT, "عباية").some(i => i.id === 2));
check("'abaya' in English finds it too, through the garment vocabulary",
  searchLocal(CAT, "abaya").some(i => i.id === 2));
check("'Hermes' without the accent finds Hermès",
  searchLocal(CAT, "Hermes").some(i => i.id === 3));
check("two words are two conditions, not one substring",
  searchLocal(CAT, "chanel bag").some(i => i.id === 1));
check("both words must land — 'chanel heels' matches neither piece",
  searchLocal(CAT, "chanel heels").length === 0);
// حقيبة appears nowhere in the Chanel listing; it reaches it only through the
// garment vocabulary, and that is what the label has to say.
check("a match through the other language is labelled as one",
  (searchLocal(CAT, "حقيبة").find(i => i.id === 1) || {}).matchKind === "translated");
check("a brand hit outranks a description hit",
  searchLocal(CAT, "silk")[0].id === 3);
check("the vocabulary is a seed, not the source — the server can replace it",
  hydrate([{ english:"kandura", arabic:"كندورة", aliases:[] }]) === true &&
  termCount() === 1 && hydrate(SEED_TERMS) === true && termCount() === SEED_TERMS.length);

section("29. A search that finds nothing offers a way out");

const d = diagnose(CAT, "chanel heels");
check("it names the word that killed the search",
  !!d && (d.drop === "chanel" || d.drop === "heels"));
check("and says how many the rest of her query would have found",
  !!d && d.count > 0);
check("suggestions are drawn from stock, never hardcoded",
  suggestions(CAT, "xyz").every(s => CAT.some(i => i.brand === s || i.category === s)));
check("nothing is suggested from an empty catalogue",
  suggestions([], "chanel").length === 0);

{
  const { canonicalBrand } = await import("./src/discovery/text.js");
  const A = ["Hermès","Zimmermann","Tiffany & Co","Chloé","Celine","Self Portrait","Dior"];
  check("a brand typed any way is the approved spelling",
    canonicalBrand("hermes", A) === "Hermès" && canonicalBrand(" ZIMMERMANN ", A) === "Zimmermann"
    && canonicalBrand("tiffany and co", A) === "Tiffany & Co" && canonicalBrand("self-portrait", A) === "Self Portrait");
  check("one slip in a long brand name is corrected",
    canonicalBrand("Zimmerman", A) === "Zimmermann" && canonicalBrand("Celinee", A) === "Celine");
  check("an unknown designer is kept as written, not 'corrected' into a known one",
    canonicalBrand("Dina Couture", A) === "Dina Couture" && canonicalBrand("Dio", A) === "Dio" && canonicalBrand("", A) === "");
}

{
  const { applyLivePatches } = await import("./src/data/repo.js");
  const held = [
    { id:"a", status:"live", title:"A", created_at:"2026-10-01" },
    { id:"b", status:"live", title:"B", created_at:"2026-10-02" },
    { id:"p", pending:true, title:"Mine, unsent", created_at:"2026-10-03" },
  ];
  const out = applyLivePatches(held, [
    { id:"c", row:{ id:"c", status:"live", title:"C", created_at:"2026-10-04" } },   // new piece
    { id:"a", row:{ id:"a", status:"live", title:"A", saves:3, created_at:"2026-10-01" } }, // a save
    { id:"b", row:{ id:"b", status:"sold", owner_uid:"someone", created_at:"2026-10-02" } }, // sold
    { id:"p", row:{ id:"p", status:"in_review", owner_uid:"someone" } },              // echo of hers
  ], "me");
  check("a live change is applied in place, not refetched: new piece first, save counted, sold one gone",
    out.map(i=>i.id).join(",") === "c,p,a" && out.find(i=>i.id==="a").saves === 3);
  check("her own piece stays in her list when it leaves the feed",
    applyLivePatches([{ id:"m", status:"live", owner_uid:"me" }],
      [{ id:"m", row:{ id:"m", status:"in_review", owner_uid:"me" } }], "me")[0].status === "in_review");
  check("a deleted piece leaves the list",
    applyLivePatches([{ id:"x", status:"live" }], [{ id:"x", row:null, deleted:true }], "me").length === 0);
}

section("30. Every control in the filter sheet does something");

check("size filters, having been stored and read by nothing",
  matchesFilters(CAT[3], { size:"38" }) && !matchesFilters(CAT[1], { size:"38" }));
{
  const S = { size:"S", fit:"small", flaws:[] }, M = { size:"M", fit:"true", flaws:["pilling"] },
        OS = { size:"OS" }, NONE = { size:"S" };
  check("'My sizes' keeps her sizes and one-size pieces, and drops the rest",
    matchesFilters(S, { sizes:["S","38"] }) && matchesFilters(OS, { sizes:["S"] }) && !matchesFilters(M, { sizes:["S"] }));
  check("'My sizes' off filters nothing", matchesFilters(M, { sizes:[] }) && matchesFilters(M, EMPTY_FILTERS));
  check("fit filters on how the seller said it runs",
    matchesFilters(S, { fit:"small" }) && !matchesFilters(M, { fit:"small" }) && !matchesFilters(NONE, { fit:"small" }));
  check("'no flaws' means the seller said none — not that she didn't answer",
    matchesFilters(S, { noFlaws:true }) && !matchesFilters(M, { noFlaws:true }) && !matchesFilters(NONE, { noFlaws:true }));
  check("the new filters count as active", activeCount({ ...EMPTY_FILTERS, sizes:["S"], fit:"true", noFlaws:true }) === 3);
}
check("colour is gone rather than left filtering a field nobody fills",
  !/local\.color/.test(market) && !("color" in EMPTY_FILTERS));
check("the heavy passes are memoised, not redone on every keystroke",
  /const shown = useMemo/.test(market) && /const local = useMemo/.test(market) &&
  /const results = useMemo/.test(market));
check("the draft is written on a pause, not on every character typed",
  /setTimeout\(\(\) => \{\n\s*repo\.saveDraft/.test(market));
check("the count on the button uses the predicate that draws the grid",
  /matchesFilters\(i,local\)/.test(market) && /matchesFilters\(i,filters\)/.test(market));
check("price low-to-high actually sorts",
  applySort(CAT, "Price: Low to High").map(i => i.price)[0] === 260);
check("price high-to-low actually sorts",
  applySort(CAT, "Price: High to Low").map(i => i.price)[0] === 12900);
check("'Most Saved' is hidden when no save totals exist, not shown sorting by zero",
  !availableSorts(CAT).includes("Most Saved") &&
  availableSorts(CAT.map(i => ({ ...i, saves: 0 }))).includes("Most Saved"));
check("a search result set keeps its relevance order by default",
  applySort([{ id:9, price:1 }, { id:8, price:2 }], "Newest First", { relevance:true })[0].id === 9);
check("the save count is server-owned, so it cannot be inflated",
  /"saves"\]/.test(remoteSrc) || /,\s*"saves"/.test(remoteSrc));

section("31. New In is derived, not asserted");

const now = Date.now();
check("a piece listed today is new",
  isNewArrival({ created_at: new Date(now - 3600e3).toISOString() }, now));
check("a piece listed two months ago is not — isNew never expired",
  !isNewArrival({ created_at: new Date(now - 60 * 86400e3).toISOString() }, now));
check("the window is stated once, in days", NEW_DAYS >= 7 && NEW_DAYS <= 30);
check("no timestamp means not new — guessing yes is what the old boolean did",
  !isNewArrival({ isNew: true }) && !isNewArrival({}));
check("the strip renders nothing rather than a heading over an empty row",
  /if \(!newItems\.length\) return null;/.test(market));
check("no seed listing carries a hand-written isNew or hasStory any more",
  !/isNew:(true|false)/.test(market) && !/hasStory:/.test(market));
check("the NEW badge and the New In strip agree on what new means",
  /isNewArrival\(item\)/.test(market) && !/item\.isNew/.test(market));
check("the demo catalogue is stamped when it lands, so 'New In' can expire",
  /created_at: new Date\(now - n \* 3600e3\)/.test(repoSrc));
check("the client no longer publishes an invented colour on every listing",
  !/color:"#E8C4B8",icon:"dress",\n?\s*\/\/ every photo/.test(market) &&
  /icon:ICON_FOR_CAT\[form\.category\]/.test(market) &&
  !/color:"#E8C4B8",icon:"dress",$/m.test(market));
check("the placeholder icon follows the category she chose",
  /ICON_FOR_CAT\[form\.category\]/.test(market));
check("her provenance answer is sent, not just previewed",
  /authenticated: auth==="own"/.test(market));

section("32. 'For You' means something, or it does not say it");

const taste = { categories: ["Abayas"] };
check("the questionnaire's answer reaches the feed",
  affinityOrder(CAT, taste)[0].category === "Abayas");
check("nothing is hidden — reordering only",
  affinityOrder(CAT, taste).length === CAT.length);
check("'Vintage' is an era, and is matched as one",
  affinityOrder(CAT, { categories:["Modern"] })[0].era === "Modern");
check("with no consent the feed is untouched",
  affinityOrder(CAT, taste, { enabled:false })[0].id === CAT[0].id);
// An explicit choice beats an implicit one: she picked the sort just now, on
// purpose; she picked the taste ten seconds into her first launch.
check("an explicit sort is not overridden by taste",
  affinityOrder(applySort(CAT, "Price: Low to High"), taste,
    { sort:"Price: Low to High" })[0].price === 260 &&
  affinityOrder(applySort(CAT, "Price: High to Low"), taste,
    { sort:"Price: High to Low" })[0].price === 12900);
check("the header cannot claim curation it did not do",
  tasteLabel(null) === null && tasteLabel(taste, { enabled:false }) === null &&
  tasteLabel(taste) === "Abayas");
check("the splash hands the answer up instead of discarding it",
  /onDone\(picked\)/.test(market) && !/onClick=\{onDone\} style=\{\{background:picked/.test(market));
check("the taste is editable after the ten seconds in which it was asked",
  /function TasteSheet/.test(market));

section("33. What the app promises about money is what is true");

check("the plan and the present tense are separated by a flag",
  PAYMENTS_LIVE === false && HOW_MONEY_WORKS.live === false);
check("no refund is promised while there is nothing to refund",
  HOW_MONEY_WORKS.refundFromLili === false &&
  /doesn't hold your money|does not hold your money|not hold your money/i.test(HOW_MONEY_WORKS.short + HOW_MONEY_WORKS.liliRole + HOW_MONEY_WORKS.ifWrong) === false
    ? /pay her directly|pay her in person|directly when you meet/i.test(HOW_MONEY_WORKS.short) : true);
check("shipping is marked as not built rather than described as working",
  SHIP.live === false);
const helpSrc = stripComments(read("./src/HelpCentre.jsx"));
const agreeSrc = stripComments(read("./src/compliance/agreements.js"));
const legalSrc = stripComments(read("./src/compliance/LegalCenter.jsx"));
check("Help Centre no longer says lili holds the payment",
  !/hold the payment/i.test(helpSrc));
check("the acknowledgement she signs no longer says it either",
  !/hold the payment/i.test(agreeSrc));
check("Legal Centre reads the one source instead of narrating the plan",
  !/hold the payment until the item lands/i.test(legalSrc) &&
  /HOW_MONEY_WORKS/.test(legalSrc));
check("'You get your money back' is gone",
  !/You get your money back/i.test(helpSrc));
check("the flat 10% in the Help Centre is gone too",
  !/lili takes 10%/i.test(helpSrc));
check("the splash no longer promises secure payments or fast delivery",
  !/Secure Payments/.test(market) && !/Fast Delivery/.test(market) &&
  !/Authentic & Verified/.test(market));
check("the consent sheet no longer says we hold the payment safe",
  !/hold the payment safe/i.test(providerSrc));

section("34. The funnel is consented, minimal and erasable");

check("consent for analytics finally switches something on",
  /funnel\.enable\(!!\(savedConsent && savedConsent\.analytics\)\)/.test(providerSrc));
check("changing the answer applies immediately",
  /await funnel\.enable\(!!value\.analytics\)/.test(providerSrc));
check("withdrawal erases rather than merely stopping collection",
  /funnel\.enable\(false\)/.test(providerSrc) && /eraseMyEvents/.test(remoteSrc));
check("a search term carrying digits is never collected",
  !termIsCollectable("0501234567") && !termIsCollectable("chanel 0501234567"));
check("nor one carrying an email",
  !termIsCollectable("me@example.com"));
check("nor a sentence long enough to be about her",
  !termIsCollectable("x".repeat(41)));
check("an ordinary query is", termIsCollectable("black abaya"));
// The hole this closed: JavaScript's \d is ASCII-only, so a Dubai mobile typed
// on an Arabic keyboard walked straight through the rule written to stop it.
check("a phone number in Arabic-Indic digits is caught, not just an ASCII one",
  !termIsCollectable("٠٥٠١٢٣٤٥٦٧") && !termIsCollectable("۰۵۰۱۲۳۴۵۶۷"));
check("an Arabic query with no digits is still collectable",
  termIsCollectable("عباية سوداء"));
check("the queue is sent before the app goes away, not on next launch",
  /visibilitychange/.test(read("./src/analytics/funnel.js")) &&
  /pagehide/.test(read("./src/analytics/funnel.js")));
check("the event names are an enumerable list, not scattered strings",
  Object.keys(EVENTS).length >= 15 && EVENTS.SEARCH_EMPTY === "search_empty");
check("no third-party analytics SDK was added",
  !/posthog|amplitude|mixpanel|segment|firebase\/analytics|gtag/i.test(
    read("./package.json")));

section("35. Nothing renders a bare grid where a catalogue should be");

// v2.9.2: this string moved into the dictionary when the bilingual labels were
// split, so grepping the component for the English no longer finds it. The
// stronger assertion is that the key is used AND the string exists — a grep for
// a literal would keep passing if the key were renamed to one that does not.
const { STRINGS: DICT } = await import("./src/i18n/strings.js");
const usesKey = (k) => new RegExp(`t\\("${k}"\\)`).test(market) && !!DICT[k];
check("the sellers page says something when there are no shops",
  usesKey("no_shops_open_yet"));
check("a shop with nothing listed says so",
  /hasn't listed anything yet/.test(market));
check("stories belonging to shops that do not exist are not drawn",
  /filter\(x=>!!x\.shop\)/.test(market));
check("the home feed tells an empty catalogue from filters set too tight",
  /Nothing matches those filters/.test(market) && /Nothing here yet/.test(market));
check("skeletons and 'nothing found' no longer render at the same time",
  /!showingSkeletons && shown\.length===0/.test(market));
check("a category tile carries the count behind it",
  /none yet/.test(market) && /cat\.count===0/.test(market));
check("the invite screen takes the code instead of telling her to quit the app",
  /function InviteBox/.test(market) && !/Close the app and reopen it/.test(market));

section("36. A half-written listing survives a wrong tap");

check("the draft is kept on the device", /saveDraft/.test(repoSrc) && /getDraft/.test(repoSrc));
check("it is cleared once the piece is actually published",
  /clearDraft\(\)/.test(market));
check("it expires rather than accumulating forever", /DRAFT_TTL_MS/.test(repoSrc));
check("it never leaves the phone — it is not a listing until she says so",
  !/lili_drafts/.test(remoteSrc));
check("publishing says what is missing instead of doing nothing",
  /Still needed:/.test(market) && /missing\.length>0/.test(market));
check("'skip authentication' clears the claim it is skipping",
  /setAuth\(null\);submit\(\)/.test(market));

// ─────────────────────────────────────────────────────────────────────────────
//  v2.9.1 — LAUNCH, SELLERS, THE FUNNEL READ BACK, AND THE MEET
// ─────────────────────────────────────────────────────────────────────────────

const preflightSrc = stripComments(read("./preflight.mjs"));
const funnelReadSrc = stripComments(read("./funnel.mjs"));
const bulkSrc = stripComments(read("./src/sell/BulkList.jsx"));
const rosterSrc = stripComments(read("./src/invites/InviteRoster.jsx"));
const meetSrc = stripComments(read("./src/meet/MeetPlan.jsx"));
const placesRaw = read("./src/meet/places.js");
const pkgScripts = JSON.parse(read("./package.json")).scripts;

section("37. The things that are not in the source tree");

check("there is a preflight, and verify runs it",
  !!pkgScripts.preflight && /preflight/.test(pkgScripts.verify));
check("it checks the app can get a session at all",
  /signInAnonymously/.test(preflightSrc));
check("it checks somebody can answer a report",
  /moderator/.test(preflightSrc));
check("it checks an invitation exists to give anyone",
  /lili_invites/.test(preflightSrc));
check("it checks photographs have somewhere to go",
  /storage\.from\(BUCKET\)|photo bucket/.test(preflightSrc));
check("it checks anon cannot read what anon must not read",
  /lili_saves/.test(preflightSrc) && /lili_events/.test(preflightSrc));
check("it fails loudly rather than warning",
  /process\.exit\(1\)/.test(preflightSrc) && /Do not ship/.test(preflightSrc));
check("it will not let a payments claim get ahead of a payments rail",
  /PAYMENTS_LIVE/.test(preflightSrc) && /COLLECTION_LIVE/.test(preflightSrc));

section("38. Listing a wardrobe, not a piece");

check("several pieces can be listed in one pass", /function BulkList/.test(bulkSrc));
check("it is the same publish path, not a second one",
  /onPublish\(/.test(bulkSrc) && !/lili_items/.test(bulkSrc));
check("photographs go through the same EXIF-stripping pipeline",
  /processImage/.test(bulkSrc) && /LIMITS\.thumbDimension/.test(bulkSrc));
check("screening runs per piece before anything is sent",
  /screenListing\(/.test(bulkSrc) && /verdict === "block"/.test(bulkSrc));
check("each row reports its own outcome — the v2.8 lesson",
  /state: "failed"/.test(bulkSrc) && /"review" : "live"/.test(bulkSrc) &&
  /state: "blocked"/.test(bulkSrc));
check("uploads are sequential, not eight at once on mobile data",
  /for \(const row of ready\)/.test(bulkSrc) && !/Promise\.all\(ready/.test(bulkSrc));
check("nothing about the piece is guessed for her",
  !/inferTitle|guessBrand|autoPrice|suggestedTitle/.test(bulkSrc));
check("she is shown what she receives before she lists",
  /fees\.breakdown\(price\)/.test(bulkSrc));

section("39. The beta roster, and the number that matters");

check("invitations can be minted without a SQL console",
  /mintInvites/.test(remoteSrc) && /mintInvites/.test(rosterSrc));
check("the roster shows who actually listed, not just who redeemed",
  /listings/.test(rosterSrc) && /actually listed/.test(rosterSrc));
check("the gap between redeemed and listed is said out loud",
  /a code is not a seller/.test(rosterSrc));
check("minting is refused by the database, not hidden by the client",
  // The screen has no permission logic of its own — it calls the RPC and shows
  // what the RPC said. The moderator check lives in lili_mint_invites.
  !/isModerator|canMint|if \(!admin/.test(rosterSrc) &&
  /denied/.test(rosterSrc));
check("a non-moderator is told, not shown an empty screen",
  /isn't a moderator/.test(rosterSrc));

section("40. The funnel, read back");

check("reading it needs a key that is not in this repository",
  /SUPABASE_SERVICE_KEY/.test(funnelReadSrc) && !/eyJ[A-Za-z0-9_-]{20,}/.test(funnelReadSrc));
check("without the key it explains why rather than failing",
  /no SELECT policy/.test(funnelReadSrc));
check("the questions are views, so they mean one thing",
  /lili_funnel/.test(funnelReadSrc) && /lili_missing_demand/.test(funnelReadSrc));
check("it says what an empty result actually means",
  /consent is off|Analytics consent is off|opt-in/i.test(funnelReadSrc));
check("it warns that opt-in consent makes the counts partial",
  /not everyone/i.test(funnelReadSrc));

section("41. The meet is a thing that happens, not advice on a sheet");

check("a meet plan lives in the conversation", /function MeetPlan/.test(meetSrc));
check("one side proposes and the other confirms",
  /proposeMeet/.test(remoteSrc) && /answerMeet/.test(remoteSrc));
check("there is a check-in afterwards", /checkInMeet/.test(remoteSrc));
check("'something felt wrong' reaches the report path, not a counter",
  /felt_wrong/.test(meetSrc) && /onReport/.test(meetSrc));
// The most important assertion in this section. There is no Dubai Police
// safe-exchange-zone programme; a badge implying one would be the most
// dangerous fabrication this codebase could contain.
// Asserted against the code and the strings, not the commentary — the
// commentary is where the absence of a Dubai scheme is explained at length, and
// an honesty grep that trips over its own explanation is the bug this suite
// already caught itself making once (see stripComments).
check("no location is claimed to be verified, approved or supervised",
  !/police[- ]?(approved|verified|checked)/i.test(stripComments(placesRaw) + meetSrc) &&
  !/safe exchange zone/i.test(meetSrc) &&
  /not verified or supervised/.test(meetSrc));
check("and the reason there is no such badge is written down where it is decided",
  /no such programme in Dubai/i.test(placesRaw) &&
  /most dangerous fabrication/i.test(placesRaw));
check("and the app says so where she is choosing one",
  /no approved-location scheme in Dubai/.test(meetSrc));
check("places are kinds of place, not addresses that go stale",
  !/Dubai Mall|Mall of the Emirates|Ibn Battuta|City Walk/i.test(placesRaw));
check("the places to refuse are named, because the ask is the signal",
  /AVOID/.test(placesRaw) && /Being asked to come inside is itself the signal/.test(placesRaw));
check("help that is not lili is offered first for danger",
  /999/.test(placesRaw) && /ecrime\.ae/.test(placesRaw) &&
  /lili can close a shop, and that is all it can do/.test(meetSrc));
check("no location tracking of any kind",
  !/geolocation|watchPosition|getCurrentPosition|latitude|longitude/i.test(placesRaw + meetSrc));
check("the meet's notification kinds were added to the CHECK, not worked around",
  /meet_proposed: "handshake"/.test(notifSrc));

// ─────────────────────────────────────────────────────────────────────────────
//  v2.9.2 — THE FOUR BUGS, THE BUNDLE, THE PHOTOGRAPHS, AND ARABIC
// ─────────────────────────────────────────────────────────────────────────────

const imagesSrc  = stripComments(read("./src/data/images.js"));
const iqSrc      = stripComments(read("./src/data/imageQuality.js"));
const dirSrc     = stripComments(read("./src/i18n/direction.js"));
const dirRaw     = read("./src/i18n/direction.js");
const langsRaw   = read("./src/i18n/languages.js");
const pickerSrc  = stripComments(read("./src/i18n/LanguagePicker.jsx"));
const uiSrc      = stripComments(read("./src/compliance/ui.js"));
const legalSrc2  = stripComments(read("./src/compliance/LegalCenter.jsx"));
const bulkSrc2   = stripComments(read("./src/sell/BulkList.jsx"));
const funnelSrc2 = stripComments(read("./src/analytics/funnel.js"));
const offersSrc2 = stripComments(read("./src/data/offers.js"));
const qualitySrc = read("./src/sell/listingQuality.js");
const vite       = read("./vite.config.js");

const { assess: assessPhoto, T: PT, measure: measurePhoto } =
  await import("./src/data/imageQuality.js");
const { money, backArrow, alignStart, shiftEnd, setDir, isRTL } =
  await import("./src/i18n/direction.js");
const { scoreListing: scoreL } = await import("./src/sell/listingQuality.js");
const { hoursLeft } = await import("./src/data/offers.js");

section("42. The catalogue actually arrives");

check("something fetches items and shops from the server",
  /export async function refreshCatalogue/.test(repoSrc) &&
  /remote\.getItems\(\), remote\.getShops\(\)/.test(repoSrc));
check("it is called at boot and again on sign-in",
  (market.match(/repo\.refreshCatalogue\(\)/g) || []).length >= 2);
check("shops are set from it — they were never fetched at all",
  /setShops\(c\.shops\)/.test(market));
check("the demo catalogue retires once this device has seen the real one",
  /demoRetired/.test(repoSrc));
check("a listing written offline is not wiped by the next live update",
  /export async function mergeLive/.test(repoSrc) && /filter\(isPending\)/.test(repoSrc));
check("a failed refresh keeps the device copy rather than blanking the screen",
  /keeping the device copy|return null;/.test(repoSrc));
check("an unresolvable seller is stated, not hidden",
  /can't load this seller's shop/.test(market));

section("43. Deletion deletes, and export exports");

check("deletion calls the database, not a local audit line",
  /eraseMe/.test(remoteSrc) && /remote\.eraseMe\(\)/.test(legalSrc2));
check("the device is actually cleared — repo.reset had no callers",
  /repo\.reset\(\)/.test(legalSrc2));
check("she is shown what was NOT deleted, and why",
  /kept/.test(legalSrc2) && /moderation record/.test(legalSrc2));
check("messages are redacted rather than removed, and it says so",
  /changed, not removed/.test(legalSrc2));
check("a failed erasure says nothing was deleted",
  /Nothing was deleted/.test(legalSrc2));
check("export asks the server as well as the phone",
  /remote\.exportMe\(\)/.test(legalSrc2) && /on_this_device/.test(legalSrc2));
check("the dead half-implementation was removed, not left to rot",
  !/export async function exportUserData/.test(repoSrc));
check("'My reports' asks for HER cases, not the whole queue",
  /myReports/.test(legalSrc2) && /export async function myReports/.test(stripComments(read("./src/compliance/moderation.js"))));

section("44. The invite gate, and the limits that were nowhere");

// Code length is a database fact, not a source one — migration
// lili_invite_hardening widens LILI-XXXX (~614k combinations) to
// LILI-XXXX-XXXX (~3.8e11) and puts a ten-an-hour counter in front of the
// door. preflight.mjs is where a live claim belongs; asserting it here would
// be a check that passes whatever the database says.
check("the client knows the reasons the server actually returns",
  /already_used/.test(market) && /needs_real_account/.test(market) &&
  /too_many_tries/.test(market) && !/needs_account:/.test(market));
check("a rate-limited action is recognised rather than shown as a timeout",
  /isRateLimited/.test(read("./src/ux/timeout.js")));
check("a refused report is not reported to her as saved",
  /isDuplicate\(e\) \|\| isRateLimited\(e\)/.test(reportSrc) && /sent\.refusal/.test(reportSrc));

section("45. Offers: the crash, and expiry that means something");

check("the i.offers spread that threw on every real listing is gone",
  !/offers:\[\.\.\.i\.offers/.test(market));
check("an offer with no usable timestamp is treated as lapsed, not fresh",
  hoursLeft({ state: "pending" }) === 0);
check("expiry prefers the server's expires_at over a guess",
  /offer\.expires_at/.test(offersSrc2));
check("the device path refuses a lapsed offer the way the server does",
  /That offer expired/.test(offersSrc2));
check("withdrawing is still allowed after expiry — it is her own offer",
  /state !== "withdrawn"/.test(offersSrc2));

section("46. The bundle");

check("there is code splitting at all", /lazy\(\(\) => import/.test(market));
check("the compliance barrel no longer drags LegalCenter into the first paint",
  !/import \{ useCompliance, ReportDialog, LegalCenter/.test(market));
check("moderator-only screens are not in every shopper's first chunk",
  /lazy\(\(\) => import\("\.\/ModerationQueue/.test(legalSrc2) &&
  /lazy\(\(\) => import\("\.\.\/invites\/InviteRoster/.test(legalSrc2));
check("React is cached separately from the app that changes weekly",
  /manualChunks/.test(vite) && /react/.test(vite));
check("suspense boundaries exist so a sheet cannot blank the feed",
  /<Suspense fallback=\{null\}>/.test(market));

section("47. The photograph is looked at");

check("quality is measured on the canvas that already strips EXIF",
  /getImageData/.test(imagesSrc) && /measure\(/.test(imagesSrc));
check("only on the full-size pass, so one photograph gets one answer",
  /max === LIMITS\.maxDimension/.test(imagesSrc));
check("a canvas that cannot be read is not a listing that cannot be made",
  /quality = null/.test(imagesSrc));
check("nothing about the photograph leaves the phone",
  !/fetch\(|upload|api\./i.test(iqSrc));
check("every finding names a fix", assessPhoto({ sharpness: 1, mean: 20, darkPct: 0.9,
  blownPct: 0, fill: 0.5, portrait: true }).every((f) => f.fix && f.fix.length > 12));
check("at most two findings, so she is not buried",
  assessPhoto({ sharpness: 1, mean: 5, darkPct: 0.99, blownPct: 0, fill: 0.01, portrait: false }).length <= 2);
check("thresholds are calibrated by a suite, not chosen by eye",
  /imagequality/.test(JSON.parse(read("./package.json")).scripts.verify));
check("the coach shows what is wrong with HER picture",
  /findings/.test(stripComments(read("./src/sell/PhotoCoach.jsx"))));
check("and the batch flow does too — fifteen photographs go past too fast",
  /photoNote/.test(bulkSrc2));

section("48. Arabic: mirrored, measured, and honest about the rest");

check("direction is published so the tree re-renders — nothing did before",
  /export function setDir/.test(dirSrc) && /onDirChange/.test(market));
check("logical CSS is avoided because the target WebViews cannot do it",
  /chrome58|Chrome 87|logical properties/.test(dirRaw));
check("the chat bubble aligns by reading direction, not by physical side",
  !/marginLeft:!m\.mine\?8:0/.test(market));
check("the consent toggle knob moves toward the reading end",
  /shiftEnd\(18\)/.test(stripComments(read("./src/compliance/ComplianceProvider.jsx"))) &&
  /shiftEnd\(18\)/.test(legalSrc2));
check("back arrows point against the reading direction",
  /backArrow\(\)/.test(uiSrc) && /backArrow\(\)/.test(market));
check("the English title is no longer written into title_ar",
  !/titleAr:form\.titleAr\|\|form\.title/.test(market));
check("the Arabic title field is actually right-to-left",
  /dir=\{key==="titleAr" \? "rtl"/.test(market));
check("the bulk flow asks for an Arabic title too",
  /titleAr/.test(bulkSrc2) && /dir="rtl"/.test(bulkSrc2));
check("prices are formatted by one function that knows where the currency goes",
  /export function money/.test(dirSrc) && (market.match(/\{money\(/g) || []).length >= 8);
check("the funnel can tell an Arabic session from an English one",
  /lang: lang \|\| null/.test(funnelSrc2) && /LANGUAGE_SET/.test(funnelSrc2));

// The one that matters most: the app was penalising the sellers it most wants.
const arListing = { title: "عباية كتان", titleAr: "عباية كتان", brand: "Local Designer",
  category: "Abayas", condition: "Like New", price: 260,
  desc: "عباية كتان بحالة ممتازة. يوجد خدش صغير عند الكتف. المقاس M والطول 140 سم. معي الفاتورة الأصلية." };
const enListing = { ...arListing,
  desc: "Linen abaya in excellent condition. Small scratch at the shoulder. Size M, length 140 cm. I have the original receipt." };
check("an honest Arabic description scores the same as the same one in English",
  scoreL(arListing, ["a","b","c","d"]).score === scoreL(enListing, ["a","b","c","d"]).score,
  `${scoreL(arListing, ["a","b","c","d"]).score} vs ${scoreL(enListing, ["a","b","c","d"]).score}`);
check("the provenance, flaw and measurement checks all read Arabic",
  /فاتورة/.test(qualitySrc) && /خدش/.test(qualitySrc) && /مقاس/.test(qualitySrc));

check("Arabic is not claimed to be finished when it is a quarter finished",
  /code: "ar"[\s\S]{0,900}?status: "partial"/.test(langsRaw));
check("and the picker says so on the row she is about to tap",
  /partly translated/.test(pickerSrc));

// money() must actually change with direction, not merely exist
setDir("rtl");
const arMoney = money(12900), arBack = backArrow(), arAlign = alignStart(), arShift = shiftEnd(18);
setDir("ltr");
const enMoney = money(12900), enBack = backArrow(), enAlign = alignStart(), enShift = shiftEnd(18);
check("money puts the currency where the language puts it",
  /درهم/.test(arMoney) && /^AED/.test(enMoney), `${arMoney}  |  ${enMoney}`);
check("the back arrow, the alignment and the toggle all flip",
  arBack !== enBack && arAlign !== enAlign && arShift !== enShift,
  `${arBack}/${enBack} ${arAlign}/${enAlign}`);

section("49. The basket could not be a checkout");

const cartRegion = market.slice(market.indexOf("function CartPage"),
                               market.indexOf("function CartPage") + 6000);
check("nothing claims lili holds her money at the moment she commits",
  !/hold your payment|holds the payment/i.test(cartRegion));
check("no refund is promised", !/get your money back/i.test(cartRegion));
check("no payment methods are offered that do not exist",
  !/Cash on Delivery|Bank Transfer/i.test(cartRegion));
check("there is no checkout button that only sets a boolean",
  !/setCheckedOut/.test(market));
check("and no 'Order placed' for an order nobody was told about",
  !/Order placed/i.test(market) && !/seller has been notified/i.test(market));
check("the buyer is not charged a fee that is the seller's, at a rate that is not the rate",
  !/subtotal \* 0\.09/.test(market));
check("it says what it is, before she reads a price",
  /this_is_a_list_not_a_basket/.test(market) && /HOW_MONEY_WORKS\.short/.test(cartRegion));
check("it opens the conversation, which is the thing that works",
  /onMessageSeller/.test(market) && /messageSellerAbout/.test(market));
check("quantity is gone — a listing is one specific second-hand piece",
  !/updateQty/.test(market) && !/qty: ci\.qty \+ 1/.test(market));
check("starting a conversation is one handler, not two copies",
  (market.match(/const messageSellerAbout/g) || []).length === 1 &&
  (market.match(/msgs:\s*\[\{ from: "buyer"/g) || []).length <= 1);

const agreeSrc2 = stripComments(read("./src/compliance/agreements.js"));
check("the seller agreement no longer has her sign for an escrow that is not there",
  !/holds the payment until delivery/.test(agreeSrc2));
check("and no longer commits her to a dispatch she cannot perform",
  !/dispatch it within 3 working days with tracking/.test(agreeSrc2));
// Assert the behaviour, not the source: call disputeRoute and check what it
// actually returns. A grep for the flag near the key was a proxy for that and
// a fragile one — it depended on how far the comment pushed the two apart.
const { disputeRoute: dr } = await import("./src/compliance/sellerRules.js");
check("the dispute route says there is no payment to hold, because there isn't",
  !/processor holds the payment/i.test(dr("AE").holdFunds) &&
  /paid her directly|nothing for anyone to hold|no payment/i.test(dr("AE").holdFunds));

section("50. The split did not change what either reader is told");

const { STRINGS: D2 } = await import("./src/i18n/strings.js");
const asym = Object.entries(D2).filter(([, v]) => {
  if (!v.ar) return false;
  const num = (x) => (x.match(/[0-9٠-٩]/g) || []).length;
  // a Latin word inside the Arabic field means the split cut in the wrong place
  if (/[A-Za-z]{4,}/.test(v.ar) && !/lili/i.test(v.ar)) return true;
  return /\(/.test(v.en) !== /\(/.test(v.ar) || (num(v.en) > 0) !== (num(v.ar) > 0);
});
check("neither language carries information the other does not",
  asym.length === 0, asym.slice(0, 3).map(([k]) => k).join(", "));
check("no comment was rewritten into a t() call by the migration",
  !/^\s*\/\/.*\bt\("/m.test(read("./src/discovery/ranking.js")) &&
  !/^\s*\/\/.*\bt\("/m.test(read("./src/offers/OffersPage.jsx")));

// ─────────────────────────────────────────────────────────────────────────────
section("51. The claims register — every promise, and the thing that makes it true");

// The seven escrow claims were each found by accident, one at a time, across
// three releases. Finding the eighth by accident is not a plan. `claims.js` is
// the list; this section is the rule that makes the list mean something.
const { CLAIMS, NEVER_CLAIM, unenforced, liveClaims, intendedClaims } =
  await import("./src/compliance/claims.js");

check("the register is not empty, and every entry names who is told",
  CLAIMS.length >= 13 && CLAIMS.every((c) => ["buyer", "seller", "both"].includes(c.to)));
check("every entry says what she reads, and what makes it true",
  CLAIMS.every((c) => c.says && c.says.length > 10 && c.how && c.how.length > 30));
check("no claim is enforced by nothing", unenforced().length === 0);

// The load-bearing one. Every enforcement reference is opened and read, so
// deleting the code behind a promise breaks the build instead of quietly
// turning the promise into a lie.
const missingEnforcement = [];
for (const c of CLAIMS) {
  for (const e of c.enforcedBy) {
    let src = "";
    try { src = read(`./${e.file}`); } catch { missingEnforcement.push(`${c.id}: no ${e.file}`); continue; }
    if (!new RegExp(`\\b${e.symbol}\\b`).test(src)) missingEnforcement.push(`${c.id}: ${e.file} has no ${e.symbol}`);
  }
}
check("every promise's enforcement exists in the file it names",
  missingEnforcement.length === 0);
if (missingEnforcement.length) missingEnforcement.slice(0, 5).forEach((m) => console.log(`      ${m}`));

// Writing this register found four entries whose enforcement I had named from
// memory and named wrongly. That is the whole argument for the check above.
check("what is only intended is kept out of the enforced list",
  intendedClaims().every((c) => c.state === "intended") &&
  liveClaims("seller").every((c) => c.state === "enforced"));
check("the 9% is intended, not enforced — there are no payouts to take it from",
  CLAIMS.find((c) => c.id === "seller-fee-9").state === "intended");

section("52. The sentences that must not appear while the thing behind them does not exist");

// Runs over every source file and every dictionary string, in both languages.
// claims.js itself is excluded, and has to be: an earlier honesty grep in this
// project matched its own advice and failed on the comment explaining it.
const allSrc = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const q = `${d}/${n}`;
    if (statSync(q).isDirectory()) walk(q);
    else if (/\.(js|jsx)$/.test(n) && !q.includes("compliance/claims.js")) allSrc.push(q);
  }
})("src");

const violations = [];
for (const f of allSrc) {
  const body = stripComments(readFileSync(f, "utf8"));
  for (const n of NEVER_CLAIM) {
    const m = body.match(n.re);
    if (m) violations.push(`${n.id} in ${f}: ${m[0].slice(0, 50)}`);
  }
}
// The dictionary is scanned separately, because a claim removed from a
// component can survive in the string it used to render — in either language.
const { STRINGS: D3 } = await import("./src/i18n/strings.js");
for (const [k, v] of Object.entries(D3)) {
  for (const n of NEVER_CLAIM) {
    if (n.re.test(v.en || "")) violations.push(`${n.id} in dictionary ${k} (en)`);
    if (n.re.test(v.ar || "")) violations.push(`${n.id} in dictionary ${k} (ar)`);
  }
}
// v2.11.3 — the store listing is scanned too, and it should have been from the
// start. Every check in this project pointed at the app; the Play description is
// read by more people than any screen in it, and it was carrying "Verified seller
// shops with ratings and reviews" and "Make an offer, or buy outright" — one
// promise nothing in the app can keep and one that nothing in it can even
// attempt. It lived in PLAY-STORE-CHECKLIST.md, which no scan opened.
//
// store/listing.md now holds the copy on its own, so the scan can read the whole
// file with no exclusions. It deliberately quotes none of the sentences it
// replaced: this project has three times written a check that matched the
// comment explaining it.
const storeCopy = existsSync("store/listing.md")
  ? readFileSync("store/listing.md", "utf8") : null;
for (const n of NEVER_CLAIM) {
  if (storeCopy && n.re.test(storeCopy)) violations.push(`${n.id} in store/listing.md`);
}
check("the store listing copy exists and is scanned like the app is",
  storeCopy !== null,
  "store/listing.md — the public text is user-facing text");

check("no forbidden claim survives anywhere in the source, the dictionary or the store listing",
  violations.length === 0);
if (violations.length) violations.slice(0, 6).forEach((v) => console.log(`      ${v}`));

check("the guard covers all seven claims that were actually found, plus the near misses",
  NEVER_CLAIM.length >= 8 && NEVER_CLAIM.every((n) => n.because && n.re instanceof RegExp));

// The three added in v2.11.3, named so that removing one is a deliberate act.
check("the lower-case forms of the verified-seller claim are covered too",
  ["seller-verified", "reviews-that-do-not-exist", "buy-outright"]
    .every((id) => NEVER_CLAIM.some((n) => n.id === id)),
  "verified-badge is case-sensitive by design; these catch what it lets through");

// ─────────────────────────────────────────────────────────────────────────────
section("53. A message reaches her, or you are told it did not");

// v2.8 rewired the messages SCREEN to real database threads. It did not rewire
// the entry point every "Message seller" and "Ask about these" button goes
// through, so a conversation started from a listing still lived in React state
// and the seller was never told. The screen looked identical either way, which
// is why it survived two releases.
check("the root component no longer holds a threads array",
  !/const \[messages,\s*setMessages\]/.test(market));
check("and no longer passes one into the messages screen",
  !/setMessages=\{setMessages\}/.test(market));
check("starting a conversation opens a real thread",
  /convo\.openConversation\(/.test(market));
check("and sends the opening line through it",
  /convo\.sendMessage\(/.test(market));
check("it does not send a second opening line into a conversation already underway",
  /existing\.length/.test(market) && /if \(!existing\.length\)/.test(market));
check("a refusal — a block, a beta gate — is shown rather than swallowed",
  /setMessageError/.test(market) && /error=\{messageError\}/.test(market));
check("the thread she asked about is the one that opens",
  /openThreadId/.test(market) && /findIndex/.test(market));

// The preview column. `last_body` does not exist; the trigger writes
// `last_message`, so every thread in the list rendered an empty line.
check("the thread list reads the column the database actually writes",
  /last_message/.test(market) && !/last_body/.test(market));

check("the device fallback fills the same preview fields",
  /last_message: text\.slice/.test(convoSrc));
check("and never answers on the seller's behalf",
  !/Yes, still available/i.test(convoSrc) && !/setTimeout/.test(convoSrc));

section("54. Nothing claims to know something it does not measure");

// A hard-coded boolean on six demo shops. Half of them were permanently
// "online" and every real seller — who has no such column — was permanently
// "Offline". A buyer waits differently for someone she has been told is there.
check("no seller is described as online, because nothing measures presence",
  !/shop\.online/.test(market) && !/shop\?\.online/.test(market));
check("and the demo shops no longer carry the flag",
  !/online:\s*(true|false)/.test(market));
check("the string is gone from the dictionary too, not just the component",
  !Object.keys(D3).includes("online"));

// The cart badge, after quantity was removed in v2.9.4.
check("the cart badge counts pieces rather than summing a field that no longer exists",
  !/cart\.reduce\(\(sum, i\) => sum \+ i\.qty/.test(market));

// ─────────────────────────────────────────────────────────────────────────────
section("55. The payment seam is a seam, not a screen");

// The reason this file exists at all is that every false claim this project has
// removed was born the same way: somebody built the SCREEN for a payment system
// before the payment system. So the one thing that matters here is that no
// component imports it.
const { paymentsUsable, blockers, READINESS, registerProcessor, getProcessor } =
  await import("./src/payments/processor.js");
const { COLLECTION_LIVE: LIVE } = await import("./src/data/fees.js");

check("no money can move, because there is nothing to move it with",
  paymentsUsable() === false && getProcessor() === null);
check("and the flag agrees", LIVE === false);
check("the dangerous combination is named rather than left to be discovered",
  READINESS.length >= 8 && READINESS.every((r) => r.what && r.why));

const uiFiles = allSrc.filter((f) => /\.jsx$/.test(f));
const importsPayments = uiFiles.filter((f) =>
  /from\s+["'][^"']*payments\/processor/.test(readFileSync(f, "utf8")));
check("no screen imports the payment seam",
  importsPayments.length === 0, importsPayments.join(", "));

// Every method refuses, and says which of the two failure states it is in.
let refused = null;
try { await (await import("./src/payments/processor.js")).authorize({ amount: 100 }); }
catch (e) { refused = e; }
check("calling one anyway is refused, with a reason a person can act on",
  refused && refused.code === "PAYMENTS_NOT_LIVE" && /no payment processor/i.test(refused.message));
check("a webhook signature that cannot be verified is not treated as verified",
  (await import("./src/payments/processor.js")).verifyWebhook("{}", "sig") === false);

// A half-built adapter is how release() becomes a no-op that reports success.
let rejectedPartial = false;
try { registerProcessor({ name: "half", licensedIn: "AE", authorize: () => {} }); }
catch { rejectedPartial = true; }
check("a half-implemented processor is refused rather than registered", rejectedPartial);
check("and refusing it left nothing registered", getProcessor() === null);

// ─────────────────────────────────────────────────────────────────────────────
section("56. Nothing is verified, and nothing says it is");

// The ninth false claim, and the worst of them: every listing detail rendered
// "✓ VERIFIED", unconditionally, while the listing flow two screens away said
// in as many words that verification was not available.
check("the badge that verified nothing is gone",
  !/function VerifiedBadge/.test(market) && !/<VerifiedBadge/.test(market));

const { authenticationAvailable, submitForAuthentication, sealVerdict, badgeFor,
        OUTCOMES, READINESS: AUTH_READY, registerAuthenticator, getAuthenticator } =
  await import("./src/trust/authentication.js");

check("nobody authenticates anything, and the module says so",
  authenticationAvailable() === false && getAuthenticator() === null);
check("submitting a piece is refused rather than silently doing nothing",
  await submitForAuthentication({ itemId: "x" }).then(() => false,
    (e) => e.code === "NO_AUTHENTICATOR" && /not the same thing/i.test(e.message)));
check("there is nothing for a screen to render",
  badgeFor({ outcome: "authentic", by: "someone", at: "now", basis: "photos" }) === null);

// The rule that stops the badge coming back in another form.
let unattributed = false;
try { sealVerdict({ outcome: "authentic" }); } catch { unattributed = true; }
check("a verdict with no author is refused", unattributed);
check("'inconclusive' is a first-class outcome, not a rounding error",
  !!OUTCOMES.inconclusive && OUTCOMES.inconclusive.showsAsItself === true);
check("a 'not genuine' verdict takes the listing down",
  OUTCOMES["not-authentic"].removesListing === true);
check("the commercial trap is written down before it is signed",
  AUTH_READY.some((r) => /inconclusive/i.test(r.what) || /inconclusive/i.test(r.why)));

let partialAuth = false;
try { registerAuthenticator({ name: "x" }); } catch { partialAuth = true; }
check("a half-implemented authenticator is refused", partialAuth && getAuthenticator() === null);

const authUi = allSrc.filter((f) => /\.jsx$/.test(f) &&
  /from\s+["'][^"']*trust\/authentication/.test(readFileSync(f, "utf8")));
check("no screen imports it while there is nobody behind it", authUi.length === 0);

// ─────────────────────────────────────────────────────────────────────────────
section("57. No permission is asked for a promise nobody can keep");

const push = await import("./src/notifications/push.js");

check("nothing sends notifications, and the module knows it",
  push.pushAvailable() === false && push.getSender() === null);

// The specific lie: prompt her, she taps Allow, a toggle shows on, and nothing
// is ever sent by anybody. She grants a real OS permission to a system that
// does not exist and stops opening the app.
check("asking the phone for permission is refused while there is nothing to send",
  await push.requestPermission().then(() => false, (e) => e.code === "PUSH_NOT_AVAILABLE"));
check("and so is registering a device",
  await push.registerDevice("t", "android").then(() => false, (e) => e.code === "PUSH_NOT_AVAILABLE"));

const st = push.status();
check("a screen asking what to say gets a sentence, not a toggle",
  st.available === false && /can't send notifications/i.test(st.say) && !!st.why);
check("and it does not say 'soon' about something unstarted",
  !/soon/i.test(st.say) && !/soon/i.test(st.why));

check("the lock-screen question is treated as a privacy decision, not plumbing",
  push.READINESS.some((r) => /lock/i.test(r.what) && /privacy/i.test(r.why)));
check("the server key is required to be on a server",
  push.READINESS.some((r) => /Edge Function, not the app/i.test(r.what)));

let partialSender = false;
try { push.registerSender({ name: "x", register: () => {} }); } catch { partialSender = true; }
check("a half-implemented sender is refused", partialSender && push.getSender() === null);

const pushUi = allSrc.filter((f) => /\.jsx$/.test(f) &&
  /from\s+["'][^"']*notifications\/push/.test(readFileSync(f, "utf8")));
check("no screen imports it, so no screen can prompt", pushUi.length === 0);

// ─────────────────────────────────────────────────────────────────────────────
section("58. Browsing needs no account, and the app says when writing does");


// The bug: initBackend() asked for a session FIRST and, when the project
// refused the kind of sign-in it asked for, fell all the way back to
// device-only. lili_items and lili_shops are readable by `anon`, so the app was
// hiding a catalogue it was allowed to read. Every install a private demo.
check("reading and writing are separate questions",
  /let remoteRead\b/.test(repoSrc) && /export const canRead/.test(repoSrc));
check("the catalogue is fetched on the read flag, not the write flag",
  /refreshCatalogue[\s\S]{0,400}?if \(!remoteRead\) return null;/.test(repoSrc));
check("search too", /if \(remoteRead && !fallbackItems\)/.test(repoSrc));
check("a session that cannot be obtained stops writes, not reads",
  /remoteRead = true;[\s\S]{0,900}?await remote\.ensureUser\(\)/.test(repoSrc));
check("and the reason is kept, in a form a screen can render",
  /export const writeBlocked/.test(repoSrc) && /SIGN_IN_UNAVAILABLE/.test(repoSrc));
check("signing in later switches writes on without a restart",
  /export async function adoptSession/.test(repoSrc));

// The regression the smoke suite caught while this was being written, kept.
check("an empty server catalogue does not wipe what the phone already holds",
  /if \(!items \|\| items\.length === 0\)/.test(repoSrc));
check("and does not retire the demo catalogue before there is a real one",
  /demoRetired[\s\S]{0,80}/.test(repoSrc) &&
  repoSrc.indexOf("if (!items || items.length === 0)") < repoSrc.lastIndexOf("K.demoRetired"));

// It has to be connected at boot, or none of the above happens.
check("the app connects on a cold start, without waiting for an account",
  /repo\.initBackend\(\)\s*\n?\s*\.catch/.test(market) &&
  !/await repo\.initBackend\(\)/.test(market.slice(market.indexOf("repo.bootstrap(ITEMS"), market.indexOf("repo.bootstrap(ITEMS") + 40)));
check("and connecting never blocks hydration — a saved badge that arrives late counts wrong",
  !/await connecting/.test(market));
check("and a failure to sign in no longer skips the catalogue pull",
  /if \(!live && !repo\.canRead\(\)\) return false;/.test(market));

// Said out loud, once, rather than left in a console line nobody reads.
check("she is told when nothing she does will reach anybody",
  /writeBlock && tab === "home"/.test(market) && /browsing_only_for_now/.test(market));
check("and offered the way out of it",
  /askToSignIn\(t\("sign_in_to_list_or_message"\)\)/.test(market));
check("both sentences are in the dictionary, not hard-coded",
  !!D3.browsing_only_for_now && !!D3.sign_in_to_list_or_message &&
  !!D3.browsing_only_for_now.ar && !!D3.sign_in_to_list_or_message.ar);

// ─────────────────────────────────────────────────────────────────────────────
section("59. The psychology, and the half of it this app refuses");

// "Apply UX psychology" and "manipulate a woman into buying a bag" describe the
// same literature. The line is: a technique may make a TRUE thing easier to see
// or act on; it may not manufacture a feeling the facts do not support.
const { IN_USE, REFUSED, unattached } = await import("./src/ux/persuasion.js");

check("every technique in use is attached to something true",
  IN_USE.length >= 8 && unattached().length === 0);
check("and each one names the law it comes from, so it can be argued with",
  IN_USE.every((t) => t.law && t.used && t.attachedTo));

// The same shape as NEVER_CLAIM: run the patterns over the source and the
// dictionary, in both languages. persuasion.js is excluded and has to be —
// it contains the patterns.
const darkHits = [];
for (const f of allSrc) {
  if (f.includes("ux/persuasion.js")) continue;
  const body = stripComments(readFileSync(f, "utf8"));
  for (const d of REFUSED) {
    const m = body.match(d.re);
    if (m) darkHits.push(`${d.id} in ${f}: ${m[0].slice(0, 40)}`);
  }
}
for (const [k, v] of Object.entries(D3)) {
  for (const d of REFUSED) {
    if (d.re.test(v.en || "")) darkHits.push(`${d.id} in dictionary ${k} (en)`);
    if (d.re.test(v.ar || "")) darkHits.push(`${d.id} in dictionary ${k} (ar)`);
  }
}
check("no dark pattern anywhere in the source or the dictionary", darkHits.length === 0);
if (darkHits.length) darkHits.slice(0, 5).forEach((h) => console.log(`      ${h}`));

check("the ones that were actually here are among the refused",
  REFUSED.some((d) => /Trusted by/i.test(d.because)) &&
  REFUSED.some((d) => /confirmshaming/i.test(d.because)));
// persuasion.js is excluded, and has to be: it holds the pattern. This is the
// third time in this project a rule has matched the text of the rule, and it
// is worth naming as a shape rather than a coincidence — an honesty check that
// reads the file describing the dishonesty will always find it there.
check("consent is never pre-given",
  REFUSED.some((d) => d.id === "pre-ticked") &&
  !/defaultChecked/.test(allSrc.filter((f) => !f.includes("ux/persuasion.js"))
    .map((f) => readFileSync(f, "utf8")).join("")));

section("60. The scale, measured rather than declared");

const scaleSrc = read("./src/theme/scale.js");
const { TYPE, SCALE: TYPE_SCALE, type: snapType, space: snapSpace } =
  await import("./src/theme/scale.js");

check("there is one declared type scale", TYPE.length >= 10 && TYPE_SCALE.length > TYPE.length);
check("snapping never returns something between two steps",
  TYPE_SCALE.includes(snapType(13.6)) && TYPE_SCALE.includes(snapType(8.2)));
check("a negative offset is left alone — it is a deliberate overlap, not spacing",
  snapSpace(-14) === -14 && snapSpace(9) === 8);

// The measured findings this release came from, kept so they cannot come back.
const styleFiles = allSrc.filter((f) => /\.jsx$/.test(f));
const halfSizes = [];
for (const f of styleFiles) {
  const body = stripComments(readFileSync(f, "utf8"));
  for (const m of body.matchAll(/fontSize:\s*([0-9]+\.[0-9]+)/g)) halfSizes.push(`${f}: ${m[1]}`);
}
check("no half-pixel type size is written anywhere", halfSizes.length === 0,
  halfSizes.slice(0, 4).join(", "));
check("a bare <button> is in the type system rather than at the browser default",
  /button\s*\{[^}]*font-size:\s*14px/.test(read("./src/index.css")));
check("in Arabic, an English sentence ends with its full stop on the right side",
  /\[dir="rtl"\] p,[\s\S]*?unicode-bidi:\s*plaintext;[\s\S]*?-webkit-match-parent/.test(read("./src/index.css")));
check("the category chips render one language, like the other 118 labels",
  /categoryLabel/.test(market) && !/CATS_AR\[c\]\?\s*`\s*·/.test(market));

// ─────────────────────────────────────────────────────────────────────────────
section("61. Names are printed as they were written");

// Three separate bugs, all in how a name reached the screen, all invisible in
// the source and obvious in a screenshot.

// 1. The app's own name. The wordmark's container is `display:inline-flex`,
//    which makes each run of text an anonymous flex item — and a flex item has
//    its leading and trailing whitespace stripped. "love " + <heart-i> came out
//    as "loveıt". The app was called "loveit or leaveit" on every screen.
check("the wordmark keeps its spaces, which inline-flex would otherwise strip",
  market.includes(String.raw`{"love\u00A0"}`) && market.includes(String.raw`{"t or leave\u00A0"}`));
check("and it is still one mark, not two words and two hearts",
  /HeartI/.test(market));

// 2. Shop names cut at an apostrophe. "Leen's Closet" showed as "Leen" and
//    "Haya's Collection" as "Haya" — a person's first name invented out of a
//    shop's name — while a name with no apostrophe hit a one-line clamp and
//    rendered as "The Vintage …". Two rules, disagreeing with each other and
//    with her.
check("no name is cut at its apostrophe", !/\.name\.split\("'"\)/.test(market));
check("no name is cut at its first space either", !/\.name\.split\(" "\)\[0\]/.test(market));
check("a shop name that needs two lines gets two",
  /WebkitLineClamp:\s*2/.test(market));

// 3. The category strip is overflowX:auto and its chips had no flexShrink:0,
//    so flex compressed them to fit the screen instead of scrolling and
//    nowrap pushed the text out through the pill.
check("chips in a scrolling strip keep their width",
  /flexShrink:0,\s*\n\s*cursor:"pointer",whiteSpace:"nowrap"/.test(market));

// ─────────────────────────────────────────────────────────────────────────────
section("62. Persuasion that helps her decide, and the taxonomy that is refused");

// The buyer-facing price context. Anchoring is the most powerful lever in this
// whole literature and the easiest to abuse: a struck-through number lili
// invented would move the same metric as a sourced range and would be a lie.
check("a buyer sees what pieces of this kind usually resell for",
  /function PriceContext/.test(market) && /<PriceContext item=\{item\}\/>/.test(market));
check("the anchor comes from the published band, not from a number this app made up",
  /PriceContext[\s\S]{0,900}referenceBand\(/.test(market));
check("and it renders nothing when the model has no opinion about the brand",
  /PriceContext[\s\S]{0,1200}if \(!band\) return null;/.test(market));
check("it says it is a guide rather than an appraisal",
  /not an appraisal of this piece/.test(market));

// The line that makes it information rather than a sales pitch. If any of these
// words appear in the component it has started telling her what to think about
// the number instead of showing her the number.
const priceBlock = (market.match(/function PriceContext[\s\S]*?\n}\n/) || [""])[0];
const verdicts = ["great deal", "bargain", "steal", "below market", "don't miss",
                  "worth every", "act fast", "best price"];
check("it shows the range and does not deliver a verdict on the price",
  verdicts.every((w) => !new RegExp(w, "i").test(priceBlock)),
  "no 'great deal' — a buyer who is told the number is good has been sold to");

// "Apply dark psychology" has a specific answer rather than an argument: the
// families are enumerated, each with the reason, and the build fails on them.
const DARK_FAMILIES = ["drip-pricing", "roach-motel", "forced-continuity", "obstruction",
                       "nagging", "friend-spam", "disguised-promotion", "bait-and-switch"];
check("the dark pattern taxonomy is named in full, not gestured at",
  DARK_FAMILIES.every((id) => REFUSED.some((d) => d.id === id)),
  `${REFUSED.length} refused patterns`);
check("and every one of them carries the reason it is refused",
  REFUSED.every((d) => d.because && d.because.length > 40));

// ─────────────────────────────────────────────────────────────────────────────
section("63. The icon set is lili's where it matters");

const iconSrc = readFileSync("src/icons/Icon.jsx", "utf8");
const iconPaths = {};
for (const m of iconSrc.matchAll(/^\s{2}([a-zA-Z_]+):\s*"([^"]+)"/gm)) iconPaths[m[1]] = m[2];

check("every declared icon name has a path", Object.keys(iconPaths).length >= 45);

// Two icons with the same path are one icon with two names, and the reader who
// sees them side by side reads the difference as meaning. `jewellery` and `gem`
// were both a faceted stone until v2.11.5.
const byPath = new Map();
const dupes = [];
for (const [n, d] of Object.entries(iconPaths)) {
  if (byPath.has(d)) dupes.push(`${byPath.get(d)} = ${n}`);
  else byPath.set(d, n);
}
check("no two icons are the same drawing under different names", dupes.length === 0,
  dupes.join(" · "));

// The garments are the ones that carry the brand — they are what a shopping app
// for clothes puts on every tile — and they are the ones that were stock.
const GARMENTS = ["dress", "abaya", "jacket", "top", "skirt", "heel", "bag",
                  "jewellery", "sunglass"];
check("every garment is drawn", GARMENTS.every((g) => iconPaths[g]));

// The two checks that were here — "is the path more than a rectangle" and "is
// the drawing taller than wide" — parsed the path string as alternating x,y
// numbers. That is not what path data is: a relative command shifts the origin
// and an elliptical arc carries seven parameters, two of which are flags. It
// reported the dress as 26 wide and 33 tall inside a 24 box, which is not a
// shape, and it would have failed a correct drawing while passing a wrong one.
//
// Geometry is measured on the rendered glyph in `npm run uxlaws`, using the
// browser's own getBBox. Same rule as everywhere else in this project: assert
// the property, not a proxy you cannot compute.

// Jakob's Law is measured in this project. The universal glyphs stay universal:
// distinctiveness goes on the clothes, not on the back button.
check("the conventional glyphs were left conventional",
  /search:\s+"M11 4a7 7 0 1 1 0 14/.test(iconSrc) && /back:\s+"M14\.5 5 7\.5 12l7 7"/.test(iconSrc),
  "a search icon nobody recognises is not a signature, it is a bug");

check("the set can be looked at, which is how these were drawn",
  existsSync("iconsheet.mjs") && /"iconsheet":/.test(readFileSync("package.json", "utf8")));

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${pass}/${pass + fail} passed`);
if (fail) {
  console.log("\nFailed:");
  failures.forEach((f) => console.log(`  · ${f}`));
  process.exit(1);
}
