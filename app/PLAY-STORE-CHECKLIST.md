# Play Store readiness

**Rewritten at v2.11.3.** The previous version described the app as it was at
v2.7 — "everything is a hardcoded JavaScript array", "there is no sign-in", "you
have no report flow", "512×512 icon and feature graphic in `store/`". None of
that was still true, and the last one never was. A checklist that misstates the
app is the same defect as a screen that misstates it, and this one was sitting
in the file you would read the night before submitting.

Every line below was checked against the built artefact or the live database on
the day it was written.

---

## Verified by `npm run audit` — 33 checks against the artefact, not the intent

**User-generated content** (the policy that rejects marketplaces): report a
listing, report a seller, block a seller, blocks applied everywhere rather than
on one screen, reports reaching a moderation queue, decisions carrying a
statement of reasons, decisions appealable, a repeat-infringer policy that
escalates, screening before a listing publishes.

**Privacy:** age gate, granular consent, marketing off by default, withdrawal
in-app, data export, in-app account deletion, the public deletion page Play
requires (`web/delete-account.html`), photo metadata stripped before storage.

**Commerce:** the seller named before the buy button, private vs business
disclosed, no funds held, no Play Billing for physical goods, prohibited items
enforced rather than listed, counterfeit price-floor wired up.

**Artefact:** target API 35, min API 23, package `com.loveitorleaveit.lili`, and
**one permission — `INTERNET`.** (`aapt2` also lists Capacitor's own
`DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, a framework internal rather than a
user-facing grant.) A short permission list is still the easiest way through
review.

---

## Blocking

### 1. Anonymous sign-in is off — and that alone is a Minimum Functionality rejection

`npm run preflight` reports it as the one blocker. What a reviewer meets today:

Browsing has been live without an account since v2.10.1, so the app opens onto a
catalogue. **Listing and messaging need an account, and there is no way to get
one** — anonymous sign-in is disabled and email confirmation has no SMTP behind
it. The reviewer can look and cannot transact, which is exactly the shape Google
rejects, arriving not from missing code but from a switch that is off.

Three ways out, in preflight's own order:

- Authentication → Providers → enable **Anonymous sign-ins**. Thirty seconds,
  and the app then needs no email at all.
- Authentication → Emails → configure your own SMTP.
- Turn off "Confirm email" for the beta.

### 2. Nothing to look at

Zero live listings. Every buyer's first screen — and every reviewer's — is the
empty state. Not a code problem: it is the thirty sellers in `SELLER-PLAYBOOK.md`
and the ten in `FIRST-TEN.md`.

### 3. No release artefact

`npm run apk` builds a **debug** APK for sideloading. The release APK and the
`.aab` Play takes need the upload keystore, which belongs to whoever owns the
listing and must never live in this repository.

---

## What the reviewer needs, which nothing here covered until now

A reviewer is a person with a phone and no context. Each item is a sentence you
write once.

- **Access.** If the beta gate is on when you submit, the review notes must carry
  a working account, or the gate must let the reviewer through. A reviewer who
  cannot get past a gate files a rejection, not a question.
- **The backend must be awake.** Supabase pauses inactive free projects. A paused
  project during review is an app that fails on first launch. Check the dashboard
  the morning you submit, and the morning of any resubmission.
- **Explain what is deliberately absent.** lili takes no payment and ships
  nothing. A reviewer who expects a checkout and finds none should read why in
  the notes rather than guess.
- **No placeholder content under review.** The demo catalogue is not the app. See
  blocker 2.
- **Version and build numbers correct.** v2.11.3 is `versionCode 6`.

The reviewer notes themselves are at the bottom of `store/listing.md`.

---

## Still needed for the listing itself

- Google Play Developer account — **$25 one-time**.
- **Identity verification.** Recently created individual accounts must verify ID
  *and* test with 12 people for 14 continuous days before public release. An
  organisation account (needs a D-U-N-S number) skips the 12-tester rule. For a
  Dubai business, register as an organisation: slower to set up, far faster to
  launch.
- **Privacy policy at a public URL.** Not a PDF, not a Google Doc.
- **Screenshots** — minimum 2, up to 8 per form factor. Needs a device.
- **Data safety form**, declaring every data type actually collected. The honest
  answer is long: account, photographs, messages, listings, saves, cart, events.
  Mismatches cause suspension.
- Content rating questionnaire; target audience 18+.
- **Store art.** `resources/` has the launcher icon. The 512×512 listing icon and
  1024×500 feature graphic have not been made — the previous version of this file
  claimed they were in `store/`, and `store/` did not exist.
- **Listing text** — written, honest, and checked: `store/listing.md`.

---

## Also open, and not Play's problem

Trade licence for marketplace activity; three legal drafts reviewed by UAE
counsel; Terms of Sale drafted so lili is not a party; Arabic legal translation
(which prevails over English for consumer terms); agent-vs-principal for VAT; a
CBUAE-licensed processor before anything claims money moves.

---

## If it is rejected

Not panic, and not a rebuild of unrelated parts.

1. Read the exact guideline cited and the reviewer's message, not a summary.
2. Reproduce it **on the submitted build**, under review conditions.
3. Ask for clarification in Play Console when the reason is genuinely unclear.
4. Fix the smallest complete issue.
5. Test that flow, then `npm run verify` for the regressions.
6. Reply saying what changed and where the reviewer can verify it.

A rejection names one thing. Changing five is how the second rejection arrives
with a different reason.
