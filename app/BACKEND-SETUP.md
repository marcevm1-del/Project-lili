# Turning the backend on

The code is written and tested. One file is missing, and only you can create it.

## What you do (about 30 minutes)

**1. Create the project** — console.firebase.google.com → Add project.
Pick the region deliberately: **europe-west** or a Gulf region for UAE data
residency. **It cannot be changed later.**

**2. Enable three things**
- Authentication → Sign-in method → **Anonymous** (and **Phone** for payouts)
- Firestore Database → Create → **Production mode**
- Storage → Create

**3. Copy the config** — Project settings → General → Your apps → Web app →
"SDK setup and configuration". Paste the six values into
`src/backend/config.js`. That's the switch.

**4. Deploy the rules and functions**
```bash
npm i -g firebase-tools
firebase login
firebase init            # choose Firestore + Functions, point at firebase/
firebase deploy --only firestore:rules,functions
```

**5. Make yourself a moderator** — decisions require a custom claim, so nobody
can grant it to themselves:
```bash
firebase functions:shell
# then:
admin.auth().setCustomUserClaims("YOUR_UID", { moderator: true })
```

**6. Rebuild** — `npm run verify && npm run apk`

## What happens then

Every device sees one catalogue. Until then the app runs entirely on-device and
behaves exactly as it does now — an empty config means local mode, not a broken
app.

## What's already written

| Piece | Where |
|---|---|
| Auth, items, shops, follows, images, moderation | `src/backend/remote.js` |
| The switch, with offline fallback | `src/data/repo.js` → `initBackend()` |
| Security rules | `firebase/firestore.rules` |
| Server-side screening + decisions | `firebase/functions/index.js` |

**Anonymous auth first, on purpose.** A shopper should never hit a sign-in wall
just to look. Identity is required at the point it matters — the first payout.

**The rules are the security model.** Anyone can call the API directly, so
every rule the app relies on is enforced again server-side: a client cannot
publish a listing (it arrives `pending` and a Function decides), cannot read the
moderation queue, cannot touch the audit trail, and cannot award itself
followers or clear its own strikes.

**Screening runs twice.** The copy in `listingRules.js` gives a seller feedback
while she types. `screenNewListing` is the one that decides. If you change one,
change both.

## The honest caveat

I could not run any of this against real Firebase — that needs your project.
The logic is written to the contract and its switching is tested (16 checks in
`npm run smoke`), but the first real connection is yours. Expect to spend an
hour on rules adjustments; that is normal and the rules file is commented
throughout.

## Still not built

Payments. That waits on the trade licence and a CBUAE-licensed processor — see
`lili-costs-and-plan.pdf`. Nothing in this repo can shorten that path.
