# lili — ten options to reach launch in 10 days

Written 29 Aug 2026, against build v2.8. Companion to `UPGRADE-v2.8.md` in the source tree.

## The premise

In 10 days you cannot launch a marketplace that moves money. Payments run
trade licence → corporate bank account → CBUAE-licensed processor, and that is
6–10 weeks with nothing in the code able to shorten it.

You can launch a marketplace that makes **introductions**: browse, message,
haggle, agree, meet, pay each other. That is how Gulf resale runs on Instagram
today, and it is what the app already does well. Every option below assumes
that choice unless you overrule it.

---

## 1 · Decide what "launch" means — transactions or introductions
**Half a day. Founder decision. Everything else depends on it.**

If introductions: remove the cart and checkout, and remove the "lili takes 10%
when your piece sells" line. You cannot take 10% of a sale you do not process,
and a fee displayed without a rail behind it is the same class of claim as the
"4.9 from 2,000+ reviews" that came out in v2.8. Replace it with what is true:
free while there are no payments, and here is what we will charge when there
are.

## 2 · Start the Play Store clock today
**Highest calendar risk in the list.**

New **personal** Google Play developer accounts must run closed testing with 12
testers opted in for 14 continuous days before they get production access —
longer than the entire runway. **Organization** accounts (requires a D-U-N-S
number) are reported to be exempt. Verify this in your own Play Console before
anything else; if you are on a personal account, day 10 is a TestFlight / direct
APK / web launch, not a Play launch.

## 3 · Port the v2.8 screening rules into the database
**1 day, dev. Non-negotiable before anyone lists.**

The client now uses brand-tier × category × condition bands. The trigger still
enforces the v2.7 per-brand floors. They disagree and the server wins, so a real
seller listing Celine sunglasses at AED 800 is still flagged as a possible
counterfeit on insert. `src/data/resaleValue.js` is deliberately plain data with
no React so it ports directly.

## 4 · The one hour of server config that decides whether launch day works
**1 hour. Four items, each one a launch-day outage if skipped.**

- Google redirect URL `com.loveitorleaveit.lili://auth-callback`
- Real SMTP (Resend/SendGrid). The built-in sender does ~3 emails an hour — a
  busy Saturday stops sign-ups silently
- Leaked-password protection toggle (the client check is not a control)
- **The moderator claim on your own account.** Without it nobody can action a
  single report. Reports arrive in a queue no human can open.

## 5 · Get lili out of the shared Supabase project — or accept the risk in writing
**1 day to move, 0 to decide. Irreversible either way.**

`public` also holds a journalling/forum app with real users and seven
`SECURITY DEFINER` functions any signed-in user can call, including
`admin_suspend_user`. Your sellers become signed-in users of that project.
Separately: the region is Stockholm and **cannot be changed after creation**.
Mumbai is ~40 ms from Dubai against Stockholm's ~120 ms, with a weaker adequacy
argument under PDPL. Decide before there is real data, or never.

## 6 · Thirty sellers with real photographs
**7–8 days of your time, not dev time. The highest-value item here.**

30 women × 5 pieces = 150 listings. By hand, invite-only, curated. A resale app
with no listings is dead on arrival and no feature fixes it. The differentiator
was always cultural — who is invited first and what is refused — and that is
work only you can do.

## 7 · Build the trust layer that replaces escrow
**2 days.**

With no payment rail, safety at handover *is* the product: meet-in-public
guidance inside the thread, a verified phone number before listing, the fact
that messages cannot be edited and stand as evidence, and a report button in the
conversation itself. This also forces the open decision from the go-live
checklist: **moderators currently cannot read a reported conversation, because
nothing can.** Harassment reports are unreviewable until that gets a deliberate,
narrow, audited path.

## 8 · Settle the iOS question
**0 or 2 days.**

It has never run on a real iPhone, and iOS is WebKit — safe areas, momentum
scroll and keyboard behaviour all differ. Either borrow a Mac for a day and get
it into TestFlight, or launch Android + web and say so publicly. What you cannot
do is assume it works.

## 9 · Make the legal set real, in Arabic
**2 days plus counsel.**

Platform Terms and Seller Terms are drafts. UAE consumer terms need Arabic. The
AE market is still `status: "waitlist"` in `markets.js`, and flipping it is a
licence question rather than a code one. Also fold the "no payments yet" framing
into the seller agreement so the document describes the product that exists —
v2.8 already fixed one clause promising an authentication step that does not.

## 10 · Instrument the funnel, behind consent
**1 day.**

Gate screen → sign-up → first listing → first message → first offer. Without it
you will finish launch week knowing nothing about where people stopped. PDPL is
opt-in, so it sits behind the consent flow the app already handles correctly.

---

## What not to do in these 10 days

Push notifications, a recommendation algorithm, stories or live selling, and
chasing an authentication partner. All of them are real work; none of them is
between you and a launch.

## A shape for the 10 days

| Days | |
|---|---|
| 1 | Decisions 1, 2, 5, 8. Play Console checked. Server config done (4). |
| 2–3 | Screening ported to the database (3). Fee and checkout copy corrected (1). |
| 2–10 | Seller recruitment, continuously (6) — the long pole. |
| 4–5 | Trust layer (7). |
| 4–6 | Legal set and Arabic review (9), in parallel with counsel. |
| 7 | Instrumentation (8→10). |
| 8 | Full `npm run verify`, a real device pass, and a soft open to the 30 sellers only. |
| 9–10 | Fix what the 30 sellers break. Open the door. |

The three that will actually decide it: the Play Store clock, the thirty
sellers, and whether the moderator claim is set before the first report arrives.
